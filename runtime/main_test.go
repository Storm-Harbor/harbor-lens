package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"os/signal"
	"reflect"
	"strings"
	"sync"
	"syscall"
	"testing"
	"time"
)

const validAccess = `{"status":200,"bytes":42,"seconds":0.002,"correlation":"0123456789abcdef0123456789abcdef"}`

func events(t *testing.T, buffer *bytes.Buffer) []event {
	t.Helper()
	var result []event
	for _, line := range strings.Split(strings.TrimSpace(buffer.String()), "\n") {
		if line == "" {
			continue
		}
		var item event
		if err := json.Unmarshal([]byte(line), &item); err != nil {
			t.Fatal(err)
		}
		if item.Service != "harbor-lens" || item.Revision == "" || item.Time == "" || item.Severity == "" || item.Code == "" {
			t.Fatalf("Incomplete event: %+v", item)
		}
		if _, err := time.Parse(time.RFC3339Nano, item.Time); err != nil {
			t.Fatal(err)
		}
		result = append(result, item)
	}
	return result
}

func TestAccessPrivacyAndValidation(t *testing.T) {
	invalid := []string{
		`not json secret=password`, `{}`, `null`, validAccess + `{}`,
		strings.Replace(validAccess, `"status":200`, `"status":99`, 1),
		strings.Replace(validAccess, `"status":200`, `"status":600`, 1),
		strings.Replace(validAccess, `"bytes":42`, `"bytes":1073741825`, 1),
		strings.Replace(validAccess, `"bytes":42`, `"bytes":-1`, 1),
		strings.Replace(validAccess, `"seconds":0.002`, `"seconds":-1`, 1),
		strings.Replace(validAccess, `"seconds":0.002`, `"seconds":86401`, 1),
		strings.Replace(validAccess, `"seconds":0.002`, `"seconds":1e9999`, 1),
		strings.Replace(validAccess, `0123456789abcdef0123456789abcdef`, `customer-private-id`, 1),
		strings.Replace(validAccess, `"status":200`, `"url":"/private?password=secret","status":200`, 1),
		strings.Replace(validAccess, `"status":200`, `"authorization":"Bearer secret","status":200`, 1),
	}
	var buffer bytes.Buffer
	log := &logger{out: &buffer, revision: "lens-00001-safe"}
	log.consume(strings.NewReader("\n  \n"+validAccess+"\n"+strings.Join(invalid, "\n")), false)
	got := events(t, &buffer)
	if len(got) != len(invalid)+1 || got[0].Code != "STATIC_HTTP_RESPONSE" || got[0].HTTP.Status != 200 || got[0].HTTP.Correlation != "0123456789abcdef0123456789abcdef" {
		t.Fatalf("Unexpected access result: %+v", got)
	}
	for _, item := range got[1:] {
		if item.Code != "STATIC_LOG_REJECTED" || item.HTTP != nil || item.Severity != "WARNING" {
			t.Fatalf("Untrusted event: %+v", item)
		}
	}
	for _, secret := range []string{"password", "private", "Bearer", "customer", "authorization"} {
		if strings.Contains(buffer.String(), secret) {
			t.Fatalf("Leaked field: %s", secret)
		}
	}
}

func TestNativeDiagnosticsNeverExposeBodies(t *testing.T) {
	var buffer bytes.Buffer
	log := &logger{out: &buffer, revision: "local"}
	for _, level := range []string{"warn", "error", "crit", "alert", "emerg"} {
		log.consume(strings.NewReader("2026/11/17 12:00:00 ["+level+"] 1#1: secret token request /private?password=secret\n"), true)
	}
	log.consume(strings.NewReader("nginx: [emerg] secret path\n"), true)
	got := events(t, &buffer)
	if len(got) != 6 || got[0].Severity != "WARNING" {
		t.Fatal(got)
	}
	for _, item := range got[1:] {
		if item.Severity != "ERROR" || item.HTTP != nil {
			t.Fatal(item)
		}
	}
	if strings.Contains(buffer.String(), "secret") || strings.Contains(buffer.String(), "private") {
		t.Fatal("Native content leaked")
	}
}

type trackedReader struct {
	*strings.Reader
	exhausted bool
}

func (r *trackedReader) Read(p []byte) (int, error) {
	n, err := r.Reader.Read(p)
	if err == io.EOF {
		r.exhausted = true
	}
	return n, err
}

func TestOversizedAndBrokenStreamsAreBoundedAndDrained(t *testing.T) {
	for _, diagnostic := range []bool{false, true} {
		var buffer bytes.Buffer
		input := &trackedReader{Reader: strings.NewReader(strings.Repeat("secret", 2000) + "\n" + validAccess + "\n")}
		(&logger{out: &buffer, revision: "local"}).consume(input, diagnostic)
		got := events(t, &buffer)
		if len(got) != 2 || got[0].Code != "STATIC_LOG_REJECTED" || !input.exhausted || strings.Contains(buffer.String(), "secret") {
			t.Fatal(got, input.exhausted)
		}
	}
	var buffer bytes.Buffer
	(&logger{out: &buffer, revision: "local"}).consume(errorReader{}, false)
	if got := events(t, &buffer); len(got) != 1 || got[0].Code != "STATIC_LOG_REJECTED" {
		t.Fatal(got)
	}
}

type errorReader struct{}

func (errorReader) Read([]byte) (int, error) { return 0, errors.New("private input failure") }

func TestConcurrentStreamsRemainSeparateJSONEvents(t *testing.T) {
	var buffer bytes.Buffer
	log := &logger{out: &buffer, revision: "local"}
	var group sync.WaitGroup
	for range 10 {
		group.Go(func() { log.consume(strings.NewReader(validAccess+"\n"), false) })
	}
	group.Wait()
	if len(events(t, &buffer)) != 10 {
		t.Fatal(buffer.String())
	}
}

func TestDefaultRuntimeBoundary(t *testing.T) {
	t.Setenv("K_REVISION", "lens-00001-safe")
	config := defaultRuntime()
	defer config.stop()
	if config.command.Path != "/usr/sbin/nginx" || !reflect.DeepEqual(config.command.Args[1:], []string{"-c", "/etc/nginx/nginx.conf", "-e", "/dev/stderr", "-g", "daemon off;"}) || config.out != os.Stdout || config.revision != "lens-00001-safe" || config.shutdown == nil || config.pipe == nil || config.deadline() == nil {
		t.Fatal("Invalid fixed runtime boundary")
	}
}

// Isolated native subprocess fixtures complement the actual Nginx Docker test.
func TestChild(t *testing.T) {
	mode := os.Getenv("HARBOR_LENS_TEST_CHILD")
	if mode == "" {
		return
	}
	switch mode {
	case "failure":
		os.Exit(4)
	case "graceful":
		quit := make(chan os.Signal, 1)
		signal.Notify(quit, syscall.SIGQUIT)
		fmt.Println(validAccess)
		<-quit
	case "ignore":
		signal.Ignore(syscall.SIGQUIT)
		fmt.Println(validAccess)
		for {
			time.Sleep(time.Hour)
		}
	case "descendant":
		child := exec.Command(os.Args[0], "-test.run=^TestChild$")
		child.Env = append(os.Environ(), "HARBOR_LENS_TEST_CHILD=ignore")
		child.Stdout, child.Stderr = os.Stdout, os.Stderr
		if child.Start() != nil {
			os.Exit(9)
		}
	case "success":
		fmt.Println(validAccess)
	default:
		os.Exit(8)
	}
	os.Exit(0)
}

type readyWriter struct {
	bytes.Buffer
	ready chan struct{}
	once  sync.Once
}

func (w *readyWriter) Write(p []byte) (int, error) {
	n, err := w.Buffer.Write(p)
	if bytes.Contains(p, []byte(`"code":"STATIC_HTTP_RESPONSE"`)) {
		w.once.Do(func() { close(w.ready) })
	}
	return n, err
}

func fixtureConfig(t *testing.T, mode string, out io.Writer) runtimeConfig {
	t.Helper()
	command := exec.Command(os.Args[0], "-test.run=^TestChild$")
	command.Env = append(os.Environ(), "HARBOR_LENS_TEST_CHILD="+mode, "GORACE=atexit_sleep_ms=0")
	t.Cleanup(func() {
		if command.Process != nil {
			_ = syscall.Kill(-command.Process.Pid, syscall.SIGKILL)
		}
	})
	return runtimeConfig{command: command, shutdown: make(chan os.Signal), stop: func() {}, deadline: func() <-chan time.Time { return time.After(100 * time.Millisecond) }, out: out, revision: "private\nINVALID", pipe: os.Pipe}
}

func TestProcessExitAndStartupFailures(t *testing.T) {
	for _, mode := range []string{"success", "failure", "missing"} {
		t.Run(mode, func(t *testing.T) {
			var buffer bytes.Buffer
			config := fixtureConfig(t, mode, &buffer)
			if mode == "missing" {
				config.command = exec.Command("/nonexistent/harbor-lens-test")
			}
			status := run(config)
			if (status == 0) != (mode == "success") {
				t.Fatal(status)
			}
			got := events(t, &buffer)
			for _, item := range got {
				if item.Revision != "local" {
					t.Fatal("Unvalidated revision")
				}
			}
			last := got[len(got)-1].Code
			if mode == "missing" && last != "STATIC_START_FAILED" || mode == "failure" && last != "STATIC_EXIT_FAILED" {
				t.Fatal(got)
			}
		})
	}
}

func TestGracefulAndForcedShutdown(t *testing.T) {
	for _, mode := range []string{"graceful", "ignore"} {
		t.Run(mode, func(t *testing.T) {
			out := &readyWriter{ready: make(chan struct{})}
			config := fixtureConfig(t, mode, out)
			shutdown := make(chan os.Signal, 1)
			config.shutdown = shutdown
			result := make(chan int, 1)
			go func() { result <- run(config) }()
			select {
			case <-out.ready:
			case <-time.After(5 * time.Second):
				t.Fatal("Child not ready")
			}
			shutdown <- syscall.SIGTERM
			var status int
			select {
			case status = <-result:
			case <-time.After(5 * time.Second):
				t.Fatal("Shutdown not bounded")
			}
			if (status == 0) != (mode == "graceful") {
				t.Fatal(status)
			}
			got := events(t, &out.Buffer)
			if !strings.Contains(out.String(), "STATIC_SHUTDOWN_STARTED") || (mode == "ignore" && !strings.Contains(out.String(), "STATIC_SHUTDOWN_TIMEOUT")) || len(got) < 3 {
				t.Fatal(got)
			}
		})
	}
}

func TestInheritedPipeAndAllocationFailures(t *testing.T) {
	var buffer bytes.Buffer
	if run(fixtureConfig(t, "descendant", &buffer)) != 0 {
		t.Fatal(buffer.String())
	}
	if !strings.Contains(buffer.String(), "STATIC_PROCESS_STOPPED") {
		t.Fatal(buffer.String())
	}
	for _, failureAt := range []int{1, 2} {
		buffer.Reset()
		config := fixtureConfig(t, "success", &buffer)
		count := 0
		config.pipe = func() (*os.File, *os.File, error) {
			count++
			if count == failureAt {
				return nil, nil, errors.New("private pipe error")
			}
			return os.Pipe()
		}
		if run(config) != 1 {
			t.Fatal("Pipe failure succeeded")
		}
		got := events(t, &buffer)
		if len(got) != 1 || got[0].Code != "STATIC_PIPE_FAILED" {
			t.Fatal(got)
		}
	}
}

// Harbor Lens' static-process supervisor owns packaging, logs and shutdown only.
// Product APIs, identity, collectors and orchestration remain in control-plane.
package main

import (
	"bufio"
	"bytes"
	"encoding/json"
	"io"
	"math"
	"os"
	"os/exec"
	"os/signal"
	"regexp"
	"sync"
	"syscall"
	"time"
)

var revisionPattern = regexp.MustCompile(`^[a-z0-9][a-z0-9-]{0,127}$`)
var correlationPattern = regexp.MustCompile(`^[a-f0-9]{32}$`)
var diagnosticPattern = regexp.MustCompile(`^\d{4}/\d{2}/\d{2} \d{2}:\d{2}:\d{2} \[(warn|error|crit|alert|emerg)\] \d+#\d+: `)

type access struct {
	Status      int     `json:"status"`
	Bytes       uint64  `json:"bytes"`
	Seconds     float64 `json:"seconds"`
	Correlation string  `json:"correlation"`
}

type event struct {
	Time     string  `json:"time"`
	Severity string  `json:"severity"`
	Service  string  `json:"service"`
	Revision string  `json:"revision"`
	Code     string  `json:"code"`
	HTTP     *access `json:"http,omitempty"`
}

type logger struct {
	mu       sync.Mutex
	out      io.Writer
	revision string
}

func (l *logger) emit(severity, code string, request *access) {
	l.mu.Lock()
	defer l.mu.Unlock()
	// All strings except the validated revision/correlation are fixed codes.
	// Native diagnostic content and unvalidated request fields are never copied.
	_ = json.NewEncoder(l.out).Encode(event{
		Time: time.Now().UTC().Format(time.RFC3339Nano), Severity: severity,
		Service: "harbor-lens", Revision: l.revision, Code: code, HTTP: request,
	})
}

func (l *logger) consume(input io.Reader, diagnostic bool) {
	reader := bufio.NewReaderSize(input, 2048)
	for {
		line, prefix, err := reader.ReadLine()
		if err != nil {
			if err != io.EOF {
				l.emit("WARNING", "STATIC_LOG_REJECTED", nil)
			}
			return
		}
		if prefix {
			// Discard only this oversized line, retaining subsequent events.
			for prefix && err == nil {
				_, prefix, err = reader.ReadLine()
			}
			l.emit("WARNING", "STATIC_LOG_REJECTED", nil)
			if err != nil {
				return
			}
			continue
		}
		if len(bytes.TrimSpace(line)) == 0 {
			continue
		}
		if diagnostic {
			severity := "ERROR"
			if match := diagnosticPattern.FindSubmatch(line); len(match) > 0 && string(match[1]) == "warn" {
				severity = "WARNING"
			}
			l.emit(severity, "STATIC_PROCESS_DIAGNOSTIC", nil)
			continue
		}
		var request access
		decoder := json.NewDecoder(bytes.NewReader(line))
		decoder.DisallowUnknownFields()
		if decoder.Decode(&request) != nil || decoder.Decode(new(any)) != io.EOF ||
			request.Status < 100 || request.Status > 599 || request.Bytes > 1<<30 ||
			request.Seconds < 0 || request.Seconds > 86400 || math.IsNaN(request.Seconds) || math.IsInf(request.Seconds, 0) ||
			!correlationPattern.MatchString(request.Correlation) {
			l.emit("WARNING", "STATIC_LOG_REJECTED", nil)
			continue
		}
		l.emit("INFO", "STATIC_HTTP_RESPONSE", &request)
	}
}

type runtimeConfig struct {
	command  *exec.Cmd
	shutdown <-chan os.Signal
	stop     func()
	deadline func() <-chan time.Time
	out      io.Writer
	revision string
	pipe     func() (*os.File, *os.File, error)
}

func defaultRuntime() runtimeConfig {
	shutdown := make(chan os.Signal, 1)
	signal.Notify(shutdown, syscall.SIGTERM, syscall.SIGINT)
	return runtimeConfig{
		command:  exec.Command("/usr/sbin/nginx", "-c", "/etc/nginx/nginx.conf", "-e", "/dev/stderr", "-g", "daemon off;"),
		shutdown: shutdown, stop: func() { signal.Stop(shutdown) },
		deadline: func() <-chan time.Time { return time.After(8 * time.Second) },
		out:      os.Stdout, revision: os.Getenv("K_REVISION"),
		pipe: os.Pipe,
	}
}

func run(config runtimeConfig) int {
	defer config.stop()
	revision := config.revision
	if !revisionPattern.MatchString(revision) {
		revision = "local"
	}
	log := &logger{out: config.out, revision: revision}
	// Pipes created here are owned and closed by this process. Reader completion
	// is bounded even if a misbehaving child retains an inherited descriptor.
	stdoutReader, stdoutWriter, err := config.pipe()
	if err != nil {
		log.emit("ERROR", "STATIC_PIPE_FAILED", nil)
		return 1
	}
	defer stdoutReader.Close()
	defer stdoutWriter.Close()
	stderrReader, stderrWriter, err := config.pipe()
	if err != nil {
		log.emit("ERROR", "STATIC_PIPE_FAILED", nil)
		return 1
	}
	defer stderrReader.Close()
	defer stderrWriter.Close()
	config.command.Stdout, config.command.Stderr = stdoutWriter, stderrWriter
	config.command.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	if config.command.Start() != nil {
		log.emit("ERROR", "STATIC_START_FAILED", nil)
		return 1
	}
	_ = stdoutWriter.Close()
	_ = stderrWriter.Close()
	var streams sync.WaitGroup
	streams.Add(2)
	go func() { defer streams.Done(); log.consume(stdoutReader, false) }()
	go func() { defer streams.Done(); log.consume(stderrReader, true) }()
	drained := make(chan struct{})
	go func() { streams.Wait(); close(drained) }()
	defer func() {
		select {
		case <-drained:
		case <-time.After(time.Second):
			_ = stdoutReader.Close()
			_ = stderrReader.Close()
			<-drained
		}
	}()
	log.emit("INFO", "STATIC_PROCESS_STARTED", nil)
	done := make(chan error, 1)
	go func() { done <- config.command.Wait() }()
	finish := func(err error) int {
		if err != nil {
			log.emit("ERROR", "STATIC_EXIT_FAILED", nil)
			return 1
		}
		log.emit("INFO", "STATIC_PROCESS_STOPPED", nil)
		return 0
	}
	select {
	case err := <-done:
		return finish(err)
	case <-config.shutdown:
		log.emit("INFO", "STATIC_SHUTDOWN_STARTED", nil)
		_ = config.command.Process.Signal(syscall.SIGQUIT)
		select {
		case err := <-done:
			return finish(err)
		case <-config.deadline():
			log.emit("ERROR", "STATIC_SHUTDOWN_TIMEOUT", nil)
			_ = syscall.Kill(-config.command.Process.Pid, syscall.SIGKILL)
			<-done
			return 1
		}
	}
}

func main() { os.Exit(run(defaultRuntime())) }

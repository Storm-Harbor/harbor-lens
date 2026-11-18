import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export function acceptanceTarget(env) {
  const project = env.HARBOR_LENS_QA_PROJECT;
  if (!/^harbor-lens-(ci|runtime-qa(?:-[a-z0-9]+)?)$/.test(project ?? ""))
    throw new Error("Refusing an unowned QA Compose project");
  const origin = new URL(env.LENS_TEST_ORIGIN);
  if (
    origin.protocol !== "http:" ||
    origin.hostname !== "127.0.0.1" ||
    !origin.port ||
    origin.username ||
    origin.password ||
    origin.pathname !== "/" ||
    origin.search ||
    origin.hash
  )
    throw new Error("Runtime acceptance requires an explicit loopback origin");
  return { project, origin };
}

function docker(args) {
  const result = spawnSync("docker", args, {
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    encoding: "utf8",
    timeout: 15_000,
    maxBuffer: 8 * 1024 * 1024,
  });
  if (result.error || result.status !== 0)
    throw new Error(`Owned runtime acceptance: Docker ${args[0]} failed`);
  return (
    args[0] === "logs" ? `${result.stdout}\n${result.stderr}` : result.stdout
  ).trim();
}

function inspect(id) {
  assert.match(id, /^[a-f0-9]{64}$/);
  return JSON.parse(docker(["inspect", id]))[0];
}

const codes = new Set([
  "STATIC_HTTP_RESPONSE",
  "STATIC_LOG_REJECTED",
  "STATIC_PROCESS_DIAGNOSTIC",
  "STATIC_PIPE_FAILED",
  "STATIC_START_FAILED",
  "STATIC_PROCESS_STARTED",
  "STATIC_EXIT_FAILED",
  "STATIC_PROCESS_STOPPED",
  "STATIC_SHUTDOWN_STARTED",
  "STATIC_SHUTDOWN_TIMEOUT",
]);

function events(id, canary) {
  const raw = docker(["logs", id]);
  assert.equal(
    raw.includes(canary),
    false,
    "Private request/diagnostic content leaked",
  );
  return raw
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const event = JSON.parse(line);
      assert.deepEqual(
        Object.keys(event).sort(),
        [
          ...["time", "severity", "service", "revision", "code"],
          ...(event.http ? ["http"] : []),
        ].sort(),
      );
      assert.equal(event.service, "harbor-lens");
      assert.match(event.revision, /^[a-z0-9][a-z0-9-]{0,127}$/);
      assert.equal(Number.isNaN(Date.parse(event.time)), false);
      assert.ok(["INFO", "WARNING", "ERROR"].includes(event.severity));
      assert.ok(codes.has(event.code));
      if (event.http) {
        assert.deepEqual(Object.keys(event.http).sort(), [
          "bytes",
          "correlation",
          "seconds",
          "status",
        ]);
        assert.match(event.http.correlation, /^[a-f0-9]{32}$/);
        assert.ok(
          Number.isInteger(event.http.status) &&
            event.http.status >= 100 &&
            event.http.status <= 599,
        );
        assert.ok(Number.isFinite(event.http.bytes) && event.http.bytes >= 0);
        assert.ok(
          Number.isFinite(event.http.seconds) && event.http.seconds >= 0,
        );
      }
      return event;
    });
}

export async function checkRuntime(env) {
  const { project, origin } = acceptanceTarget(env);
  const id = docker([
    "compose",
    "--project-name",
    project,
    "ps",
    "--quiet",
    "lens",
  ]);
  const container = inspect(id);
  assert.equal(container.Config.Labels["com.docker.compose.project"], project);
  assert.equal(container.Config.Labels["com.docker.compose.service"], "lens");
  assert.equal(container.Config.User, "65532:65532");
  assert.equal(container.HostConfig.ReadonlyRootfs, true);
  assert.ok(
    container.NetworkSettings.Ports["8080/tcp"]?.some(
      (binding) =>
        binding.HostIp === "127.0.0.1" && binding.HostPort === origin.port,
    ),
    "The loopback origin must belong to this owned QA container",
  );
  assert.deepEqual(container.Config.Entrypoint, [
    "/usr/bin/harbor-lens-runtime",
  ]);
  assert.equal(container.Config.StopSignal, "SIGTERM");
  const canary = "runtime-private-canary-43a9";
  for (const [path, status] of [
    ["/healthz", 200],
    ["/journeys", 200],
    [`/assets/${canary}.js?credential=${canary}`, 404],
    [`/api/${canary}`, 404],
  ]) {
    const response = await fetch(new URL(path, origin), {
      headers: { authorization: `Bearer ${canary}` },
      redirect: "error",
      signal: AbortSignal.timeout(5000),
    });
    assert.equal(response.status, status);
    await response.arrayBuffer();
  }
  const notices = await fetch(new URL("/THIRD_PARTY_NOTICES.txt", origin), {
    signal: AbortSignal.timeout(5000),
  });
  assert.equal(notices.status, 200);
  assert.ok(
    (await notices.text()).includes(
      "Go runtime standard library (BSD-3-Clause)",
    ),
  );
  const active = events(id, canary);
  assert.ok(active.some((event) => event.http?.status === 404));
  assert.ok(active.some((event) => event.http?.status === 200));

  docker(["stop", "--time", "10", id]);
  assert.equal(inspect(id).State.ExitCode, 0);
  const stopped = events(id, canary);
  assert.ok(stopped.some((event) => event.code === "STATIC_SHUTDOWN_STARTED"));
  assert.ok(stopped.some((event) => event.code === "STATIC_PROCESS_STOPPED"));

  const temporary = mkdtempSync(join(tmpdir(), "harbor-lens-runtime-qa-"));
  const configuration = join(temporary, "invalid-nginx.conf");
  writeFileSync(configuration, `${canary} invalid;\n`);
  assert.equal(configuration.includes(","), false);
  let failed;
  try {
    failed = docker([
      "create",
      "--name",
      `${project}-invalid-nginx`,
      "--label",
      `harbor-lens.qa.project=${project}`,
      "--read-only",
      "--cap-drop=ALL",
      "--security-opt=no-new-privileges:true",
      "--memory=128m",
      "--cpus=1",
      "--pids-limit=128",
      "--tmpfs",
      "/tmp:rw,noexec,nosuid,size=32m,mode=1777",
      "--mount",
      `type=bind,src=${configuration},dst=/etc/nginx/nginx.conf,readonly`,
      container.Image,
    ]);
    assert.equal(
      inspect(failed).Config.Labels["harbor-lens.qa.project"],
      project,
    );
    docker(["start", failed]);
    assert.equal(docker(["wait", failed]), "1");
    const diagnostics = events(failed, canary);
    assert.ok(
      diagnostics.some((event) => event.code === "STATIC_PROCESS_DIAGNOSTIC"),
    );
    assert.ok(diagnostics.some((event) => event.code === "STATIC_EXIT_FAILED"));
  } finally {
    if (failed) docker(["rm", "--force", failed]);
    rmSync(temporary, { recursive: true, force: true });
  }
  console.log(
    "Actual static runtime passed: safe JSON/access/privacy, license, graceful shutdown and sanitized Nginx failure.",
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  checkRuntime(process.env).catch(() => {
    console.error("Owned static-runtime acceptance failed");
    process.exitCode = 1;
  });

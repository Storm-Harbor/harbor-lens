import assert from "node:assert/strict";
import { test } from "node:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  buildInputs,
  runCompose,
  stageBuildContext,
} from "../../tools/compose-local.mjs";

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "lens-compose-test-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const repository = join(root, "repo with spaces");
  const temporaryRoot = join(root, "contexts");
  mkdirSync(temporaryRoot);
  for (const relative of buildInputs) {
    const target = join(repository, relative);
    if (["src", "licenses"].includes(relative))
      mkdirSync(target, { recursive: true });
    else {
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, relative);
    }
  }
  mkdirSync(join(repository, "src", "locales"));
  writeFileSync(
    join(repository, "src", "locales", "en-GB.json"),
    '{"demo":true}',
  );
  return { repository, temporaryRoot };
}

test("stages exact source bytes without unlisted secrets, Git data or metadata", (t) => {
  const { repository, temporaryRoot } = fixture(t);
  writeFileSync(join(repository, ".env"), "private");
  mkdirSync(join(repository, ".git"));
  writeFileSync(join(repository, ".git", "config"), "private remote");
  writeFileSync(join(repository, "src", "._hidden"), "AppleDouble");
  writeFileSync(join(repository, "src", ".DS_Store"), "metadata");
  const context = stageBuildContext(repository, { temporaryRoot });
  assert.equal(
    readFileSync(join(context, "src/locales/en-GB.json"), "utf8"),
    '{"demo":true}',
  );
  assert.equal(existsSync(join(context, ".env")), false);
  assert.equal(existsSync(join(context, ".git")), false);
  assert.deepEqual(readdirSync(join(context, "src")), ["locales"]);
});

test("rejects nested source symlinks and removes the partial context", (t) => {
  const { repository, temporaryRoot } = fixture(t);
  symlinkSync(join(repository, "LICENSE"), join(repository, "src", "leak.js"));
  assert.throws(
    () => stageBuildContext(repository, { temporaryRoot }),
    /symbolic link/,
  );
  assert.deepEqual(readdirSync(temporaryRoot), []);
});

test("rejects symlinked ancestors of explicitly allowed inputs", (t) => {
  const { repository, temporaryRoot } = fixture(t);
  const outside = join(temporaryRoot, "external");
  mkdirSync(outside);
  rmSync(join(repository, ".yarn"), { recursive: true });
  symlinkSync(outside, join(repository, ".yarn"));
  assert.throws(
    () => stageBuildContext(repository, { temporaryRoot }),
    /ancestor/,
  );
  assert.deepEqual(readdirSync(temporaryRoot), ["external"]);
});

test("bounds bytes and file count, cleaning up either refusal", (t) => {
  const { repository, temporaryRoot } = fixture(t);
  for (const limits of [{ maxBytes: 1 }, { maxFiles: 1 }]) {
    assert.throws(
      () => stageBuildContext(repository, { temporaryRoot, ...limits }),
      /limit/,
    );
    assert.deepEqual(readdirSync(temporaryRoot), []);
  }
});

test("missing required inputs fail before invoking Docker", (t) => {
  const { repository, temporaryRoot } = fixture(t);
  rmSync(join(repository, "LICENSE"));
  let invoked = false;
  assert.throws(
    () =>
      runCompose("up", {
        repository,
        stage: (source) => stageBuildContext(source, { temporaryRoot }),
        run: () => {
          invoked = true;
        },
      }),
    /ENOENT/,
  );
  assert.equal(invoked, false);
  assert.deepEqual(readdirSync(temporaryRoot), []);
});

test("launches Compose with argv-safe paths, loopback-port input and owned context cleanup", (t) => {
  const { repository, temporaryRoot } = fixture(t);
  let staged;
  runCompose("up", {
    repository,
    env: { HARBOR_LENS_PORT: "4190", HARBOR_LENS_BUILD_CONTEXT: "/untrusted" },
    stage: (source) => (staged = stageBuildContext(source, { temporaryRoot })),
    run: (binary, args, options) => {
      assert.equal(binary, "docker");
      assert.deepEqual(args, [
        "compose",
        "--project-name",
        "harbor-lens-local",
        "--file",
        join(repository, "compose.yaml"),
        "up",
        "--build",
        "--detach",
        "lens",
      ]);
      assert.equal(options.cwd, repository);
      assert.equal(options.env.HARBOR_LENS_PORT, "4190");
      assert.equal(options.env.HARBOR_LENS_BUILD_CONTEXT, staged);
      assert.equal(existsSync(join(staged, "LICENSE")), true);
      return { status: 0 };
    },
  });
  assert.equal(existsSync(staged), false);
});

test("cleans temporary input after Docker failure or missing executable", (t) => {
  const { repository, temporaryRoot } = fixture(t);
  for (const result of [
    { status: 1 },
    { status: null, signal: "SIGTERM" },
    { error: new Error("docker unavailable") },
  ]) {
    assert.throws(
      () =>
        runCompose("up", {
          repository,
          stage: (source) => stageBuildContext(source, { temporaryRoot }),
          run: () => result,
        }),
      /Docker Compose failed|docker unavailable/,
    );
    assert.deepEqual(readdirSync(temporaryRoot), []);
  }
});

test("down only stops its named Compose project and needs no build context", () => {
  let invoked = false;
  runCompose("down", {
    repository: "/repo with spaces",
    stage: () => {
      assert.fail("down must not stage or build");
    },
    run: (binary, args, options) => {
      invoked = true;
      assert.equal(binary, "docker");
      assert.deepEqual(args.slice(-2), ["down", "--remove-orphans"]);
      assert.equal(args[2], "harbor-lens-local");
      assert.equal(options.env.HARBOR_LENS_BUILD_CONTEXT, "/repo with spaces");
      return { status: 0 };
    },
  });
  assert.equal(invoked, true);
});

test("unknown commands cannot stage input or launch Docker", () => {
  assert.throws(
    () =>
      runCompose("publish", {
        stage: () => {
          assert.fail("invalid command staged input");
        },
        run: () => {
          assert.fail("invalid command launched Docker");
        },
      }),
    /Usage/,
  );
});

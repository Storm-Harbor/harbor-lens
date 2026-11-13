import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// Match Dockerfile inputs. Byte copies intentionally omit macOS xattrs and all
// unlisted files, including Git metadata, credentials, dependencies and caches.
export const buildInputs = [
  "Dockerfile",
  ".dockerignore",
  "LICENSE",
  "package.json",
  "yarn.lock",
  ".yarnrc.yml",
  ".yarn/releases/yarn-4.18.0.cjs",
  "index.html",
  "vite.config.js",
  "nginx.conf",
  "nginx-runtime.conf",
  "tools/check-toolchain.cjs",
  "tools/check-artifact.mjs",
  "tools/notices.cjs",
  "licenses",
  "src",
];

export function stageBuildContext(
  repository,
  {
    temporaryRoot = tmpdir(),
    maxBytes = 32 * 1024 * 1024,
    maxFiles = 1000,
  } = {},
) {
  const destination = mkdtempSync(join(temporaryRoot, "harbor-lens-context-"));
  let bytes = 0;
  let files = 0;
  const copy = (relative) => {
    const source = join(repository, relative);
    const stat = lstatSync(source);
    if (stat.isSymbolicLink())
      throw new Error(`Build input must not be a symbolic link: ${relative}`);
    if (stat.isDirectory()) {
      mkdirSync(join(destination, relative), { recursive: true });
      for (const name of readdirSync(source).sort()) {
        if (name.startsWith("._") || name === ".DS_Store") continue;
        copy(join(relative, name));
      }
    } else {
      if (!stat.isFile())
        throw new Error(`Build input must be a regular file: ${relative}`);
      bytes += stat.size;
      files += 1;
      if (bytes > maxBytes || files > maxFiles)
        throw new Error("Build context exceeds its file or byte limit.");
      mkdirSync(dirname(join(destination, relative)), { recursive: true });
      writeFileSync(join(destination, relative), readFileSync(source));
    }
  };
  try {
    for (const relative of buildInputs) {
      // Check ancestors too: an allowlisted file must not traverse a symlink.
      const parts = relative.split("/");
      for (let i = 1; i < parts.length; i += 1) {
        if (lstatSync(join(repository, ...parts.slice(0, i))).isSymbolicLink())
          throw new Error(
            `Build input ancestor must not be a link: ${relative}`,
          );
      }
      copy(relative);
    }
    return destination;
  } catch (error) {
    rmSync(destination, { recursive: true, force: true });
    throw error;
  }
}

export function runCompose(
  command,
  {
    repository = resolve(dirname(fileURLToPath(import.meta.url)), ".."),
    run = spawnSync,
    stage = stageBuildContext,
    env = process.env,
  } = {},
) {
  if (!["up", "down"].includes(command))
    throw new Error("Usage: node tools/compose-local.mjs <up|down>");
  const context = command === "up" ? stage(repository) : undefined;
  try {
    const result = run(
      "docker",
      [
        "compose",
        "--project-name",
        "harbor-lens-local",
        "--file",
        join(repository, "compose.yaml"),
        ...(command === "up"
          ? ["up", "--build", "--detach", "lens"]
          : ["down", "--remove-orphans"]),
      ],
      {
        cwd: repository,
        stdio: "inherit",
        env: { ...env, HARBOR_LENS_BUILD_CONTEXT: context || repository },
      },
    );
    if (result.error) throw result.error;
    if (result.status !== 0)
      throw new Error(
        `Docker Compose failed (${result.status ?? result.signal}).`,
      );
  } finally {
    if (context) rmSync(context, { recursive: true, force: true });
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    if (process.argv.length !== 3)
      throw new Error("Usage: node tools/compose-local.mjs <up|down>");
    runCompose(process.argv[2]);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

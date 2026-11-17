import { spawnSync } from "node:child_process";
import { appendFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const source = "https://github.com/Storm-Harbor/harbor-lens";
const digestPattern = /^sha256:[a-f0-9]{64}$/;

// These bindings describe this repository's publisher, never a customer's cloud.
export function releaseConfiguration(env) {
  if (
    env.GITHUB_ACTIONS !== "true" ||
    env.GITHUB_REPOSITORY !== "Storm-Harbor/harbor-lens" ||
    env.GITHUB_REPOSITORY_ID !== "1456559159" ||
    env.GITHUB_REPOSITORY_OWNER_ID !== "318287249" ||
    env.GITHUB_REF !== "refs/heads/master" ||
    !["push", "workflow_dispatch"].includes(env.GITHUB_EVENT_NAME) ||
    env.RELEASE_ENVIRONMENT !== "production" ||
    !/^[a-f0-9]{40}$/.test(env.GITHUB_SHA ?? "")
  )
    throw new Error("Unqualified publication context");

  const project = env.GCP_PROJECT_ID ?? "";
  const region = env.GCP_REGION ?? "";
  const repository = env.ARTIFACT_REGISTRY_REPOSITORY;
  if (
    !/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(project) ||
    !/^[a-z]+[a-z0-9]*-[a-z]+[0-9]+$/.test(region) ||
    repository !== "harbor-lens" ||
    env.GCP_PUBLISHER_SERVICE_ACCOUNT !==
      `github-harbor-lens@${project}.iam.gserviceaccount.com` ||
    !/^projects\/[1-9][0-9]*\/locations\/global\/workloadIdentityPools\/storm-harbor-github\/providers\/harbor-lens-production$/.test(
      env.GCP_WORKLOAD_IDENTITY_PROVIDER ?? "",
    )
  )
    throw new Error("Invalid publisher bindings");

  const image = `${region}-docker.pkg.dev/${project}/${repository}/harbor-lens`;
  return {
    project,
    region,
    repository,
    sha: env.GITHUB_SHA,
    image,
    tag: `${image}:${env.GITHUB_SHA}`,
    tagUrl: `https://artifactregistry.googleapis.com/v1/projects/${project}/locations/${region}/repositories/${repository}/packages/harbor-lens/tags/${env.GITHUB_SHA}`,
  };
}

function docker(args) {
  const result = spawnSync("docker", args, {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    timeout: 12 * 60 * 1000,
    // Credential helpers use the runner's Docker config, never this process token.
    env: Object.fromEntries(
      Object.entries(process.env).filter(([key]) => key !== "REGISTRY_TOKEN"),
    ),
  });
  if (result.error || result.status !== 0)
    throw new Error(`Docker ${args[0]} failed; publication stopped`);
  return result.stdout;
}

function inspect(reference, run) {
  const images = JSON.parse(run(["image", "inspect", reference]));
  if (!Array.isArray(images) || images.length !== 1)
    throw new Error("Expected one image inspection result");
  return images[0];
}

export function verifyImage(image, configuration) {
  const labels = image.Config?.Labels;
  if (
    !digestPattern.test(image.Id ?? "") ||
    image.Os !== "linux" ||
    image.Architecture !== "amd64" ||
    image.Config?.User !== "65532:65532" ||
    labels?.["org.opencontainers.image.source"] !== source ||
    labels?.["org.opencontainers.image.revision"] !== configuration.sha
  )
    throw new Error("Image identity or runtime boundary mismatch");
}

export async function readTag(configuration, token, request = fetch) {
  const response = await request(configuration.tagUrl, {
    headers: {
      Authorization: `Bearer ${token}`,
      "x-goog-user-project": configuration.project,
    },
    redirect: "error",
    signal: AbortSignal.timeout(30_000),
  });
  if (response.status === 404) return null;
  if (response.status !== 200)
    throw new Error(`Registry tag lookup refused (${response.status})`);
  const tag = await response.json();
  const expectedName = configuration.tagUrl.replace(
    "https://artifactregistry.googleapis.com/v1/",
    "",
  );
  const versionPrefix = expectedName.slice(
    0,
    expectedName.lastIndexOf("/tags/"),
  );
  const digest = tag.version?.replace(`${versionPrefix}/versions/`, "");
  if (tag.name !== expectedName || !digestPattern.test(digest ?? ""))
    throw new Error("Registry tag identity mismatch");
  return digest;
}

export async function releaseImage(
  mode,
  env,
  {
    run = docker,
    request = fetch,
    save = writeFileSync,
    output = appendFileSync,
  } = {},
) {
  if (!["build", "publish"].includes(mode))
    throw new Error("Usage: publish-image.mjs build|publish");
  const configuration = releaseConfiguration(env);
  if (mode === "build") {
    if (env.REGISTRY_TOKEN)
      throw new Error(
        "Cloud credentials must not exist during the image build",
      );
    run([
      "build",
      "--platform=linux/amd64",
      "--label",
      `org.opencontainers.image.source=${source}`,
      "--label",
      `org.opencontainers.image.revision=${configuration.sha}`,
      "--tag",
      configuration.tag,
      ".",
    ]);
    verifyImage(inspect(configuration.tag, run), configuration);
    return;
  }

  if (
    !env.REGISTRY_TOKEN ||
    !env.RUNNER_TEMP ||
    !env.GITHUB_OUTPUT ||
    !/^[1-9][0-9]*$/.test(env.GITHUB_RUN_ID ?? "") ||
    !/^[1-9][0-9]*$/.test(env.GITHUB_RUN_ATTEMPT ?? "")
  )
    throw new Error("Missing publication credentials or receipt destination");
  const built = inspect(configuration.tag, run);
  verifyImage(built, configuration);
  let digest = await readTag(configuration, env.REGISTRY_TOKEN, request);
  const reused = digest !== null;
  if (!reused) {
    const pushed = run(["push", configuration.tag]);
    const pushDigest = pushed.match(/digest: (sha256:[a-f0-9]{64})\b/)?.[1];
    if (!pushDigest) throw new Error("Push did not return an immutable digest");
    digest = await readTag(configuration, env.REGISTRY_TOKEN, request);
    if (digest !== pushDigest)
      throw new Error("Registry tag differs from the pushed manifest");
  }
  const immutable = `${configuration.image}@${digest}`;
  run(["pull", "--platform=linux/amd64", immutable]);
  const remote = inspect(immutable, run);
  verifyImage(remote, configuration);
  if (
    !remote.RepoDigests?.includes(immutable) ||
    (!reused && remote.Id !== built.Id)
  )
    throw new Error("Published image differs from the qualified build");

  const receipt = {
    source,
    revision: configuration.sha,
    digest,
    platform: "linux/amd64",
    reused,
    run: `${source}/actions/runs/${env.GITHUB_RUN_ID}/attempts/${env.GITHUB_RUN_ATTEMPT}`,
  };
  save(
    join(env.RUNNER_TEMP, "harbor-lens-image-receipt.json"),
    `${JSON.stringify(receipt, null, 2)}\n`,
    { mode: 0o600 },
  );
  output(env.GITHUB_OUTPUT, `image_digest=${digest}\n`);
  return receipt;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  releaseImage(process.argv[2], process.env).catch((error) => {
    // Network/SDK/Docker errors can include headers, raw bodies or bindings.
    // Only our stable messages may leave this tooling boundary.
    const safe =
      /^(Unqualified publication context|Invalid publisher bindings|Usage:|Cloud credentials|Missing publication|Docker |Expected one image|Image identity|Registry tag |Push did not|Published image)/;
    console.error(
      safe.test(error.message) ? error.message : "Image publication failed",
    );
    process.exitCode = 1;
  });

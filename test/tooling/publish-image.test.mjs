import assert from "node:assert/strict";
import { test } from "node:test";
import {
  readTag,
  releaseConfiguration,
  releaseImage,
} from "../../tools/publish-image.mjs";

const revision = "a".repeat(40);
const digest = `sha256:${"b".repeat(64)}`;
const configId = `sha256:${"c".repeat(64)}`;
const environment = {
  GITHUB_ACTIONS: "true",
  GITHUB_REPOSITORY: "Storm-Harbor/harbor-lens",
  GITHUB_REPOSITORY_ID: "1456559159",
  GITHUB_REPOSITORY_OWNER_ID: "318287249",
  GITHUB_REF: "refs/heads/master",
  GITHUB_EVENT_NAME: "push",
  GITHUB_SHA: revision,
  RELEASE_ENVIRONMENT: "production",
  GCP_PROJECT_ID: "example-project",
  GCP_REGION: "europe-west1",
  ARTIFACT_REGISTRY_REPOSITORY: "harbor-lens",
  GCP_WORKLOAD_IDENTITY_PROVIDER:
    "projects/123456/locations/global/workloadIdentityPools/storm-harbor-github/providers/harbor-lens-production",
  GCP_PUBLISHER_SERVICE_ACCOUNT:
    "github-harbor-lens@example-project.iam.gserviceaccount.com",
  REGISTRY_TOKEN: "synthetic-token",
  RUNNER_TEMP: "/owned temporary directory",
  GITHUB_OUTPUT: "/owned output file",
  GITHUB_RUN_ID: "123",
  GITHUB_RUN_ATTEMPT: "2",
};
const configuration = releaseConfiguration(environment);
const immutable = `${configuration.image}@${digest}`;

function image(overrides = {}) {
  return {
    Id: configId,
    Os: "linux",
    Architecture: "amd64",
    Config: {
      User: "65532:65532",
      Labels: {
        "org.opencontainers.image.source":
          "https://github.com/Storm-Harbor/harbor-lens",
        "org.opencontainers.image.revision": revision,
      },
    },
    RepoDigests: [immutable],
    ...overrides,
  };
}

function registryTag(overrides = {}) {
  const name = configuration.tagUrl.split("/v1/")[1];
  return {
    name,
    version: `${name.split("/tags/")[0]}/versions/${digest}`,
    ...overrides,
  };
}

function harness({ existing = false, remote = image(), statuses } = {}) {
  const calls = [];
  const saves = [];
  const outputs = [];
  let lookups = 0;
  return {
    calls,
    saves,
    outputs,
    dependencies: {
      run: (args) => {
        calls.push(args);
        if (args[0] === "push") return `source: digest: ${digest} size: 1234`;
        if (args[0] === "image")
          return JSON.stringify([args[2].includes("@") ? remote : image()]);
        return "";
      },
      request: async (url, options) => {
        assert.equal(url, configuration.tagUrl);
        assert.equal(options.headers.Authorization, "Bearer synthetic-token");
        assert.equal(options.headers["x-goog-user-project"], "example-project");
        assert.equal(options.redirect, "error");
        const status =
          statuses?.[lookups] ?? (existing || lookups > 0 ? 200 : 404);
        lookups += 1;
        return { status, json: async () => registryTag() };
      },
      save: (...args) => saves.push(args),
      output: (...args) => outputs.push(args),
    },
  };
}

test("refuses forks, renamed/transferred repositories, PRs, develop and malformed bindings before Docker or cloud access", async () => {
  for (const overrides of [
    { GITHUB_ACTIONS: "false" },
    { GITHUB_REPOSITORY: "other/harbor-lens" },
    { GITHUB_REPOSITORY_ID: "1" },
    { GITHUB_REPOSITORY_OWNER_ID: "1" },
    { GITHUB_REF: "refs/heads/develop" },
    { GITHUB_EVENT_NAME: "pull_request" },
    { GITHUB_EVENT_NAME: "workflow_run" },
    { RELEASE_ENVIRONMENT: "preview" },
    { GITHUB_SHA: "a; unsafe" },
    { GCP_PROJECT_ID: "" },
    { GCP_REGION: "europe-west1/other" },
    { ARTIFACT_REGISTRY_REPOSITORY: "another-repository" },
    {
      GCP_PUBLISHER_SERVICE_ACCOUNT:
        "owner@other-project.iam.gserviceaccount.com",
    },
    { GCP_WORKLOAD_IDENTITY_PROVIDER: "projects/123/other" },
  ]) {
    const h = harness();
    await assert.rejects(
      releaseImage("publish", { ...environment, ...overrides }, h.dependencies),
      /Unqualified|Invalid publisher/,
    );
    assert.deepEqual(h.calls, []);
    assert.deepEqual(h.saves, []);
  }
});

test("manual master requests build a labeled amd64 image before authentication", async () => {
  const h = harness();
  await releaseImage(
    "build",
    {
      ...environment,
      GITHUB_EVENT_NAME: "workflow_dispatch",
      REGISTRY_TOKEN: "",
    },
    h.dependencies,
  );
  assert.deepEqual(h.calls[0], [
    "build",
    "--platform=linux/amd64",
    "--label",
    "org.opencontainers.image.source=https://github.com/Storm-Harbor/harbor-lens",
    "--label",
    `org.opencontainers.image.revision=${revision}`,
    "--tag",
    configuration.tag,
    ".",
  ]);
  assert.equal(h.calls.length, 2);
  assert.deepEqual(h.saves, []);
  const unsafe = harness();
  await assert.rejects(
    releaseImage("build", environment, unsafe.dependencies),
    /Cloud credentials/,
  );
  assert.deepEqual(unsafe.calls, []);
});

test("publishes an absent immutable tag, pulls the recorded digest and writes only a safe receipt", async () => {
  const h = harness();
  const receipt = await releaseImage("publish", environment, h.dependencies);
  assert.equal(receipt.digest, digest);
  assert.equal(receipt.reused, false);
  assert.deepEqual(h.calls[1], ["push", configuration.tag]);
  assert.deepEqual(h.calls[2], ["pull", "--platform=linux/amd64", immutable]);
  assert.equal(
    h.saves[0][0],
    "/owned temporary directory/harbor-lens-image-receipt.json",
  );
  assert.deepEqual(JSON.parse(h.saves[0][1]), receipt);
  assert.deepEqual(h.saves[0][2], { mode: 0o600 });
  for (const value of [
    environment.REGISTRY_TOKEN,
    configuration.project,
    configuration.image,
  ])
    assert.equal(h.saves[0][1].includes(value), false);
  assert.deepEqual(h.outputs, [
    [environment.GITHUB_OUTPUT, `image_digest=${digest}\n`],
  ]);
});

test("a rerun verifies the existing source image without pushing or moving its immutable tag", async () => {
  const h = harness({
    existing: true,
    remote: image({ Id: `sha256:${"d".repeat(64)}` }),
  });
  const receipt = await releaseImage("publish", environment, h.dependencies);
  assert.equal(receipt.reused, true);
  assert.equal(
    h.calls.some(([command]) => command === "push"),
    false,
  );
});

test("denied, unavailable and malformed registry responses never become permission to push", async () => {
  for (const status of [401, 403, 429, 500]) {
    const h = harness({ statuses: [status] });
    await assert.rejects(
      releaseImage("publish", environment, h.dependencies),
      /refused/,
    );
    assert.equal(
      h.calls.some(([command]) => command === "push"),
      false,
    );
    assert.deepEqual(h.saves, []);
  }
  for (const tag of [
    registryTag({ name: "another-tag" }),
    registryTag({ version: "another-package/versions/" + digest }),
    registryTag({ version: "latest" }),
    {},
  ])
    await assert.rejects(
      readTag(configuration, "synthetic-token", async () => ({
        status: 200,
        json: async () => tag,
      })),
      /identity mismatch/,
    );
});

test("wrong source, revision, user, platform or digest cannot qualify an existing image", async () => {
  for (const remote of [
    image({ Os: "windows" }),
    image({ Architecture: "arm64" }),
    image({ Id: "unverified" }),
    image({ Config: { ...image().Config, User: "0" } }),
    image({ Config: { ...image().Config, Labels: {} } }),
    image({ RepoDigests: [] }),
  ]) {
    const h = harness({ existing: true, remote });
    await assert.rejects(
      releaseImage("publish", environment, h.dependencies),
      /mismatch|differs/,
    );
    assert.deepEqual(h.saves, []);
    assert.deepEqual(h.outputs, []);
  }
});

test("push failure, manifest mismatch and pull failure never write a successful receipt", async () => {
  for (const fail of ["push", "manifest", "pull", "changed image"]) {
    const h = harness({
      remote:
        fail === "changed image"
          ? image({ Id: `sha256:${"d".repeat(64)}` })
          : image(),
    });
    const original = h.dependencies.run;
    h.dependencies.run = (args) => {
      if (args[0] === fail) throw new Error("synthetic failure");
      if (args[0] === "push" && fail === "manifest") return "no digest";
      return original(args);
    };
    await assert.rejects(releaseImage("publish", environment, h.dependencies));
    assert.deepEqual(h.saves, []);
    assert.deepEqual(h.outputs, []);
  }
});

test("changed tag, missing context and unknown commands fail closed", async () => {
  const h = harness();
  let lookup = 0;
  h.dependencies.request = async () => ({
    status: lookup++ === 0 ? 404 : 200,
    json: async () =>
      registryTag({
        version: registryTag().version.replace(
          digest,
          `sha256:${"e".repeat(64)}`,
        ),
      }),
  });
  await assert.rejects(
    releaseImage("publish", environment, h.dependencies),
    /differs/,
  );
  assert.deepEqual(h.saves, []);
  for (const key of [
    "REGISTRY_TOKEN",
    "RUNNER_TEMP",
    "GITHUB_OUTPUT",
    "GITHUB_RUN_ID",
    "GITHUB_RUN_ATTEMPT",
  ])
    await assert.rejects(
      releaseImage(
        "publish",
        { ...environment, [key]: "" },
        harness().dependencies,
      ),
      /Missing publication/,
    );
  await assert.rejects(
    releaseImage("deploy", environment, harness().dependencies),
    /Usage/,
  );
});

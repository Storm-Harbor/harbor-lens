import assert from "node:assert/strict";
import { test } from "node:test";
import { acceptanceTarget } from "../../tools/check-runtime.mjs";

test("runtime acceptance refuses user preview projects and public or ambiguous origins before touching Docker", () => {
  const valid = {
    HARBOR_LENS_QA_PROJECT: "harbor-lens-ci",
    LENS_TEST_ORIGIN: "http://127.0.0.1:4179/",
  };
  for (const origin of [
    "https://lens.stormharbor.io/",
    "http://localhost:4179/",
    "http://127.0.0.1/",
    "http://secret@127.0.0.1:4179/",
    "http://127.0.0.1:4179/private",
    "http://127.0.0.1:4179/?secret=value",
    "http://127.0.0.1:4179/#secret",
    "invalid",
  ]) {
    assert.throws(() =>
      acceptanceTarget({ ...valid, LENS_TEST_ORIGIN: origin }),
    );
  }
  for (const project of [
    "harbor-lens-local",
    "other-project",
    "harbor-lens-ci;command",
    "",
    undefined,
  ]) {
    assert.throws(
      () => acceptanceTarget({ ...valid, HARBOR_LENS_QA_PROJECT: project }),
      /unowned/,
    );
  }
  for (const project of [
    "harbor-lens-ci",
    "harbor-lens-runtime-qa",
    "harbor-lens-runtime-qa-owned1",
  ])
    assert.equal(
      acceptanceTarget({ ...valid, HARBOR_LENS_QA_PROJECT: project }).project,
      project,
    );
});

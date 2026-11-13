import { test } from "vitest";
import assert from "node:assert/strict";
import {
  createState,
  scopeData,
  changeScope,
  addHarbor,
  startRun,
  advanceRun,
} from "../src/model.mjs";
import { catalogs } from "../src/catalogs.mjs";

test("catalogs have complete key parity and nonempty values", () => {
  const expected = Object.keys(catalogs["en-GB"]).sort();
  assert.equal(Object.keys(catalogs).length, 25);
  for (const catalog of Object.values(catalogs))
    assert.deepEqual(Object.keys(catalog).sort(), expected);
  for (const catalog of Object.values(catalogs))
    for (const text of Object.values(catalog)) assert.ok(text.trim());
});

test("independent sessions, scoped inventory and invalid scope preservation", () => {
  const a = createState(),
    b = createState();
  assert.equal(scopeData(a).harbors.length, 3);
  assert.equal(changeScope(a, "demo-orbit"), null);
  assert.equal(scopeData(a).harbors.length, 1);
  assert.equal(changeScope(a, "foreign"), "invalidScope");
  assert.equal(a.scope, "demo-orbit");
  assert.equal(b.scope, "demo-atlas");
  assert.equal(addHarbor(a, "  Synthetic  ", "Oracle Cloud"), null);
  assert.equal(scopeData(a).harbors.at(-1).name, "Synthetic");
  assert.equal(scopeData(b).harbors.length, 3);
});

test("label/provider bounds and synthetic inventory quota", () => {
  const s = createState();
  for (const label of ["", "  ", "x".repeat(61)])
    assert.equal(addHarbor(s, label, "GCP"), "invalidLabel");
  assert.equal(addHarbor(s, "fixture", "unknown"), "invalidProvider");
  assert.equal(addHarbor(s, "x".repeat(60), "GCP"), null);
  for (let i = 0; i < 8; i++)
    assert.equal(addHarbor(s, `Fixture ${i}`, "AWS"), null);
  assert.equal(addHarbor(s, "over quota", "Azure"), "limit");
  assert.equal(scopeData(s).harbors.length, 12);
});

test("simulation terminal states, concurrency and cross-scope denial", () => {
  const s = createState();
  assert.equal(startRun(s, "orbit-primary"), "invalidTarget");
  assert.equal(startRun(s, "atlas-primary"), null);
  const id = s.runs[0].id;
  assert.equal(startRun(s, "atlas-recovery"), "alreadyRunning");
  assert.equal(advanceRun(s, "missing", false), "invalidRun");
  changeScope(s, "demo-orbit");
  assert.equal(scopeData(s).runs.length, 0);
  assert.equal(advanceRun(s, id, true), "invalidRun");
  assert.equal(startRun(s, "orbit-primary"), null);
  assert.equal(advanceRun(s, s.runs[0].id, true), null);
  assert.equal(s.runs[0].status, "cancelled");
  assert.equal(advanceRun(s, s.runs[0].id, false), "invalidRun");
  changeScope(s, "demo-atlas");
  for (let phase = 0; phase < 3; phase++)
    assert.equal(advanceRun(s, id, false), null);
  assert.equal(scopeData(s).runs[0].status, "completed");
  assert.equal(advanceRun(s, id, false), "invalidRun");
  assert.equal(startRun(s, "atlas-recovery"), null);
});

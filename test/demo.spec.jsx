import { test, expect, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { I18nextProvider } from "react-i18next";
import i18n from "../src/i18n";
import { SandboxAccess } from "../src/SandboxEntry";
import {
  createState,
  startRun,
  advanceRun,
  retryRun,
  changeScope,
  scenarios,
  failurePhases,
  addHarbor,
} from "../src/model.mjs";
import {
  resourceFixtures,
  dependencyKeys,
  manifestDraft,
  phaseEvidence,
} from "../src/demo.mjs";
import { papers } from "./joint-runtime";

beforeEach(async () => {
  await i18n.changeLanguage("en-GB");
});
async function setup(view = "/recovery") {
  render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter initialEntries={[view]}>
        <SandboxAccess />
      </MemoryRouter>
    </I18nextProvider>,
  );
  const user = userEvent.setup();
  await user.click(
    screen.getByRole("button", { name: "Simulate GitHub", exact: true }),
  );
  await user.click(
    screen.getByRole("button", {
      name: "Simulate MFA verification",
      exact: true,
    }),
  );
  return user;
}
const button = (name) => screen.getByRole("button", { name, exact: true });
const go = (user, view) =>
  user.click(document.querySelector(`nav [data-view="${view}"]`));

test("every configured failure stops at its phase and an explicit retry preserves the original outcome", () => {
  for (const scenario of scenarios.filter((item) => item !== "success")) {
    const state = createState();
    expect(startRun(state, "atlas-primary", { scenario })).toBeNull();
    const id = state.runs[0].id;
    expect(retryRun(state, id)).toBe("invalidRun");
    for (let index = 0; index <= failurePhases[scenario]; index++)
      expect(advanceRun(state, id, false)).toBeNull();
    expect(state.runs[0]).toMatchObject({
      status: "failed",
      phase: failurePhases[scenario],
      scenario,
    });
    const before = structuredClone(state.runs[0]);
    expect(
      phaseEvidence(before).filter((item) => item.status === "failed"),
    ).toHaveLength(1);
    expect(retryRun(state, id)).toBeNull();
    expect(state.runs[0]).toMatchObject({
      retryOf: id,
      scenario: "success",
      status: "running",
      seconds: 0,
    });
    expect(state.runs[1]).toEqual(before);
    expect(retryRun(state, id)).toBe("alreadyRunning");
    for (let index = 0; index < 3; index++)
      advanceRun(state, state.runs[0].id, false);
    expect(state.runs[0].status).toBe("completed");
    expect(
      phaseEvidence(state.runs[0]).every((item) => item.status === "completed"),
    ).toBe(true);
    changeScope(state, "demo-orbit");
    expect(retryRun(state, id)).toBe("invalidRun");
  }
  const state = createState();
  expect(retryRun(state, "missing")).toBe("invalidRun");
  startRun(state, "atlas-primary");
  const id = state.runs[0].id;
  expect(phaseEvidence(state.runs[0])[0].status).toBe("running");
  advanceRun(state, id, true);
  expect(phaseEvidence(state.runs[0])[0].status).toBe("cancelled");
  expect(retryRun(state, id)).toBeNull();
});

test("simulation configuration denies forged scenarios, placements and unsafe create/restore combinations", () => {
  for (const config of [
    { scenario: "forged" },
    { purpose: "destroy" },
    { provisioning: "destroy" },
    { region: "foreign-region" },
    { provisioning: "create", purpose: "restore" },
  ]) {
    const state = createState();
    expect(startRun(state, "atlas-primary", config)).toBe("invalidSimulation");
    expect(state.runs).toEqual([]);
  }
  const state = createState();
  expect(startRun(state, "atlas-recovery", { provisioning: "create" })).toBe(
    "invalidSimulation",
  );
  expect(
    startRun(state, "atlas-primary", {
      provisioning: "create",
      region: "europe-west4",
    }),
  ).toBeNull();
  expect(state.runs[0]).toMatchObject({
    provisioning: "create",
    region: "europe-west4",
  });
  advanceRun(state, state.runs[0].id, true);
  addHarbor(state, "Synthetic", "Oracle Cloud");
  expect(startRun(state, state.harbors.at(-1).id)).toBeNull();
});

test("reference resources and manifest drafts retain project boundaries and omit secret values", () => {
  expect(resourceFixtures("foreign")).toEqual([]);
  for (const scope of ["demo-atlas", "demo-orbit"]) {
    const nodes = resourceFixtures(scope);
    expect(nodes).toHaveLength(8);
    expect(nodes.every((node) => node.id.startsWith(scope))).toBe(true);
    for (const [from, to] of dependencyKeys) {
      expect(nodes.some((node) => node.key === from)).toBe(true);
      expect(nodes.some((node) => node.key === to)).toBe(true);
    }
  }
  const state = createState();
  const draft = manifestDraft(state.scope, state.harbors[0], {
    purpose: "exercise",
    provisioning: "create",
    region: "europe-west4",
  });
  expect(draft).toContain("provisioning: create");
  expect(draft).toContain("ttlSeconds: 3600");
  expect(draft).toContain("placementRef: demo-europe-west4");
  expect(draft).not.toMatch(/password:|token:|secretValue:/);
  expect(
    manifestDraft(state.scope, state.harbors[1], {
      purpose: "restore",
      provisioning: "existing",
      region: "eu-west-1",
    }),
  ).not.toContain("ttlSeconds");
});

test("JointJS adapter keeps selection, zoom, pan and cleanup accessible through the unit SVG boundary", async () => {
  const user = await setup("/topology");
  const paper = papers.at(-1);
  expect(paper.options.model.cells).toHaveLength(16);
  await user.click(button("demo-postgres · Cloud SQL · PostgreSQL"));
  expect(
    screen.getByRole("region", { name: "Inspect details" }),
  ).toHaveTextContent("demo-postgres");
  const selected = paper.options.model.getCell("demo-atlas-database");
  expect(selected.attributes.body.fill).toBe("#edf3ff");
  await act(async () =>
    paper.events["element:pointerclick"]({
      model: { id: "demo-atlas-backups" },
    }),
  );
  expect(
    screen.getByRole("region", { name: "Inspect details" }),
  ).toHaveTextContent("demo-backup");
  for (let index = 0; index < 8; index++) await user.click(button("Zoom in"));
  expect(button("Zoom in")).toBeDisabled();
  for (let index = 0; index < 10; index++) await user.click(button("Zoom out"));
  expect(button("Zoom out")).toBeDisabled();
  await user.click(button("Topology ←"));
  await user.click(button("Topology →"));
  await user.click(button("Fit diagram"));
  expect(paper.zoom).toBe(1);
  expect(paper.pan).toBe(0);
  await go(user, "overview");
  expect(paper.removed).toBe(true);
});

test("planner snapshots its YAML, failure evidence, retry and scope-specific history", async () => {
  const user = await setup();
  await user.selectOptions(
    document.getElementById("plan-region"),
    "europe-west4",
  );
  await user.selectOptions(document.getElementById("provisioning"), "create");
  expect(screen.getByLabelText("YAML draft")).toHaveTextContent(
    "ttlSeconds: 3600",
  );
  await user.selectOptions(document.getElementById("purpose"), "restore");
  expect(document.getElementById("provisioning")).toHaveValue("existing");
  await user.selectOptions(document.getElementById("purpose"), "exercise");
  await user.selectOptions(document.getElementById("target"), "atlas-recovery");
  expect(document.getElementById("plan-region")).toHaveValue("eu-west-1");
  await user.selectOptions(document.getElementById("target"), "atlas-primary");
  const forged = document.getElementById("target");
  forged.add(new Option("foreign", "foreign"));
  await user.selectOptions(forged, "foreign");
  expect(screen.getByRole("status")).toHaveTextContent("Select a Harbor");
  await user.selectOptions(document.getElementById("target"), "atlas-primary");
  await user.selectOptions(
    document.getElementById("scenario"),
    "backupFailure",
  );
  await user.click(button("Start simulation"));
  expect(document.getElementById("scenario")).toBeDisabled();
  await go(user, "topology");
  expect(screen.getByText("SIM-001")).toBeVisible();
  await go(user, "recovery");
  await user.click(button("Complete next phase"));
  await user.click(button("Complete next phase"));
  expect(screen.getByRole("note")).toHaveTextContent("Backup unavailable");
  await go(user, "topology");
  expect(screen.getByText("Failed", { exact: true })).toBeVisible();
  await go(user, "recovery");
  await user.click(button("Retry simulation"));
  for (let index = 0; index < 3; index++)
    await user.click(button("Complete next phase"));
  expect(screen.getByTestId("run-detail")).toHaveTextContent("SIM-001");
  await user.click(button("SIM-001"));
  expect(screen.getByRole("note")).toHaveTextContent("Backup unavailable");
  await go(user, "activity");
  await user.click(button("SIM-002"));
  expect(screen.getAllByTestId("run-detail")).toHaveLength(2);
  await user.click(screen.getByRole("button", { name: /REF-1041/ }));
  expect(screen.getByRole("note")).toHaveTextContent("Backup unavailable");
  await user.click(screen.getByRole("button", { name: /REF-1040/ }));
  await user.selectOptions(document.getElementById("scope"), "demo-orbit");
  expect(
    screen.queryByRole("button", { name: "SIM-001", exact: true }),
  ).toBeNull();
  await go(user, "recovery");
  expect(document.getElementById("target")).toHaveValue("orbit-primary");
  await user.click(button("Start simulation"));
  await user.click(button("Cancel simulation"));
  await user.click(button("Retry simulation"));
});

test("expanded metric tabs expose distinct synthetic series and units", async () => {
  const user = await setup("/");
  await user.click(button("Replication lag"));
  expect(
    screen.getByRole("img", {
      name: "Replication lag · Synthetic data",
      exact: true,
    }),
  ).toBeVisible();
  await user.click(button("CPU utilization"));
  await user.click(button("Service latency"));
  expect(button("Service latency")).toHaveAttribute("aria-pressed", "true");
});

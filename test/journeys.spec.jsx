import { test, expect, beforeEach } from "vitest";
import { render, screen, act, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { I18nextProvider } from "react-i18next";
import i18n from "../src/i18n";
import { SandboxAccess } from "../src/SandboxEntry";
import {
  createState,
  startRun,
  startJourney,
  advanceRun,
  retryRun,
  changeScope,
  scopeData,
  scenarios,
} from "../src/model.mjs";
import {
  journeyJobs,
  workflowProjection,
  workflowDefinition,
  referenceJourney,
} from "../src/journey.mjs";
import { phaseEvidence } from "../src/demo.mjs";
import { Journeys } from "../src/components/journeys";
import { papers } from "./joint-runtime";

beforeEach(async () => {
  await i18n.changeLanguage("en-GB");
});
const button = (name) => screen.getByRole("button", { name, exact: true });
const stepButton = (name, id) => button(`${name} · ${id}`);
const go = (user, view) =>
  user.click(document.querySelector(`nav [data-view="${view}"]`));
async function setup() {
  render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter initialEntries={["/journeys"]}>
        <SandboxAccess />
      </MemoryRouter>
    </I18nextProvider>,
  );
  const user = userEvent.setup();
  await user.click(button("Simulate GitHub"));
  await user.click(button("Simulate MFA verification"));
  return user;
}

test("DAG waves respect dependencies, parallel timing, frozen definitions and terminal outcomes", () => {
  const state = createState();
  expect(startJourney(state, "foreign")).toBe("invalidTarget");
  startRun(state, "atlas-primary");
  expect(startJourney(state, "atlas-primary")).toBe("alreadyRunning");
  advanceRun(state, state.runs[0].id, true);
  expect(startJourney(state, "atlas-primary")).toBeNull();
  const run = state.runs[0];
  expect(
    run.workflow.jobs.filter((job) => job.status === "running"),
  ).toHaveLength(2);
  expect(phaseEvidence(run).map((phase) => phase.status)).toEqual([
    "running",
    "pending",
    "pending",
  ]);
  for (let wave = 0; wave < 7; wave++) {
    const active = run.workflow.jobs.filter((job) => job.status === "running");
    for (const job of active)
      for (const id of job.needs)
        expect(run.workflow.jobs.find((item) => item.id === id).status).toBe(
          "completed",
        );
    expect(advanceRun(state, run.id, false)).toBeNull();
  }
  expect(run).toMatchObject({ status: "completed", seconds: 570, phase: 3 });
  expect(phaseEvidence(run).map((phase) => phase.seconds)).toEqual([
    120, 360, 90,
  ]);
  expect(run.workflow.jobs.every((job) => job.status === "completed")).toBe(
    true,
  );
  const terminal = structuredClone(run);
  expect(advanceRun(state, run.id, true)).toBe("invalidRun");
  expect(run).toEqual(terminal);
  expect(workflowProjection(run)).toEqual(run.workflow.jobs);
  expect(
    workflowProjection(null).every((job) => job.status === "pending"),
  ).toBe(true);
  expect(workflowProjection({}).every((job) => job.status === "pending")).toBe(
    true,
  );
});

test("each DAG failure skips downstream jobs and retry preserves the failed evidence", () => {
  for (const scenario of scenarios.filter((item) => item !== "success")) {
    const state = createState();
    startJourney(state, "atlas-primary", { scenario });
    const run = state.runs[0];
    let guard = 0;
    while (run.status === "running" && guard++ < 8)
      advanceRun(state, run.id, false);
    expect(run.status).toBe("failed");
    expect(
      run.workflow.jobs.filter((job) => job.status === "failed"),
    ).toHaveLength(1);
    expect(run.workflow.jobs.some((job) => job.status === "skipped")).toBe(
      true,
    );
    const evidence = phaseEvidence(run);
    expect(evidence.some((phase) => phase.status === "failed")).toBe(true);
    expect(evidence.reduce((sum, phase) => sum + phase.seconds, 0)).toBe(
      run.seconds,
    );
    const previous = structuredClone(run);
    changeScope(state, "demo-orbit");
    expect(advanceRun(state, run.id, false)).toBe("invalidRun");
    expect(retryRun(state, run.id)).toBe("invalidRun");
    changeScope(state, "demo-atlas");
    expect(retryRun(state, run.id)).toBeNull();
    const next = state.runs[0];
    expect(next).toMatchObject({
      retryOf: run.id,
      scenario: "success",
      status: "running",
      seconds: 0,
    });
    expect(
      next.workflow.jobs.filter((job) => job.status === "running"),
    ).toHaveLength(2);
    expect(state.runs[1]).toEqual(previous);
    while (next.status === "running") advanceRun(state, next.id, false);
    expect(next.seconds).toBe(570);
  }
});

test("DAG cancellation preserves completed jobs, skips future work and cannot advance afterward", () => {
  for (const completedWaves of [0, 2, 5]) {
    const state = createState();
    startJourney(state, "atlas-primary");
    const run = state.runs[0];
    for (let index = 0; index < completedWaves; index++)
      advanceRun(state, run.id, false);
    const before = run.workflow.jobs
      .filter((job) => job.status === "completed")
      .map((job) => job.id);
    advanceRun(state, run.id, true);
    expect(run.status).toBe("cancelled");
    expect(
      run.workflow.jobs
        .filter((job) => job.status === "completed")
        .map((job) => job.id),
    ).toEqual(before);
    expect(
      phaseEvidence(run).some((phase) => phase.status === "cancelled"),
    ).toBe(true);
    expect(advanceRun(state, run.id, false)).toBe("invalidRun");
  }
  const config = {
    target: "atlas-primary",
    purpose: "exercise",
    provisioning: "existing",
    region: "europe-west1",
  };
  expect(referenceJourney("completed", config)).toMatchObject({
    status: "completed",
    seconds: 570,
  });
  expect(referenceJourney("failed", config).status).toBe("failed");
  const definition = workflowDefinition("demo-atlas", config, journeyJobs);
  expect(definition).toContain(
    "needs: [validate-manifest, declare-references]",
  );
  expect(definition).toContain("runner: browser-simulation");
  expect(definition).not.toMatch(/password:|secretValue:|accessToken:/);
});

test("Journey workspace selects SVG/list/dependencies, filters, inspects YAML and supports viewport controls", async () => {
  const user = await setup();
  expect(
    screen.getByRole("heading", { level: 1, name: "Journeys" }),
  ).toBeVisible();
  const paper = papers.at(-1);
  expect(paper.options.model.cells).toHaveLength(19);
  await user.click(stepButton("Manual approval", "approve-plan"));
  expect(
    screen.getByRole("region", { name: "Inspect details" }),
  ).toHaveTextContent("Declared inputs");
  await user.click(button("validate-manifest"));
  await act(async () =>
    paper.events["element:pointerclick"]({ model: { id: "restore-database" } }),
  );
  expect(
    screen.getByRole("region", { name: "Inspect details" }),
  ).toHaveTextContent("Restore data");
  await act(async () =>
    paper.events["element:pointerclick"]({ model: { id: "phase-prepare" } }),
  );
  expect(
    screen.getByRole("region", { name: "Inspect details" }),
  ).toHaveTextContent("Restore data");
  await user.click(screen.getByLabelText("Focus dependencies"));
  await user.type(screen.getByLabelText("Filter steps"), "verify");
  expect(
    screen.getByRole("list", { name: "Steps" }).querySelectorAll("li"),
  ).toHaveLength(1);
  await user.clear(screen.getByLabelText("Filter steps"));
  await user.type(screen.getByLabelText("Filter steps"), "absent");
  expect(screen.getByText("No matching steps")).toBeVisible();
  fireEvent.change(screen.getByLabelText("Filter steps"), {
    target: { value: "x".repeat(70) },
  });
  expect(screen.getByLabelText("Filter steps")).toHaveValue("x".repeat(60));
  await user.clear(screen.getByLabelText("Filter steps"));
  await user.click(screen.getByLabelText("Focus dependencies"));
  await user.click(button("YAML draft"));
  expect(screen.getByLabelText("Visual workflow definition")).toHaveTextContent(
    "restore-database",
  );
  expect(screen.getByLabelText("YAML draft")).toHaveTextContent(
    "ttlSeconds: 3600",
  );
  await user.click(button("Inspect details"));
  for (let index = 0; index < 5; index++) await user.click(button("Zoom in"));
  expect(button("Zoom in")).toBeDisabled();
  for (let index = 0; index < 7; index++) await user.click(button("Zoom out"));
  expect(button("Zoom out")).toBeDisabled();
  for (const direction of ["←", "→", "↑", "↓"])
    await user.click(button(`Journeys ${direction}`));
  await user.click(button("Fit diagram"));
  expect(paper.zoom).toBe(1);
  expect(paper.pan).toBe(0);
  await user.selectOptions(
    document.getElementById("journey-run"),
    "reference-success",
  );
  expect(screen.getByText("REF-JOURNEY-COMPLETED")).toBeVisible();
  await user.selectOptions(
    document.getElementById("journey-run"),
    "reference-failure",
  );
  await user.click(stepButton("Restore data", "restore-database"));
  expect(
    screen.getByRole("region", { name: "Inspect details" }),
  ).toHaveTextContent("Failed");
  await user.click(button("Configure journey"));
  expect(document.getElementById("purpose")).toBeVisible();
  await user.selectOptions(document.getElementById("purpose"), "restore");
  await go(user, "journeys");
  expect(screen.getByText("Restore", { exact: true })).toBeVisible();
});

test("Journey execution, cancellation/retry, historical snapshots and scope changes share the real sandbox state", async () => {
  const user = await setup();
  await user.click(button("Configure journey"));
  await user.selectOptions(
    document.getElementById("plan-region"),
    "europe-west4",
  );
  await user.selectOptions(document.getElementById("provisioning"), "create");
  await user.selectOptions(
    document.getElementById("scenario"),
    "backupFailure",
  );
  await go(user, "journeys");
  await user.click(button("Start simulation"));
  expect(
    screen.getByTestId("journey-canvas").querySelector("svg"),
  ).not.toBeNull();
  for (let wave = 0; wave < 4; wave++)
    await user.click(button("Complete ready jobs"));
  expect(screen.getByText("SIM-001")).toBeVisible();
  await user.click(stepButton("Restore data", "restore-database"));
  expect(
    screen.getByRole("region", { name: "Inspect details" }),
  ).toHaveTextContent("Failed");
  await user.click(button("Retry simulation"));
  for (let wave = 0; wave < 7; wave++)
    await user.click(button("Complete ready jobs"));
  expect(screen.getByText("SIM-002")).toBeVisible();
  await user.selectOptions(document.getElementById("journey-run"), "SIM-001");
  await user.click(button("YAML draft"));
  expect(screen.getByLabelText("YAML draft")).toHaveTextContent(
    "demo-europe-west4",
  );
  await user.selectOptions(document.getElementById("journey-run"), "latest");
  await user.click(button("Start simulation"));
  await user.click(button("Complete ready jobs"));
  await user.click(button("Cancel simulation"));
  expect(
    screen.getByRole("region", { name: "Inspect details" }),
  ).toHaveTextContent("Skipped");
  expect(
    stepButton("Validate manifest", "validate-manifest"),
  ).toHaveAccessibleDescription("Completed");
  await user.click(button("Retry simulation"));
  await go(user, "recovery");
  expect(document.getElementById("purpose")).toBeDisabled();
  await user.click(button("Cancel simulation"));
  await go(user, "journeys");
  await user.selectOptions(document.getElementById("scope"), "demo-orbit");
  expect(document.getElementById("journey-run").textContent).not.toContain(
    "SIM-001",
  );
  await user.click(button("Start simulation"));
  await user.click(button("Cancel simulation"));
  await user.click(button("Reset sandbox"));
  expect(screen.queryByText(/SIM-/)).toBeNull();
});

test("invalid or empty latest selections fall back to the scoped definition", async () => {
  const state = createState();
  render(
    <I18nextProvider i18n={i18n}>
      <Journeys
        scope="demo-atlas"
        data={scopeData(state)}
        config={{
          target: "atlas-primary",
          purpose: "exercise",
          provisioning: "existing",
          region: "europe-west1",
          scenario: "success",
        }}
        onStart={() => {}}
        onConfigure={() => {}}
      />
    </I18nextProvider>,
  );
  const user = userEvent.setup();
  await user.click(button("Start simulation"));
  expect(screen.getByText("demo-exact-plan")).toBeVisible();
  const select = document.getElementById("journey-run");
  select.add(new Option("foreign", "foreign"));
  await user.selectOptions(select, "foreign");
  expect(screen.getByText("demo-exact-plan")).toBeVisible();
  await user.selectOptions(select, "definition");
});

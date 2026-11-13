export const scopes = ["demo-atlas", "demo-orbit"];
export const providers = [
  "GCP",
  "AWS",
  "Azure",
  "DigitalOcean",
  "Oracle Cloud",
];
export const phases = ["prepare", "restore", "verify"];

const initialHarbors = [
  {
    id: "atlas-primary",
    scope: "demo-atlas",
    name: "Atlas primary",
    provider: "GCP",
    region: "europe-west1",
    health: "healthy",
    resources: 24,
    cpu: 42,
    age: 2,
  },
  {
    id: "atlas-recovery",
    scope: "demo-atlas",
    name: "Atlas recovery",
    provider: "AWS",
    region: "eu-west-1",
    health: "attention",
    resources: 18,
    cpu: 27,
    age: 8,
  },
  {
    id: "atlas-edge",
    scope: "demo-atlas",
    name: "Atlas edge",
    provider: "Azure",
    region: "westeurope",
    health: "unknown",
    resources: 9,
    cpu: null,
    age: null,
  },
  {
    id: "orbit-primary",
    scope: "demo-orbit",
    name: "Orbit primary",
    provider: "DigitalOcean",
    region: "fra1",
    health: "healthy",
    resources: 12,
    cpu: 31,
    age: 3,
  },
];

export function createState() {
  return {
    scope: scopes[0],
    harbors: structuredClone(initialHarbors),
    runs: [],
    sequence: 0,
  };
}

export function scopeData(state) {
  return {
    harbors: state.harbors.filter((h) => h.scope === state.scope),
    runs: state.runs.filter((r) => r.scope === state.scope),
  };
}

export function changeScope(state, scope) {
  if (!scopes.includes(scope)) return "invalidScope";
  state.scope = scope;
  return null;
}

export function addHarbor(state, label, provider) {
  const name = label.trim();
  if (!name || name.length > 60) return "invalidLabel";
  if (!providers.includes(provider)) return "invalidProvider";
  if (scopeData(state).harbors.length >= 12) return "limit";
  state.sequence++;
  state.harbors.push({
    id: `synthetic-${state.sequence}`,
    scope: state.scope,
    name,
    provider,
    region: "sandbox",
    health: "unknown",
    resources: 0,
    cpu: null,
    age: null,
  });
  return null;
}

export function startRun(state, harborId) {
  const { harbors, runs } = scopeData(state);
  if (!harbors.some((h) => h.id === harborId)) return "invalidTarget";
  if (runs.some((r) => r.status === "running")) return "alreadyRunning";
  state.sequence++;
  state.runs.unshift({
    id: `SIM-${String(state.sequence).padStart(3, "0")}`,
    scope: state.scope,
    target: harborId,
    phase: 0,
    status: "running",
  });
  return null;
}

export function advanceRun(state, runId, cancel) {
  const run = scopeData(state).runs.find((r) => r.id === runId);
  if (!run || run.status !== "running") return "invalidRun";
  if (cancel) run.status = "cancelled";
  else {
    run.phase++;
    if (run.phase === phases.length) run.status = "completed";
  }
  return null;
}

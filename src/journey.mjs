// Browser-only synthetic workflow. No adapter, runner or permission is invoked.
export const journeyJobs = [
  {
    id: "validate-manifest",
    label: "validateManifest",
    phase: 0,
    wave: 0,
    needs: [],
    duration: 12,
    adapter: "mock/configuration",
    inputs: ["RecoveryConfiguration", "expectedScope"],
    outputs: ["SIM_MANIFEST_VALID"],
  },
  {
    id: "declare-references",
    label: "secrets",
    phase: 0,
    wave: 0,
    needs: [],
    duration: 12,
    adapter: "mock/reference-declaration",
    inputs: ["recovery-database"],
    outputs: ["SIM_REFERENCE_DECLARED"],
  },
  {
    id: "approve-plan",
    label: "approval",
    phase: 0,
    wave: 1,
    needs: ["validate-manifest", "declare-references"],
    duration: 18,
    adapter: "mock/policy",
    inputs: ["demo-exact-plan", "manual-simulation"],
    outputs: ["SIM_PLAN_APPROVED"],
  },
  {
    id: "prepare-target",
    label: "prepare",
    phase: 0,
    wave: 2,
    needs: ["approve-plan"],
    duration: 90,
    adapter: "mock/terraform",
    inputs: [
      "target.providerRef",
      "target.placementRef",
      "target.provisioning",
    ],
    outputs: ["SIM_TARGET_READY"],
  },
  {
    id: "restore-database",
    label: "restore",
    phase: 1,
    wave: 3,
    needs: ["prepare-target"],
    duration: 240,
    adapter: "mock/postgresql",
    inputs: ["demo-backup-snapshot", "recovery-database"],
    outputs: ["SIM_DATABASE_RESTORED"],
  },
  {
    id: "restore-workloads",
    label: "workloads",
    phase: 1,
    wave: 4,
    needs: ["restore-database"],
    duration: 120,
    adapter: "mock/kubernetes",
    inputs: ["demo-api", "demo-cluster"],
    outputs: ["SIM_WORKLOADS_READY"],
  },
  {
    id: "verify-service",
    label: "verify",
    phase: 2,
    wave: 5,
    needs: ["restore-database", "restore-workloads"],
    duration: 60,
    adapter: "mock/http-probe",
    inputs: ["demo-service-health", "target.region"],
    outputs: ["SIM_SERVICE_VERIFIED"],
  },
  {
    id: "record-evidence",
    label: "evidence",
    phase: 2,
    wave: 6,
    needs: ["verify-service"],
    duration: 30,
    adapter: "mock/evidence",
    inputs: ["demo-plan", "step-outcomes"],
    outputs: ["SIM_EVIDENCE_RECORDED"],
  },
];

const failingJobs = {
  policyFailure: "approve-plan",
  backupFailure: "restore-database",
  verifyFailure: "verify-service",
  timeout: "verify-service",
  partialFailure: "restore-workloads",
};

export function initializeJourney(run) {
  run.workflow = {
    id: "postgres-recovery",
    revision: "demo-2026.11",
    jobs: journeyJobs.map((job) => ({
      ...structuredClone(job),
      status: job.needs.length ? "pending" : "running",
      seconds: 0,
    })),
  };
}

export function advanceJourney(run, cancel) {
  const jobs = run.workflow.jobs;
  if (cancel) {
    run.status = "cancelled";
    for (const job of jobs) {
      if (job.status === "running") job.status = "cancelled";
      else if (job.status === "pending") job.status = "skipped";
    }
    return;
  }
  const active = jobs.filter((job) => job.status === "running");
  for (const job of active) {
    job.seconds = job.duration;
    job.status = job.id === failingJobs[run.scenario] ? "failed" : "completed";
  }
  run.seconds += Math.max(...active.map((job) => job.duration));
  if (active.some((job) => job.status === "failed")) {
    run.status = "failed";
    for (const job of jobs)
      if (job.status === "pending") job.status = "skipped";
  } else {
    for (const job of jobs) {
      if (
        job.status === "pending" &&
        job.needs.every(
          (id) =>
            jobs.find((dependency) => dependency.id === id).status ===
            "completed",
        )
      )
        job.status = "running";
    }
    if (jobs.every((job) => job.status === "completed"))
      run.status = "completed";
  }
  const next = jobs.find(
    (job) => job.status === "running" || job.status === "failed",
  );
  if (next) run.phase = next.phase;
  else run.phase = 3;
}

export function journeyPhaseEvidence(run) {
  return ["prepare", "restore", "verify"].map((phase, index) => {
    const jobs = run.workflow.jobs.filter((job) => job.phase === index);
    let status = "pending";
    if (jobs.every((job) => job.status === "completed")) status = "completed";
    else if (jobs.some((job) => job.status === "failed")) status = "failed";
    else if (jobs.some((job) => job.status === "cancelled"))
      status = "cancelled";
    else if (jobs.some((job) => job.status === "running")) status = "running";
    else if (jobs.every((job) => job.status === "skipped")) status = "skipped";
    const seconds = [...new Set(jobs.map((job) => job.wave))].reduce(
      (total, wave) =>
        total +
        Math.max(
          ...jobs.filter((job) => job.wave === wave).map((job) => job.seconds),
        ),
      0,
    );
    return { phase, status, seconds, code: `SIM_${phase.toUpperCase()}` };
  });
}

export function workflowProjection(run) {
  if (run?.workflow) return run.workflow.jobs;
  return journeyJobs.map((job) => ({ ...job, status: "pending", seconds: 0 }));
}

export function workflowDefinition(scope, config, jobs) {
  return `# Visual browser demo; no runner or adapter executes.
name: ${scope}/postgres-recovery
revision: demo-2026.11
runner: browser-simulation
purpose: ${config.purpose}
target:
  harbor: ${config.target}
  region: ${config.region}
  provisioning: ${config.provisioning}
jobs:
${jobs
  .map(
    (job) => `  ${job.id}:
    needs: [${job.needs.join(", ")}]
    adapter: ${job.adapter}
    policy: manual-simulation
    durationSeconds: ${job.duration}`,
  )
  .join("\n")}
`;
}

export function referenceJourney(outcome, config) {
  const run = {
    ...config,
    id: `REF-JOURNEY-${outcome.toUpperCase()}`,
    scenario: outcome === "failed" ? "backupFailure" : "success",
    phase: 0,
    status: "running",
    seconds: 0,
  };
  initializeJourney(run);
  while (run.status === "running") advanceJourney(run, false);
  return run;
}

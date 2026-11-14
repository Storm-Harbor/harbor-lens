import { scopes, phases, phaseSeconds } from "./model.mjs";
import { journeyPhaseEvidence } from "./journey.mjs";

export function resourceFixtures(scope) {
  if (!scopes.includes(scope)) return [];
  const atlas = scope === "demo-atlas";
  const provider = atlas ? "GCP" : "DigitalOcean";
  const region = atlas ? "europe-west1" : "fra1";
  return [
    ["gateway", "demo-gateway", "Gateway", 40, 75, "healthy"],
    ["cluster", "demo-cluster", "Kubernetes", 265, 75, "healthy"],
    ["api", "demo-api", "Deployment · 3 pods", 490, 75, "healthy"],
    [
      "database",
      "demo-postgres",
      atlas ? "Cloud SQL · PostgreSQL" : "Managed PostgreSQL",
      715,
      75,
      "healthy",
    ],
    ["backups", "demo-backup", "BackupSnapshot", 715, 280, "attention"],
    ["secrets", "database-credential", "SecretReference", 490, 280, "unknown"],
    [
      "terraform",
      "demo-infrastructure",
      "TerraformWorkspace",
      265,
      280,
      "healthy",
    ],
    [
      "recovery",
      "demo-recovery",
      atlas ? "AWS · KubernetesTarget" : "KubernetesTarget",
      40,
      280,
      "attention",
    ],
  ].map(([key, name, kind, x, y, health]) => ({
    id: `${scope}-${key}`,
    key,
    name,
    kind,
    x,
    y,
    health,
    provider: key === "recovery" && atlas ? "AWS" : provider,
    region: key === "recovery" && atlas ? "eu-west-1" : region,
    owner: `demo/${key}.yaml`,
  }));
}

export const dependencyKeys = [
  ["gateway", "cluster"],
  ["cluster", "api"],
  ["api", "database"],
  ["database", "backups"],
  ["api", "secrets"],
  ["cluster", "terraform"],
  ["recovery", "backups"],
  ["recovery", "terraform"],
];

export function manifestDraft(scope, harbor, config) {
  const create = config.provisioning === "create";
  const exercise = config.purpose === "exercise";
  return `apiVersion: recovery.stormharbor.io/v1alpha1
kind: RecoveryConfiguration
metadata:
  name: demo-${config.purpose}
  scope:
    organizationId: demo-organization
    projectId: ${scope}
spec:
  purpose: ${config.purpose}
  source:
    name: demo-primary
    scope:
      organizationId: demo-organization
      projectId: ${scope}
  target:
    name: ${create ? "demo-isolated-project" : harbor.id}
    providerRef: demo-${harbor.provider.toLowerCase().replaceAll(" ", "-")}
    provisioning: ${config.provisioning}
    placementRef: demo-${config.region}
    lifecycle: ${exercise ? "ephemeral" : "retained"}
    cleanup: ${exercise ? "run-owned" : "retain"}${exercise ? "\n    ttlSeconds: 3600" : ""}
  secrets:
    - name: recovery-database
      scope:
        organizationId: demo-organization
        projectId: ${scope}
      purpose: restore-database
`;
}

export function phaseEvidence(run) {
  if (run.workflow) return journeyPhaseEvidence(run);
  return phases.map((phase, index) => ({
    phase,
    status:
      index < run.phase
        ? "completed"
        : index === run.phase
          ? run.status
          : "pending",
    seconds:
      index < run.phase || (index === run.phase && run.status === "failed")
        ? phaseSeconds[index]
        : 0,
    code:
      index === run.phase && run.status === "failed"
        ? `SIM_${run.scenario.toUpperCase()}`
        : `SIM_${phase.toUpperCase()}`,
  }));
}

export const referenceRuns = [
  {
    id: "REF-1042",
    status: "completed",
    scenario: "success",
    seconds: 570,
    phase: 3,
    target: "GCP · europe-west4",
  },
  {
    id: "REF-1041",
    status: "failed",
    scenario: "backupFailure",
    seconds: 480,
    phase: 1,
    target: "AWS · eu-west-1",
  },
  {
    id: "REF-1040",
    status: "cancelled",
    scenario: "success",
    seconds: 120,
    phase: 1,
    target: "GCP · us-central1",
  },
];

export const metricSeries = Array.from({ length: 12 }, (_, index) => ({
  time: `${String(index * 5).padStart(2, "0")}:00`,
  cpu: [32, 38, 35, 51, 46, 58, 54, 68, 61, 52, 44, 42][index],
  latency: [92, 94, 101, 126, 118, 161, 152, 140, 119, 102, 96, 94][index],
  replicationLag: [8, 10, 9, 21, 34, 28, 17, 11, 7, 5, 4, 3][index],
}));

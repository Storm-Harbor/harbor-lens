import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  CheckCircle2,
  AlertTriangle,
  CircleHelp,
  FileCode2,
  Database,
  ShieldCheck,
  Clock3,
  ChevronRight,
} from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  BarChart,
  Bar,
} from "recharts";
import { Button } from "./ui/button";
import { Diagram } from "./diagram";
import {
  resourceFixtures,
  manifestDraft,
  phaseEvidence,
  referenceRuns,
  metricSeries,
} from "../demo.mjs";
import { providerRegions, scenarios } from "../model.mjs";

function Status({ value, t }) {
  return (
    <span className={`badge ${value}`}>
      <i />
      {t(value)}
    </span>
  );
}

export function Readiness({ scope }) {
  const { t } = useTranslation();
  const checks = [
    ["workloads", "healthy", "Kubernetes · demo-api"],
    ["database", "healthy", "PostgreSQL · demo-postgres"],
    ["backups", "attention", "SIM_BACKUP_REVIEW"],
    ["secrets", "unknown", "MANUAL_REFERENCE_REQUIRED"],
  ];
  return (
    <section className="card readiness-panel">
      <div className="card-heading">
        <div>
          <p className="eyebrow">
            {scope} · {t("synthetic")}
          </p>
          <h2>{t("readiness")}</h2>
        </div>
        <ShieldCheck aria-hidden="true" />
      </div>
      <div className="readiness-content">
        <div className="readiness-score">
          <strong>
            2<span>/4</span>
          </strong>
          <span>{t("healthy")}</span>
          <div className="readiness-meter">
            <i />
          </div>
          <small>{t("legend")}</small>
        </div>
        <div className="check-grid">
          {checks.map(([label, health, code]) => (
            <article key={label}>
              {health === "healthy" ? (
                <CheckCircle2 aria-hidden="true" />
              ) : health === "attention" ? (
                <AlertTriangle aria-hidden="true" />
              ) : (
                <CircleHelp aria-hidden="true" />
              )}
              <div>
                <strong>{t(label)}</strong>
                <small className="mono">{code}</small>
              </div>
              <Status value={health} t={t} />
            </article>
          ))}
        </div>
      </div>
      <div className="gap-summary">
        <AlertTriangle aria-hidden="true" />
        <div>
          <strong>{t("gaps")}</strong>
          <p>{t("gapNote")}</p>
        </div>
        <span className="gap-count">
          {checks.filter(([, health]) => health !== "healthy").length}
        </span>
      </div>
    </section>
  );
}

export function ResourceExplorer({ scope, run }) {
  const { t } = useTranslation();
  const nodes = useMemo(() => {
    const fixtures = resourceFixtures(scope);
    if (!run) return fixtures;
    const activeKey = ["terraform", "database", "api"][Math.min(run.phase, 2)];
    return fixtures.map((node) =>
      node.key === activeKey ? { ...node, health: run.status } : node,
    );
  }, [scope, run]);
  const [selected, setSelected] = useState(nodes[0].id);
  const node = nodes.find((item) => item.id === selected);
  return (
    <section className="card">
      <div className="card-heading">
        <div>
          <p className="eyebrow">
            {t("synthetic")} · {scope}
          </p>
          <h2>{t("topology")}</h2>
        </div>
        <span className="pill">JointJS Core · MPL-2.0</span>
      </div>
      <p className="card-description">{t("topologyText")}</p>
      {run && (
        <p className="card-description">
          <span className="mono">{run.id}</span> ·{" "}
          <Status value={run.status} t={t} />
        </p>
      )}
      <Diagram nodes={nodes} selected={selected} onSelect={setSelected} t={t} />
      <div className="resource-explorer">
        <ol className="resource-list" aria-label={t("diagramLabel")}>
          {nodes.map((item) => (
            <li key={item.id}>
              <button
                aria-label={`${item.name} · ${item.kind}`}
                aria-pressed={item.id === selected}
                onClick={() => setSelected(item.id)}
              >
                <span className={`resource-dot ${item.health}`} />
                <span>
                  <strong>{item.name}</strong>
                  <small>{item.kind}</small>
                </span>
                <ChevronRight aria-hidden="true" />
              </button>
            </li>
          ))}
        </ol>
        <section className="resource-inspector" aria-label={t("details")}>
          <span className="eyebrow">{t("details")}</span>
          <h3>{node.name}</h3>
          <p className="mono">{node.kind}</p>
          <dl>
            <div>
              <dt>{t("provider")}</dt>
              <dd>{node.provider}</dd>
            </div>
            <div>
              <dt>{t("region")}</dt>
              <dd className="mono">{node.region}</dd>
            </div>
            <div>
              <dt>{t("health")}</dt>
              <dd>
                <Status value={node.health} t={t} />
              </dd>
            </div>
            <div>
              <dt>GitOps</dt>
              <dd className="mono">{node.owner}</dd>
            </div>
            <div>
              <dt>{t("evidence")}</dt>
              <dd className="mono">{node.id}</dd>
            </div>
          </dl>
          <p className="inspector-note">{t("legend")}</p>
        </section>
      </div>
    </section>
  );
}

export function DemoMetrics() {
  const { t } = useTranslation();
  const [metric, setMetric] = useState("latency");
  const units = { latency: "ms", replicationLag: "s", cpu: "%" };
  return (
    <section className="card metrics-panel">
      <div className="card-heading">
        <div>
          <p className="eyebrow">demo-api / demo-postgres</p>
          <h2>{t("signals")}</h2>
        </div>
        <span className="pill">{t("synthetic")}</span>
      </div>
      <div className="metric-tabs">
        {["latency", "replicationLag", "cpu"].map((key) => (
          <Button
            key={key}
            aria-pressed={metric === key}
            onClick={() => setMetric(key)}
          >
            {t(key)}
          </Button>
        ))}
      </div>
      <div className="metric-summary">
        <strong>
          {metricSeries.at(-1)[metric]}
          <small>{units[metric]}</small>
        </strong>
        <span>
          {t(metric)}
          <small>{t("cpuNote")}</small>
        </span>
      </div>
      <div
        className="expanded-chart"
        role="img"
        aria-label={`${t(metric)} · ${t("synthetic")}`}
      >
        <ResponsiveContainer width="100%" height={210}>
          <LineChart
            data={metricSeries}
            margin={{ top: 12, right: 22, left: -12, bottom: 0 }}
            accessibilityLayer={false}
          >
            <CartesianGrid
              vertical={false}
              stroke="#e4e9f2"
              strokeDasharray="4 4"
            />
            <XAxis
              dataKey="time"
              tick={{ fontSize: 10, fill: "#788597" }}
              tickLine={false}
              axisLine={false}
              minTickGap={35}
            />
            <YAxis
              tick={{ fontSize: 10, fill: "#788597" }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip />
            <Line
              type="monotone"
              dataKey={metric}
              name={t(metric)}
              stroke="#326ce5"
              strokeWidth={2.5}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="caption">{t("targetsNote")}</p>
    </section>
  );
}

export function JourneyDesigner({
  scope,
  harbors,
  config,
  onChange,
  target,
  onTargetChange,
  locked,
}) {
  const { t } = useTranslation();
  const harbor = harbors.find((item) => item.id === target);
  return (
    <section className="card journey-designer">
      <div className="card-heading">
        <div>
          <p className="eyebrow">{t("simulated")} · GitOps</p>
          <h2>{t("journey")}</h2>
        </div>
        <FileCode2 aria-hidden="true" />
      </div>
      <div className="designer-grid">
        <fieldset className="designer-fields" disabled={locked}>
          <label htmlFor="purpose">{t("recovery")}</label>
          <select
            id="purpose"
            value={config.purpose}
            onChange={(event) =>
              onChange({
                ...config,
                purpose: event.target.value,
                provisioning: "existing",
              })
            }
          >
            <option value="exercise">{t("exercise")}</option>
            <option value="restore">{t("restoreScenario")}</option>
          </select>
          <label htmlFor="target">{t("target")}</label>
          <select
            id="target"
            name="target"
            form="run-form"
            value={target}
            onChange={(event) => onTargetChange(event.target.value)}
          >
            {harbors.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} · {item.provider}
              </option>
            ))}
          </select>
          <label htmlFor="plan-region">{t("region")}</label>
          <select
            id="plan-region"
            value={config.region}
            onChange={(event) =>
              onChange({ ...config, region: event.target.value })
            }
          >
            {[
              ...new Set([...providerRegions[harbor.provider], harbor.region]),
            ].map((region) => (
              <option key={region}>{region}</option>
            ))}
          </select>
          <label htmlFor="provisioning">{t("environment")}</label>
          <select
            id="provisioning"
            value={config.provisioning}
            onChange={(event) =>
              onChange({ ...config, provisioning: event.target.value })
            }
          >
            <option value="existing">{t("reuseTarget")}</option>
            <option
              value="create"
              disabled={
                harbor.provider !== "GCP" || config.purpose !== "exercise"
              }
            >
              {t("newTarget")}
            </option>
          </select>
          <label htmlFor="scenario">{t("scenario")}</label>
          <select
            id="scenario"
            value={config.scenario}
            onChange={(event) =>
              onChange({ ...config, scenario: event.target.value })
            }
          >
            {scenarios.map((scenario) => (
              <option key={scenario} value={scenario}>
                {t(scenario)}
              </option>
            ))}
          </select>
          <div className="plan-policy">
            <ShieldCheck aria-hidden="true" />
            <span>
              {t("policy")}
              <strong>
                {t("approval")} · {t("simulated")}
              </strong>
            </span>
          </div>
        </fieldset>
        <div className="manifest-panel">
          <div className="manifest-heading">
            <span>{t("manifest")}</span>
            <span className="mono">RecoveryConfiguration / v1alpha1</span>
          </div>
          <pre dir="ltr" aria-label={t("manifest")}>
            <code>{manifestDraft(scope, harbor, config)}</code>
          </pre>
          <p>{t("manifestNote")}</p>
        </div>
      </div>
    </section>
  );
}

export function RunDetails({ run, t }) {
  return (
    <div className="run-detail" data-testid="run-detail">
      <div className="run-detail-heading">
        <div>
          <span className="eyebrow">{t("evidence")}</span>
          <h3>{run.id}</h3>
        </div>
        <Status value={run.status} t={t} />
      </div>
      <div className="run-facts">
        <span>
          {t("scenario")}
          <strong>{t(run.scenario)}</strong>
        </span>
        <span>
          {t("duration")}
          <strong>
            {run.seconds}s · {t("simulated")}
          </strong>
        </span>
      </div>
      {run.status === "failed" && (
        <div className="failure-message" role="note">
          <AlertTriangle aria-hidden="true" />
          <div>
            <strong>{t(run.scenario)}</strong>
            <p className="mono">
              SIM_{run.scenario.toUpperCase()} · {t("noLive")}
            </p>
          </div>
        </div>
      )}
      <ol className="evidence-timeline">
        {phaseEvidence(run).map((item) => (
          <li key={item.phase} className={item.status}>
            <span className="timeline-dot" />
            <div>
              <strong>{t(item.phase)}</strong>
              <small className="mono">{item.code}</small>
            </div>
            <span>{item.seconds}s</span>
            <Status value={item.status} t={t} />
          </li>
        ))}
      </ol>
      {run.retryOf && (
        <p className="caption">
          {t("retry")} ← <span className="mono">{run.retryOf}</span>
        </p>
      )}
    </div>
  );
}

export function ReferenceHistory() {
  const { t } = useTranslation();
  const [selected, setSelected] = useState(referenceRuns[0]);
  return (
    <section className="card reference-history">
      <div className="card-heading">
        <div>
          <p className="eyebrow">
            {t("synthetic")} · {t("referenceRun")}
          </p>
          <h2>{t("activity")}</h2>
        </div>
        <Clock3 aria-hidden="true" />
      </div>
      <div className="reference-grid">
        <div>
          <div className="reference-run-list">
            {referenceRuns.map((run) => (
              <button
                key={run.id}
                aria-pressed={selected.id === run.id}
                onClick={() => setSelected(run)}
              >
                <span className="mono">{run.id}</span>
                <span>
                  <strong>{run.target}</strong>
                  <small>
                    {t(run.scenario)} · {run.seconds}s
                  </small>
                </span>
                <Status value={run.status} t={t} />
                <ChevronRight aria-hidden="true" />
              </button>
            ))}
          </div>
          <div
            className="duration-chart"
            role="img"
            aria-label={`${t("duration")} · ${t("synthetic")}`}
          >
            <ResponsiveContainer width="100%" height={165}>
              <BarChart
                data={referenceRuns}
                margin={{ left: -18, right: 20 }}
                accessibilityLayer={false}
              >
                <CartesianGrid vertical={false} stroke="#e4e9f2" />
                <XAxis
                  dataKey="id"
                  tick={{ fontSize: 9 }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  tick={{ fontSize: 9 }}
                  tickLine={false}
                  axisLine={false}
                />
                <Bar
                  dataKey="seconds"
                  fill="#84a7ef"
                  radius={[4, 4, 0, 0]}
                  isAnimationActive={false}
                />
              </BarChart>
            </ResponsiveContainer>
            <p className="caption">
              {t("duration")} (s) · {t("simulated")}
            </p>
          </div>
        </div>
        <RunDetails run={selected} t={t} />
      </div>
    </section>
  );
}

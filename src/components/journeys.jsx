import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Workflow,
  Play,
  ArrowRight,
  GitBranch,
  ShieldCheck,
  Clock3,
  CircleCheck,
  CircleX,
  CirclePause,
  CircleDashed,
  ChevronRight,
  Search,
  FileCode2,
} from "lucide-react";
import { Button } from "./ui/button";
import { JourneyDiagram } from "./journey-diagram";
import {
  workflowProjection,
  workflowDefinition,
  referenceJourney,
} from "../journey.mjs";
import { manifestDraft } from "../demo.mjs";

const icons = {
  pending: CircleDashed,
  running: Play,
  completed: CircleCheck,
  failed: CircleX,
  cancelled: CirclePause,
  skipped: CircleDashed,
};
function Status({ value, t }) {
  const Icon = icons[value];
  return (
    <span className={`workflow-status ${value}`}>
      <Icon aria-hidden="true" />
      {t(value)}
    </span>
  );
}

export function Journeys({
  scope,
  data,
  config,
  activeRun,
  onStart,
  onAdvance,
  onCancel,
  onRetry,
  onConfigure,
}) {
  const { t } = useTranslation();
  const [selection, setSelection] = useState("definition");
  const [selected, setSelected] = useState("validate-manifest");
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const [tab, setTab] = useState("details");
  const runs = data.runs.filter((run) => run.workflow);
  const run = useMemo(() => {
    if (selection === "definition") return null;
    if (selection === "reference-success")
      return referenceJourney("completed", config);
    if (selection === "reference-failure")
      return referenceJourney("failed", config);
    if (selection === "latest") return runs[0] || null;
    return runs.find((item) => item.id === selection) || null;
  }, [selection, data.runs, config]);
  const jobs = useMemo(() => workflowProjection(run), [run]);
  const effective = run || config;
  const harbor = data.harbors.find((item) => item.id === effective.target);
  const step = jobs.find((job) => job.id === selected);
  const matching = useMemo(
    () =>
      new Set(
        jobs
          .filter((job) =>
            `${job.id} ${t(job.label)}`
              .toLocaleLowerCase()
              .includes(query.toLocaleLowerCase().trim()),
          )
          .map((job) => job.id),
      ),
    [jobs, query, t],
  );
  const completed = jobs.filter((job) => job.status === "completed").length;
  const sessionRun = Boolean(
    run && data.runs.some((item) => item.id === run.id),
  );
  const canAdvance = sessionRun && run.status === "running";
  const canRetry = sessionRun && ["failed", "cancelled"].includes(run.status);
  const definition = workflowDefinition(scope, effective, jobs);
  return (
    <>
      <section className="journey-hero">
        <div>
          <span className="journey-kicker">
            <Workflow aria-hidden="true" />
            {t("synthetic")} / {scope}
          </span>
          <h2>
            postgres-recovery{" "}
            <span className="journey-version">demo-2026.11</span>
          </h2>
          <p>{t("journeySummary")}</p>
          <div className="journey-hero-meta">
            <span>
              <GitBranch aria-hidden="true" />
              .stormharbor/journeys/postgres.yaml
            </span>
            <span>
              <ShieldCheck aria-hidden="true" />
              {t("approval")} · {t("simulated")}
            </span>
            <span>
              <Play aria-hidden="true" />
              {t("scenario")}: {t(effective.scenario)}
            </span>
          </div>
        </div>
        <div className="journey-hero-actions">
          <Button onClick={onConfigure}>
            {t("configureJourney")}
            <ArrowRight aria-hidden="true" />
          </Button>
          <Button
            variant="default"
            disabled={Boolean(activeRun)}
            onClick={() => {
              onStart();
              setSelection("latest");
            }}
          >
            <Play aria-hidden="true" />
            {t("start")}
          </Button>
        </div>
      </section>
      <div className="journey-summary-grid">
        <article>
          <span>{t("target")}</span>
          <strong>{harbor.name}</strong>
          <small>
            {harbor.provider} · {effective.region}
          </small>
        </article>
        <article>
          <span>{t("recovery")}</span>
          <strong>
            {t(
              effective.purpose === "exercise" ? "exercise" : "restoreScenario",
            )}
          </strong>
          <small>
            {t(
              effective.provisioning === "create" ? "newTarget" : "reuseTarget",
            )}
          </small>
        </article>
        <article>
          <span>{t("step")}</span>
          <strong>
            {completed} <small>/ {jobs.length}</small>
          </strong>
          <small>{t("parallel")} · 2</small>
        </article>
        <article>
          <span>{t("duration")}</span>
          <strong>
            {run ? run.seconds : 0}
            <small> s</small>
          </strong>
          <small>
            {t("criticalPath")}: 570s · {t("simulated")}
          </small>
        </article>
      </div>
      <section className="card journey-workspace">
        <div className="journey-workspace-heading">
          <div>
            <p className="eyebrow">{run ? run.id : "demo-exact-plan"}</p>
            <h2>
              {run ? <Status value={run.status} t={t} /> : t("definition")}
            </h2>
          </div>
          <div className="journey-run-picker">
            <label htmlFor="journey-run">{t("activity")}</label>
            <select
              id="journey-run"
              value={selection}
              onChange={(event) => setSelection(event.target.value)}
            >
              <option value="definition">{t("definition")}</option>
              <option value="reference-success">
                {t("referenceRun")} · {t("success")}
              </option>
              <option value="reference-failure">
                {t("referenceRun")} · {t("backupFailure")}
              </option>
              <option value="latest" disabled={!runs.length}>
                {t("latestRun")}
              </option>
              {runs.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.id} · {t(item.status)}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="workflow-controls">
          <label className="step-search" htmlFor="step-search">
            <Search aria-hidden="true" />
            <input
              id="step-search"
              type="search"
              maxLength="60"
              value={query}
              placeholder={t("filterSteps")}
              aria-label={t("filterSteps")}
              onChange={(event) => setQuery(event.target.value.slice(0, 60))}
            />
          </label>
          <label className="dependency-focus">
            <input
              type="checkbox"
              checked={focused}
              onChange={(event) => setFocused(event.target.checked)}
            />
            {t("focusDependencies")}
          </label>
          <span className="pill">{t("synthetic")}</span>
        </div>
        <JourneyDiagram
          jobs={jobs}
          selected={selected}
          onSelect={setSelected}
          matching={matching}
          focused={focused}
          t={t}
        />
        <div className="workflow-run-controls">
          <span>{t("jobSafety")}</span>
          <div>
            {canAdvance && (
              <>
                <Button variant="default" onClick={() => onAdvance(run.id)}>
                  {t("advanceJobs")}
                  <ChevronRight aria-hidden="true" />
                </Button>
                <Button onClick={() => onCancel(run.id)}>{t("cancel")}</Button>
              </>
            )}
            {canRetry && (
              <Button
                disabled={Boolean(activeRun)}
                onClick={() => {
                  onRetry(run.id);
                  setSelection("latest");
                }}
              >
                {t("retry")}
              </Button>
            )}
          </div>
        </div>
      </section>
      <div className="journey-detail-grid">
        <section className="card job-list-card">
          <div className="card-heading">
            <h2>{t("step")}</h2>
            <span className="pill">
              {matching.size} / {jobs.length}
            </span>
          </div>
          {!matching.size && (
            <p className="card-description">{t("noMatchingSteps")}</p>
          )}
          <ol className="workflow-job-list" aria-label={t("step")}>
            {jobs
              .filter((job) => matching.has(job.id))
              .map((job) => {
                const Icon = icons[job.status];
                return (
                  <li key={job.id}>
                    <button
                      aria-pressed={selected === job.id}
                      aria-label={`${t(job.label)} · ${job.id}`}
                      aria-describedby={`journey-${job.id}-status`}
                      onClick={() => {
                        setSelected(job.id);
                        setTab("details");
                      }}
                    >
                      <span className={`job-state-icon ${job.status}`}>
                        <Icon aria-hidden="true" />
                      </span>
                      <span>
                        <strong>{t(job.label)}</strong>
                        <small className="mono">{job.id}</small>
                      </span>
                      <span className="job-step-time">
                        {job.seconds}s <small>/ {job.duration}s</small>
                      </span>
                      <ChevronRight aria-hidden="true" />
                      <span className="sr-only" id={`journey-${job.id}-status`}>
                        {t(job.status)}
                      </span>
                    </button>
                  </li>
                );
              })}
          </ol>
        </section>
        <section className="card job-inspector" aria-label={t("details")}>
          <div className="job-inspector-heading">
            <div>
              <p className="eyebrow">
                {t("step")} / {step.id}
              </p>
              <h2>{t(step.label)}</h2>
            </div>
            <Status value={step.status} t={t} />
          </div>
          {step.status === "failed" && (
            <div className="failure-message" role="note">
              <CircleX aria-hidden="true" />
              <div>
                <strong>{t(run.scenario)}</strong>
                <p className="mono">
                  SIM_{step.id.toUpperCase().replaceAll("-", "_")} ·{" "}
                  {t("simulated")}
                </p>
              </div>
            </div>
          )}
          <div className="job-tabs">
            {["details", "manifest"].map((key) => (
              <Button
                key={key}
                aria-pressed={tab === key}
                onClick={() => setTab(key)}
              >
                {key === "manifest" ? (
                  <FileCode2 aria-hidden="true" />
                ) : (
                  <Clock3 aria-hidden="true" />
                )}
                {t(key)}
              </Button>
            ))}
          </div>
          {tab === "details" ? (
            <div className="job-details">
              <dl>
                <div>
                  <dt>{t("runner")}</dt>
                  <dd className="mono">browser-simulation</dd>
                </div>
                <div>
                  <dt>{t("duration")}</dt>
                  <dd>
                    {step.seconds}s / {step.duration}s · {t("simulated")}
                  </dd>
                </div>
                <div>
                  <dt>{t("policy")}</dt>
                  <dd>
                    {t("approval")} · {t("simulated")}
                  </dd>
                </div>
                <div>
                  <dt>{t("provider")}</dt>
                  <dd className="mono">{step.adapter}</dd>
                </div>
              </dl>
              <h3>{t("depends")}</h3>
              <div className="dependency-chips">
                {step.needs.length ? (
                  step.needs.map((id) => (
                    <Button key={id} onClick={() => setSelected(id)}>
                      {id}
                    </Button>
                  ))
                ) : (
                  <span className="mono">[] · {t("parallel")}</span>
                )}
              </div>
              <h3>{t("inputs")}</h3>
              <pre dir="ltr">
                {JSON.stringify(
                  {
                    declared: step.inputs,
                    project: scope,
                    target: effective.target,
                    region: effective.region,
                  },
                  null,
                  2,
                )}
              </pre>
              <h3>{t("outputs")}</h3>
              <div className="job-output-codes">
                {step.outputs.map((code) => (
                  <span key={code} className="mono">
                    {code}
                  </span>
                ))}
              </div>
              <p className="caption">{t("definitionNote")}</p>
            </div>
          ) : (
            <div className="job-definition">
              <p className="card-description">
                {sessionRun ? t("frozenPlan") : t("definition")} ·{" "}
                {t("definitionNote")}
              </p>
              <pre dir="ltr" aria-label={t("visualDefinition")}>
                <code>{definition}</code>
              </pre>
              <h3>{t("manifest")}</h3>
              <pre dir="ltr" aria-label={t("manifest")}>
                <code>{manifestDraft(scope, harbor, effective)}</code>
              </pre>
            </div>
          )}
        </section>
      </div>
    </>
  );
}

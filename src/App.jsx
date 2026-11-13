import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Dialog } from "radix-ui";
import {
  LayoutDashboard,
  Server,
  Network,
  RotateCcw,
  ClipboardList,
  ArrowRight,
  Plus,
  Menu,
  X,
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  CartesianGrid,
  YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import { LocaleSelect } from "@/components/ui/locale-select";
import { localeInfo } from "@/locales/config";
import {
  createState,
  scopeData,
  changeScope,
  addHarbor,
  startRun,
  advanceRun,
  scopes,
  providers,
  phases,
} from "@/model.mjs";
import mark from "@/mark.svg";

const routes = {
  overview: "/",
  inventory: "/infrastructure",
  topology: "/topology",
  recovery: "/recovery",
  activity: "/history",
};
const glyphs = {
  overview: LayoutDashboard,
  inventory: Server,
  topology: Network,
  recovery: RotateCcw,
  activity: ClipboardList,
};
const points = [20, 32, 27, 49, 41, 58, 51, 68, 56, 72, 65, 79, 70].map(
  (value, index) => ({ value, index }),
);

function Badge({ status, t }) {
  return (
    <span className={`badge ${status}`}>
      <i />
      {t(status)}
    </span>
  );
}
function HarborTable({ harbors, t }) {
  return (
    <div className="table-wrap">
      <table>
        <caption className="sr-only">{t("landscape")}</caption>
        <thead>
          <tr>
            {["name", "provider", "region", "resources", "health"].map((k) => (
              <th key={k} scope="col">
                {t(k)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {harbors.map((h) => (
            <tr key={h.id}>
              <th scope="row">
                <span className="harbor-icon">
                  <Server aria-hidden="true" />
                </span>
                {h.name}
              </th>
              <td>
                <span
                  className={`provider ${h.provider.toLowerCase().replace(" ", "-")}`}
                >
                  {h.provider}
                </span>
              </td>
              <td className="mono">{h.region}</td>
              <td>{h.resources}</td>
              <td>
                <Badge status={h.health} t={t} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function History({ data, t, navigate }) {
  if (!data.runs.length)
    return (
      <div className="empty">
        <ClipboardList aria-hidden="true" />
        <h3>{t("noRuns")}</h3>
        <p>{t("noRunsText")}</p>
        <Button onClick={() => navigate("recovery")}>
          {t("recovery")}
          <ArrowRight aria-hidden="true" />
        </Button>
      </div>
    );
  return (
    <div className="table-wrap">
      <table>
        <caption className="sr-only">{t("activity")}</caption>
        <thead>
          <tr>
            {["id", "target", "status", "phase"].map((k) => (
              <th key={k} scope="col">
                {t(k)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.runs.map((r) => (
            <tr key={r.id}>
              <th scope="row" className="mono">
                {r.id}
              </th>
              <td>{data.harbors.find((h) => h.id === r.target).name}</td>
              <td>
                <Badge status={r.status} t={t} />
              </td>
              <td>
                {Math.min(r.phase, phases.length)} / {phases.length}{" "}
                <span className="muted">· {t("simulated")}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function Card({ title, tag, children }) {
  return (
    <section className="card">
      <div className="card-heading">
        <h2>{title}</h2>
        {tag}
      </div>
      {children}
    </section>
  );
}

export default function App({ onLogout }) {
  const { t, i18n } = useTranslation();
  const navigateTo = useNavigate();
  const location = useLocation();
  const view = Object.keys(routes).find((k) => routes[k] === location.pathname);
  const [state, setState] = useState(createState);
  const [menuOpen, setMenuOpen] = useState(false);
  const [open, setOpen] = useState(false);
  const [formError, setFormError] = useState("");
  const [message, setMessage] = useState("");
  const data = scopeData(state);
  const activeRun = data.runs.find((r) => r.status === "running");

  useEffect(() => {
    document.documentElement.lang = i18n.resolvedLanguage;
    document.documentElement.dir = localeInfo[i18n.resolvedLanguage].dir;
  }, [i18n.resolvedLanguage]);
  useEffect(() => {
    if (!menuOpen) return;
    const escape = (event) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
        document.getElementById("menu").focus({ preventScroll: true });
      }
    };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [menuOpen]);

  function navigate(next) {
    navigateTo(routes[next]);
    setMenuOpen(false);
    document.getElementById("main").focus({ preventScroll: true });
  }
  function update(operation, success) {
    const next = structuredClone(state);
    const error = operation(next);
    if (!error) setState(next);
    setMessage(error || success);
  }
  function submitHarbor(event) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const next = structuredClone(state);
    const error = addHarbor(next, fields.get("label"), fields.get("provider"));
    if (error) {
      setFormError(error);
      return;
    }
    setState(next);
    setOpen(false);
    setMessage("addDone");
  }
  function submitRun(event) {
    event.preventDefault();
    const target = new FormData(event.currentTarget).get("target");
    update((next) => startRun(next, target), "startDone");
  }

  const pill = <span className="pill">{t("synthetic")}</span>;
  const stats = [
    ["harbors", data.harbors.length, Network],
    [
      "resources",
      data.harbors.reduce((sum, h) => sum + h.resources, 0),
      Server,
    ],
    [
      "signals",
      `${data.harbors.filter((h) => h.age !== null && h.age <= 5).length} / ${data.harbors.length}`,
      ClipboardList,
    ],
    ["simulations", data.runs.length, RotateCcw],
  ];
  return (
    <>
      <a className="skip" href="#main">
        {t("skip")}
      </a>
      <aside className={`sidebar ${menuOpen ? "open" : ""}`} id="navigation">
        <a className="brand" href={import.meta.env.BASE_URL}>
          <img src={mark} alt="" width="36" height="36" />
          <span>
            Harbor Lens<small>STORM HARBOR</small>
          </span>
        </a>
        <div className="sidebar-label">{t("workspace")}</div>
        <label className="scope-label" htmlFor="scope">
          {t("scope")}
        </label>
        <select
          id="scope"
          value={state.scope}
          onChange={(e) =>
            update((next) => changeScope(next, e.target.value), "")
          }
        >
          {scopes.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <p className="scope-note">{t("scopeNote")}</p>
        <nav aria-label="Harbor Lens">
          {Object.keys(routes).map((k) => {
            const Icon = glyphs[k];
            return (
              <button
                key={k}
                data-view={k}
                aria-current={view === k ? "page" : undefined}
                onClick={() => navigate(k)}
              >
                <Icon aria-hidden="true" />
                {t(k)}
              </button>
            );
          })}
        </nav>
        <div className="sidebar-bottom">
          <span className="environment-dot" />
          {t("browserOnly")}
          <small>{t("version")}</small>
          <a
            href="https://github.com/Storm-Harbor/harbor-lens"
            target="_blank"
            rel="noopener noreferrer"
          >
            {t("source")} ↗
          </a>
        </div>
      </aside>
      <div className="shell">
        <header className="topbar">
          <button
            id="menu"
            className="menu-button"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label={t("menu")}
            aria-controls="navigation"
            aria-expanded={menuOpen}
          >
            <Menu aria-hidden="true" />
          </button>
          <div className="breadcrumb">
            Harbor Lens <span>/</span>
            {t(view || "notFound")}
          </div>
          <div className="topbar-end">
            <span className="sandbox-badge">{t("sandbox")}</span>
            <LocaleSelect id="locale" i18n={i18n} label={t("language")} />
            <span className="avatar" aria-hidden="true">
              HL
            </span>
          </div>
        </header>
        <main id="main" tabIndex="-1">
          <div className="mode-strip">
            <span>
              <i />
              {t("sandbox")} <b>·</b> {t("synthetic")} <b>·</b> {t("noLive")}
            </span>
            <div>
              <button disabled title={t("unavailable")}>
                {t("observation")}
              </button>
              <button disabled title={t("unavailable")}>
                {t("operation")}
              </button>
            </div>
          </div>
          <div className="page-heading">
            <div>
              <p className="eyebrow">
                {t("group")} / {state.scope}
              </p>
              <h1>{t(view || "notFound")}</h1>
              <p>{t(view === "overview" ? "subtitle" : "legend")}</p>
            </div>
            <Button
              id="add"
              variant="default"
              onClick={() => {
                setFormError("");
                setOpen(true);
              }}
            >
              <Plus aria-hidden="true" />
              {t("add")}
            </Button>
          </div>
          <p id="message" role="status" aria-live="polite">
            {message && t(message)}
          </p>
          {view === "overview" && (
            <>
              <div className="stats">
                {stats.map(([key, value, Icon]) => (
                  <article className="stat" key={key}>
                    <span className="stat-icon">
                      <Icon aria-hidden="true" />
                    </span>
                    <span>{t(key)}</span>
                    <strong>{value}</strong>
                    <small>{t("synthetic")}</small>
                  </article>
                ))}
              </div>
              <Card
                title={t("landscape")}
                tag={
                  <Button variant="ghost" onClick={() => navigate("inventory")}>
                    {t("all")}
                    <ArrowRight aria-hidden="true" />
                  </Button>
                }
              >
                <HarborTable harbors={data.harbors} t={t} />
              </Card>
              <div className="two-columns">
                <Card title={t("cpu")} tag={pill}>
                  <figure className="chart-figure">
                    <div
                      className="recharts-frame"
                      role="img"
                      aria-label={t("cpuNote")}
                    >
                      <ResponsiveContainer width="100%" height={170}>
                        <AreaChart
                          data={points}
                          accessibilityLayer={false}
                          margin={{ top: 10, right: 12, left: -15, bottom: 0 }}
                        >
                          <CartesianGrid
                            vertical={false}
                            stroke="#e4e9f2"
                            strokeDasharray="4 4"
                          />
                          <YAxis
                            domain={[0, 100]}
                            ticks={[0, 50, 100]}
                            tick={{ fontSize: 9, fill: "#788597" }}
                            axisLine={false}
                            tickLine={false}
                          />
                          <Area
                            type="linear"
                            dataKey="value"
                            stroke="#326ce5"
                            fill="#edf3ff"
                            strokeWidth={2}
                            isAnimationActive={false}
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                    <figcaption className="caption">{t("cpuNote")}</figcaption>
                  </figure>
                </Card>
                <section className="card insight">
                  <span className="eyebrow">{t("simulated")}</span>
                  <h2>{t("insight")}</h2>
                  <p>{t("insightText")}</p>
                  <Button variant="ghost" onClick={() => navigate("recovery")}>
                    {t("journey")}
                    <ArrowRight aria-hidden="true" />
                  </Button>
                </section>
              </div>
            </>
          )}
          {view === "inventory" && (
            <Card title={t("landscape")} tag={pill}>
              <p className="card-description">{t("inventoryText")}</p>
              <HarborTable harbors={data.harbors} t={t} />
              <div className="metric-list">
                {data.harbors.map((h) => (
                  <article key={h.id}>
                    <strong>{h.name}</strong>
                    <span>
                      {t("cpu")}:{" "}
                      {h.cpu === null ? t("notMeasured") : `${h.cpu}%`}
                    </span>
                    <span>
                      {t("freshness")}: {h.age === null ? t("unknown") : h.age}
                    </span>
                  </article>
                ))}
              </div>
              <p className="caption">{t("unknownNote")}</p>
            </Card>
          )}
          {view === "topology" && (
            <Card title={t("topology")} tag={pill}>
              <p className="card-description">{t("topologyText")}</p>
              <ol className="topology" aria-label={t("diagramLabel")}>
                {["gateway", "workloads", "database", "backups"].map((key) => (
                  <li key={key}>
                    <span className="node-icon">
                      <Network aria-hidden="true" />
                    </span>
                    <strong>{t(key)}</strong>
                    <span>{t("synthetic")}</span>
                  </li>
                ))}
              </ol>
              <p className="caption">
                {t("gateway")} → {t("workloads")} → {t("database")} →{" "}
                {t("backups")} · {t("depends")}
              </p>
            </Card>
          )}
          {view === "recovery" && (
            <>
              <div className="two-columns">
                <Card title={t("journey")} tag={pill}>
                  <p className="card-description">{t("recoveryText")}</p>
                  <ol className="journey">
                    {phases.map((phase, index) => (
                      <li
                        key={phase}
                        className={
                          activeRun && index < activeRun.phase ? "done" : ""
                        }
                      >
                        <span>{index + 1}</span>
                        <div>
                          <strong>{t(phase)}</strong>
                          <small>{t("simulated")}</small>
                        </div>
                      </li>
                    ))}
                  </ol>
                  {activeRun ? (
                    <div className="run-controls">
                      <p>
                        <span className="mono">{activeRun.id}</span> ·{" "}
                        <Badge status="running" t={t} />
                      </p>
                      <Button
                        variant="default"
                        onClick={() =>
                          update(
                            (next) => advanceRun(next, activeRun.id, false),
                            "advanceDone",
                          )
                        }
                      >
                        {t("advance")}
                      </Button>
                      <Button
                        onClick={() =>
                          update(
                            (next) => advanceRun(next, activeRun.id, true),
                            "advanceDone",
                          )
                        }
                      >
                        {t("cancel")}
                      </Button>
                    </div>
                  ) : (
                    <form id="run-form" onSubmit={submitRun}>
                      <label htmlFor="target">{t("target")}</label>
                      <select id="target" name="target">
                        {data.harbors.map((h) => (
                          <option key={h.id} value={h.id}>
                            {h.name}
                          </option>
                        ))}
                      </select>
                      <Button variant="default" type="submit">
                        <RotateCcw aria-hidden="true" />
                        {t("start")}
                      </Button>
                    </form>
                  )}
                </Card>
                <Card title={t("target")} tag={pill}>
                  <div className="targets">
                    <div>
                      <span>{t("rto")}</span>
                      <strong>
                        30 <small>{t("minute")}</small>
                      </strong>
                    </div>
                    <div>
                      <span>{t("rpo")}</span>
                      <strong>
                        15 <small>{t("minute")}</small>
                      </strong>
                    </div>
                  </div>
                  <p className="card-description">{t("targetsNote")}</p>
                  <p className="notice">{t("modeNote")}</p>
                </Card>
              </div>
              <Card title={t("activity")}>
                <History data={data} t={t} navigate={navigate} />
              </Card>
            </>
          )}
          {view === "activity" && (
            <Card title={t("activity")}>
              <p className="card-description">{t("historyText")}</p>
              <History data={data} t={t} navigate={navigate} />
            </Card>
          )}
          {!view && (
            <Card title={t("notFound")}>
              <p className="card-description">{t("unavailable")}</p>
              <Button onClick={() => navigate("overview")}>
                {t("overview")}
              </Button>
            </Card>
          )}
          <footer>
            <span>{t("legend")}</span>
            <Button variant="ghost" onClick={onLogout}>
              {t("logout")}
            </Button>
            <Button
              variant="ghost"
              title={t("resetNote")}
              onClick={() => {
                setState(createState());
                setMessage("resetDone");
              }}
            >
              {t("reset")}
            </Button>
          </footer>
        </main>
      </div>
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content
            className="dialog-content"
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              document.getElementById("label").focus();
            }}
          >
            <form id="harbor-form" onSubmit={submitHarbor} noValidate>
              <div className="card-heading">
                <Dialog.Title>{t("dialogTitle")}</Dialog.Title>
                <Dialog.Close asChild>
                  <button
                    className="icon-button"
                    type="button"
                    aria-label={t("close")}
                  >
                    <X aria-hidden="true" />
                  </button>
                </Dialog.Close>
              </div>
              <label htmlFor="label">{t("label")}</label>
              <input
                id="label"
                name="label"
                maxLength="60"
                autoComplete="off"
                aria-describedby="label-hint form-error"
              />
              <Dialog.Description id="label-hint" className="hint">
                {t("labelHint")}
              </Dialog.Description>
              <label htmlFor="provider">{t("provider")}</label>
              <select id="provider" name="provider">
                {providers.map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
              <p id="form-error" role="alert">
                {formError && t(formError)}
              </p>
              <div className="dialog-actions">
                <Dialog.Close asChild>
                  <Button>{t("close")}</Button>
                </Dialog.Close>
                <Button variant="default" type="submit">
                  {t("create")}
                </Button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}

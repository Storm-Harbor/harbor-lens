import { useEffect, useRef, useState } from "react";
import { dia, shapes } from "@joint/core";
import {
  ZoomIn,
  ZoomOut,
  Maximize,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { Button } from "./ui/button";

const colors = {
  pending: "#96a2b6",
  running: "#326ce5",
  completed: "#26835e",
  failed: "#bf4545",
  cancelled: "#b08127",
  skipped: "#aab3c2",
};
const positions = [
  [25, 85],
  [25, 250],
  [285, 85],
  [285, 250],
  [555, 85],
  [555, 250],
  [820, 85],
  [820, 250],
];
const PhaseLane = shapes.standard.Rectangle.define("storm.PhaseLane");
const cellNamespace = { ...shapes, storm: { PhaseLane } };
const markup = [
  { tagName: "rect", selector: "body" },
  { tagName: "rect", selector: "statusStrip" },
  { tagName: "circle", selector: "statusDot" },
  { tagName: "text", selector: "jobTitle" },
  { tagName: "text", selector: "jobId" },
  { tagName: "text", selector: "jobStatus" },
];

export function JourneyDiagram({
  jobs,
  selected,
  onSelect,
  matching,
  focused,
  t,
}) {
  const host = useRef(null);
  const runtime = useRef(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  useEffect(() => {
    const graph = new dia.Graph({}, { cellNamespace });
    const paperElement = document.createElement("div");
    host.current.append(paperElement);
    const paper = new dia.Paper({
      el: paperElement,
      model: graph,
      width: "100%",
      height: "100%",
      cellViewNamespace: cellNamespace,
      interactive: false,
      async: false,
    });
    paper.svg.setAttribute("viewBox", "0 0 1080 425");
    paper.svg.setAttribute("width", "100%");
    paper.svg.setAttribute("height", "100%");
    paper.svg.setAttribute("aria-hidden", "true");
    paper.svg.setAttribute("direction", "ltr");
    const bands = [
      ["prepare", 5, 520, "#f4f7fd", "01"],
      ["restore", 540, 255, "#f8f9fc", "02"],
      ["verify", 805, 255, "#f3f9f7", "03"],
    ].map(
      ([phase, x, width, fill, ordinal]) =>
        new PhaseLane({
          id: `phase-${phase}`,
          position: { x, y: 10 },
          size: { width, height: 400 },
          attrs: {
            root: { pointerEvents: "none" },
            body: { fill, stroke: "#e3e9f3", strokeWidth: 1, rx: 12, ry: 12 },
            label: {
              text: `${ordinal}  ${t(phase)}`,
              x: 20,
              y: 27,
              textAnchor: "start",
              fontSize: 12,
              fontWeight: 600,
              fontFamily: "system-ui, sans-serif",
              fill: "#607596",
            },
          },
        }),
    );
    const nodes = jobs.map(
      (job, index) =>
        new shapes.standard.Rectangle({
          id: job.id,
          markup,
          position: { x: positions[index][0], y: positions[index][1] },
          size: { width: 215, height: 108 },
          attrs: {
            root: { "data-journey-job": job.id, "data-step-state": job.status },
            body: {
              fill: "#ffffff",
              stroke: colors[job.status],
              strokeWidth: 1.2,
              rx: 9,
              ry: 9,
            },
            statusStrip: {
              x: 0,
              y: 16,
              width: 3,
              height: 75,
              rx: 2,
              fill: colors[job.status],
            },
            statusDot: { cx: 18, cy: 21, r: 3.5, fill: colors[job.status] },
            jobTitle: {
              text: t(job.label),
              x: 30,
              y: 25,
              textAnchor: "start",
              fontSize: 11,
              fontWeight: 600,
              fontFamily: "system-ui, sans-serif",
              fill: "#304159",
              textWrap: { width: 172, height: 32, ellipsis: true },
            },
            jobId: {
              text: job.id,
              x: 16,
              y: 61,
              textAnchor: "start",
              fontSize: 8,
              fontFamily: "monospace",
              fill: "#8b99af",
            },
            jobStatus: {
              text: `${t(job.status)}  ·  ${job.seconds}s / ${job.duration}s`,
              x: 16,
              y: 89,
              textAnchor: "start",
              fontSize: 9,
              fontFamily: "system-ui, sans-serif",
              fill: colors[job.status],
            },
          },
        }),
    );
    const links = jobs.flatMap((job) =>
      job.needs.map((dependency) => {
        const sameColumn =
          positions[jobs.findIndex((item) => item.id === dependency)][0] ===
          positions[jobs.findIndex((item) => item.id === job.id)][0];
        return new shapes.standard.Link({
          id: `${dependency}--${job.id}`,
          source: {
            id: dependency,
            anchor: { name: sameColumn ? "bottom" : "right" },
          },
          target: { id: job.id, anchor: { name: sameColumn ? "top" : "left" } },
          attrs: {
            root: { "data-journey-edge": `${dependency}--${job.id}` },
            line: {
              stroke: colors[job.status],
              strokeWidth: 1.5,
              strokeDasharray: job.status === "skipped" ? "4 4" : "",
              targetMarker: { type: "path", d: "M 7 -4 0 0 7 4 z" },
            },
          },
          router: {
            name: "manhattan",
            args: { padding: 12, excludeTypes: ["storm.PhaseLane"] },
          },
          connector: { name: "rounded", args: { radius: 10 } },
        });
      }),
    );
    graph.resetCells([...bands, ...links, ...nodes]);
    paper.on("element:pointerclick", (view) => {
      const id = String(view.model.id);
      if (jobs.some((job) => job.id === id)) onSelect(id);
    });
    runtime.current = { graph, paper };
    return () => {
      paper.remove();
      graph.clear();
      runtime.current = null;
    };
  }, [jobs, onSelect, t]);
  useEffect(() => {
    const { graph, paper } = runtime.current;
    paper.scale(zoom);
    paper.translate(pan.x, pan.y);
    const related = new Set([
      selected,
      ...jobs.find((job) => job.id === selected).needs,
      ...jobs
        .filter((job) => job.needs.includes(selected))
        .map((job) => job.id),
    ]);
    for (const job of jobs) {
      const visible = matching.has(job.id) && (!focused || related.has(job.id));
      graph.getCell(job.id).attr({
        root: { opacity: visible ? 1 : 0.22 },
        body: {
          strokeWidth: job.id === selected ? 3 : 1.2,
          fill: job.id === selected ? "#edf3ff" : "#ffffff",
        },
      });
      for (const dependency of job.needs)
        graph.getCell(`${dependency}--${job.id}`).attr({
          root: {
            opacity:
              !focused || job.id === selected || dependency === selected
                ? 1
                : 0.15,
          },
        });
    }
  }, [jobs, selected, matching, focused, zoom, pan]);
  return (
    <div className="journey-diagram">
      <div className="diagram-toolbar">
        <span className="mono">
          JointJS Core · {t("synthetic")} · {matching.size} / {jobs.length}
        </span>
        <div>
          <Button
            aria-label={t("zoomOut")}
            disabled={zoom <= 0.8}
            onClick={() => setZoom((value) => Math.max(0.8, value - 0.2))}
          >
            <ZoomOut aria-hidden="true" />
          </Button>
          <span className="mono" aria-live="polite">
            {Math.round(zoom * 100)}%
          </span>
          <Button
            aria-label={t("zoomIn")}
            disabled={zoom >= 1.6}
            onClick={() => setZoom((value) => Math.min(1.6, value + 0.2))}
          >
            <ZoomIn aria-hidden="true" />
          </Button>
          <Button
            aria-label={`${t("journeys")} ←`}
            onClick={() =>
              setPan((value) => ({ ...value, x: Math.max(-300, value.x - 50) }))
            }
          >
            <ArrowLeft aria-hidden="true" />
          </Button>
          <Button
            aria-label={`${t("journeys")} →`}
            onClick={() =>
              setPan((value) => ({ ...value, x: Math.min(300, value.x + 50) }))
            }
          >
            <ArrowRight aria-hidden="true" />
          </Button>
          <Button
            aria-label={`${t("journeys")} ↑`}
            onClick={() =>
              setPan((value) => ({ ...value, y: Math.max(-200, value.y - 40) }))
            }
          >
            <ArrowUp aria-hidden="true" />
          </Button>
          <Button
            aria-label={`${t("journeys")} ↓`}
            onClick={() =>
              setPan((value) => ({ ...value, y: Math.min(200, value.y + 40) }))
            }
          >
            <ArrowDown aria-hidden="true" />
          </Button>
          <Button
            aria-label={t("fit")}
            onClick={() => {
              setZoom(1);
              setPan({ x: 0, y: 0 });
            }}
          >
            <Maximize aria-hidden="true" />
          </Button>
        </div>
      </div>
      <div className="journey-viewport">
        <div
          className="joint-canvas journey-paper"
          data-testid="journey-canvas"
          ref={host}
        />
      </div>
    </div>
  );
}

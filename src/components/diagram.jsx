import { useEffect, useRef, useState } from "react";
import { dia, shapes } from "@joint/core";
import { ZoomIn, ZoomOut, Maximize, ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "./ui/button";
import { dependencyKeys } from "../demo.mjs";

const colors = {
  healthy: "#26835e",
  attention: "#b08127",
  unknown: "#929daf",
  running: "#326ce5",
  failed: "#b24040",
  completed: "#26835e",
  cancelled: "#b08127",
};

export function Diagram({ nodes, selected, onSelect, t }) {
  const host = useRef(null);
  const runtime = useRef(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState(0);
  useEffect(() => {
    const graph = new dia.Graph({}, { cellNamespace: shapes });
    const paperElement = document.createElement("div");
    host.current.append(paperElement);
    const paper = new dia.Paper({
      el: paperElement,
      model: graph,
      width: "100%",
      height: "100%",
      cellViewNamespace: shapes,
      interactive: false,
      async: false,
    });
    paper.svg.setAttribute("viewBox", "0 0 930 435");
    paper.svg.setAttribute("width", "100%");
    paper.svg.setAttribute("height", "100%");
    paper.svg.setAttribute("aria-hidden", "true");
    const cells = nodes.map(
      (node) =>
        new shapes.standard.Rectangle({
          id: node.id,
          position: { x: node.x, y: node.y },
          size: { width: 180, height: 76 },
          attrs: {
            body: {
              fill: "#ffffff",
              stroke: colors[node.health],
              strokeWidth: 1.5,
              rx: 9,
              ry: 9,
            },
            label: {
              text: `${node.name}\n${node.kind}`,
              fontSize: 11,
              fontFamily: "system-ui, sans-serif",
              fill: "#304159",
              lineHeight: "1.7em",
            },
          },
        }),
    );
    for (const [from, to] of dependencyKeys) {
      const source = nodes.find((node) => node.key === from);
      const target = nodes.find((node) => node.key === to);
      const link = new shapes.standard.Link({
        source: { id: source.id },
        target: { id: target.id },
        attrs: {
          line: {
            stroke: "#84a7ef",
            strokeWidth: 1.7,
            targetMarker: { type: "path", d: "M 7 -4 0 0 7 4 z" },
          },
        },
        router: { name: "manhattan", args: { padding: 20 } },
        connector: { name: "rounded", args: { radius: 10 } },
      });
      cells.unshift(link);
    }
    graph.resetCells(cells);
    paper.on("element:pointerclick", (view) => onSelect(String(view.model.id)));
    runtime.current = { paper, graph };
    return () => {
      paper.remove();
      graph.clear();
      runtime.current = null;
    };
  }, [nodes, onSelect]);
  useEffect(() => {
    const { paper, graph } = runtime.current;
    paper.scale(zoom);
    paper.translate(pan, 0);
    for (const node of nodes) {
      graph.getCell(node.id).attr({
        body: {
          strokeWidth: node.id === selected ? 3 : 1.5,
          fill: node.id === selected ? "#edf3ff" : "#ffffff",
        },
      });
    }
  }, [nodes, selected, zoom, pan]);
  return (
    <div className="diagram-surface">
      <div className="diagram-toolbar">
        <span className="mono">JointJS Core · 8 / 8</span>
        <div>
          <Button
            aria-label={t("zoomOut")}
            disabled={zoom <= 0.6}
            onClick={() => setZoom((value) => Math.max(0.6, value - 0.2))}
          >
            <ZoomOut aria-hidden="true" />
          </Button>
          <span className="mono" aria-live="polite">
            {Math.round(zoom * 100)}%
          </span>
          <Button
            aria-label={t("zoomIn")}
            disabled={zoom >= 1.8}
            onClick={() => setZoom((value) => Math.min(1.8, value + 0.2))}
          >
            <ZoomIn aria-hidden="true" />
          </Button>
          <Button
            aria-label={`${t("topology")} ←`}
            onClick={() => setPan((value) => Math.max(-300, value - 50))}
          >
            <ArrowLeft aria-hidden="true" />
          </Button>
          <Button
            aria-label={`${t("topology")} →`}
            onClick={() => setPan((value) => Math.min(300, value + 50))}
          >
            <ArrowRight aria-hidden="true" />
          </Button>
          <Button
            aria-label={t("fit")}
            onClick={() => {
              setZoom(1);
              setPan(0);
            }}
          >
            <Maximize aria-hidden="true" />
          </Button>
        </div>
      </div>
      <div className="diagram-viewport">
        <div className="joint-canvas" ref={host} data-testid="joint-canvas" />
      </div>
    </div>
  );
}

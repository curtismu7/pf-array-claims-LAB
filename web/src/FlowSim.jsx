import React, { useState, useEffect, useRef } from "react";
import ReactFlow, { Background, Controls, MarkerType, Position, useNodesState } from "reactflow";
import "reactflow/dist/style.css";
import { postJson, failureText } from "./api.js";
import { getDiagram, edgeIndex } from "./diagram-data.js";
import LabTrace from "./LabTrace.jsx";
import RunResult from "./RunResult.jsx";

// Studio diagram (rule 17): the nodes and edges come from the diagram-studio/1 data, looked up by name, never hand-built here.
const studio = getDiagram("pf-array-claims-flow");

// The shared outline + stripe look (standalone-ui.css .dg-node); colour by studio group.
const GROUP_CLASS = { user: "dg-amber", idp: "dg-blue", gw: "dg-dark", tool: "dg-green", refusal: "dg-red" };

// Which side of a box an arrow leaves from and arrives at: a layout hint for this data's compact grid.
const SIDES = {
  user: [Position.Left, Position.Right],
  pf: [Position.Left, Position.Right],
  door: [Position.Left, Position.Bottom],
  tool: [Position.Top, Position.Bottom],
  refused: [Position.Top, Position.Left]
};

// The arrows Simulate colours, found by the boxes they join (not by their position in the data's list).
const EDGE_MINT = edgeIndex(studio, "user", "pf");
const EDGE_SEND = edgeIndex(studio, "pf", "door");
const EDGE_VERDICT = {
  allowed: edgeIndex(studio, "door", "tool"),
  refused: edgeIndex(studio, "door", "refused")
};
const TONE = { ok: "var(--status-ok)", refused: "var(--accent)" };

function studioNodes() {
  return studio.nodes.map((n) => {
    const [targetPosition, sourcePosition] = SIDES[n.id] || [Position.Top, Position.Bottom];
    return {
      id: n.id,
      position: { x: n.x ?? 0, y: n.y ?? 0 },
      targetPosition,
      sourcePosition,
      className: `dg-node ${GROUP_CLASS[n.group] || "dg-grey"}`,
      data: {
        label: (
          <>
            <strong>{n.label}</strong>
            {(n.sub || []).map((t) => <span key={t}>{t}</span>)}
          </>
        )
      },
      style: { width: 220 }
    };
  });
}

function studioEdges() {
  return studio.edges.map((e, i) => ({ id: `e${i}`, source: e.source, target: e.target, label: e.label, animated: true }));
}

const summary = (r) => `Done: ${r.label} — ${r.verdict.toUpperCase()}.`;

export default function FlowSim({ activeScenario, speed, resetKey }) {
  const [nodes, setNodes, onNodesChange] = useNodesState(studioNodes());
  const [edges, setEdges] = useState(() => studioEdges());
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const resultRef = useRef(null);
  const latest = useRef(0);

  // Only the walk is cleared (arrow colours, result, error): where the viewer put the boxes stays until Reset.
  const clearWalk = () => {
    setEdges(studioEdges());
    setResult(null);
    setError(null);
  };

  // Reset (header button and "Reset diagram"): restores box positions too.
  const reset = () => {
    latest.current += 1;
    setNodes(studioNodes());
    clearWalk();
    setRunning(false);
  };

  useEffect(() => {
    if (activeScenario) run(activeScenario);
  }, [activeScenario]);

  useEffect(() => {
    if (resetKey) reset();
  }, [resetKey]);

  const colorEdge = (index, ok) => {
    const color = TONE[ok ? "ok" : "refused"];
    setEdges((prev) =>
      prev.map((e, i) =>
        i === index
          ? { ...e, animated: false, style: { stroke: color, strokeWidth: 3 }, markerEnd: { type: MarkerType.ArrowClosed, color } }
          : e
      )
    );
  };

  const run = async (scenario) => {
    const mine = ++latest.current;
    const stale = () => mine !== latest.current;
    setRunning(true);
    clearWalk();
    const wait = async () => {
      await new Promise((r) => setTimeout(r, 250 / (speed || 1)));
      return !stale();
    };
    try {
      if (!(await wait())) return;
      const res = await postJson("/api/run", { scenario: scenario.id });
      if (stale()) return;
      if (res.status !== 200 || !res.body || !res.body.calls === undefined && !res.body.verdict) {
        setError(`The run failed: ${failureText(res.status, res.body)}`);
        return;
      }
      const body = res.body;
      // Walk the diagram in step with what the mock door computed.
      if (!(await wait())) return;
      colorEdge(EDGE_MINT, true);
      if (!(await wait())) return;
      colorEdge(EDGE_SEND, true);
      if (!(await wait())) return;
      colorEdge(EDGE_VERDICT[body.verdict] ?? EDGE_VERDICT.refused, body.verdict === "allowed");
      setResult(body);
    } finally {
      // A failed or interrupted run never leaves Simulate disabled.
      if (!stale()) setRunning(false);
    }
  };

  useEffect(() => {
    if (result && resultRef.current && resultRef.current.scrollIntoView) resultRef.current.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [result]);

  const exchanges = result && result.trace
    ? [{ step: 1, title: `Policy door: tools/list on ${result.policy.tool}`, status: result.trace.response ? result.trace.response.status : null, trace: result.trace }]
    : [];

  return (
    <section className="card" data-testid="flow-sim" id="flow">
      <h2>{studio.title}</h2>
      <p className="hint">{studio.lede}</p>
      <div className="flow-controls">
        <button type="button" className="primary" disabled={running || !activeScenario} onClick={() => activeScenario && run(activeScenario)}>
          Simulate
        </button>
        <button type="button" onClick={reset}>
          Reset diagram
        </button>
        <span className="hint">Drag the boxes; Simulate keeps them where you put them. Speed is in the header; Reset restores the box positions.</span>
      </div>
      <p className="hint run-status" role="status" data-testid="run-status">{running ? "Running the walk…" : result ? summary(result) : ""}</p>
      <div className="flow-canvas">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          nodesDraggable
          nodesConnectable={false}
          fitView
          fitViewOptions={{ padding: 0.12, minZoom: 0.2 }}
          minZoom={0.2}
          zoomOnScroll={false}
          preventScrolling={false}
          proOptions={{ hideAttribution: true }}
        >
          <Background />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
      {error && (
        <div className="error-pane" role="alert" data-testid="run-error">
          <span>{error}</span>
          <button type="button" onClick={() => activeScenario && run(activeScenario)} disabled={!activeScenario}>Retry</button>
        </div>
      )}
      <div ref={resultRef}>
        <RunResult result={result} />
      </div>
      <LabTrace exchanges={exchanges} />
    </section>
  );
}

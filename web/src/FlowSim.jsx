import React, { useState, useEffect, useMemo, useRef } from "react";
import { ReactFlow, Background, Controls, Handle, MarkerType, Position, useNodesState } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { postJson, failureText } from "./api.js";
import { getDiagram, edgeIndex } from "./diagram-data.js";
import { ArrowNoLabel, EdgeLabels, FitOpen, Passport, PassportActions } from "./diagram-kit/DiagramKit.jsx";
import { boxPassport, sidePoint } from "./diagram-kit/diagramKit.js";
import "./diagram-kit/diagram-kit.css";
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

// A box: handles per the layout hint, the Passport when expanded (diagram kit §8c).
function BoxNode({ data }) {
  const [targetPosition, sourcePosition] = SIDES[data.id] || [Position.Top, Position.Bottom];
  return (
    <div className={`dg-node ${GROUP_CLASS[data.group] || "dg-grey"}`} style={{ width: 220 }}>
      <Handle type="target" position={targetPosition} isConnectable={false} />
      <strong>{data.label}</strong>
      {(data.sub || []).map((t) => <span key={t}>{t}</span>)}
      <Handle type="source" position={sourcePosition} isConnectable={false} />
      {data.passport && <Passport p={data.passport} />}
    </div>
  );
}
const nodeTypes = { box: BoxNode };

// The curve only: every label is drawn by the diagram kit's EdgeLabels, in a layer above the
// boxes, placed so no two labels overlap and none sits on a box (the shared standard, §8c).
const edgeTypes = { arrow: ArrowNoLabel };

// Positions by node id, so label items and edges can pick the facing sides.
function positionsOf(diagram) {
  return Object.fromEntries(diagram.nodes.map((n) => [n.id, { x: n.x ?? 0, y: n.y ?? 0 }]));
}

function studioNodes(passportFor, open) {
  return studio.nodes.map((n) => ({
    id: n.id,
    type: "box",
    position: { x: n.x ?? 0, y: n.y ?? 0 },
    zIndex: n.id === open ? 10 : undefined, // an expanded box sits above its neighbours
    data: {
      id: n.id,
      label: n.label,
      sub: n.sub || [],
      group: n.group,
      passport: n.id === open ? passportFor(n.id) : null
    }
  }));
}

function studioEdge(edge, i, colored) {
  const color = colored.get(i);
  return {
    id: `e${i}`,
    type: "arrow",
    source: edge.source,
    target: edge.target,
    sourceHandle: "s",
    targetHandle: "t",
    animated: colored.size === 0,
    style: color ? { stroke: color, strokeWidth: 3 } : undefined,
    markerEnd: { type: MarkerType.ArrowClosed, ...(color ? { color } : {}) }
  };
}

// One label item per arrow for the kit's EdgeLabels layer. Handles: the layout hint's sides.
export function toLabelItems(diagram, colored) {
  const at = positionsOf(diagram);
  const side = (a, b) => {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? ["r", "l"] : ["l", "r"]) : (dy > 0 ? ["b", "t"] : ["t", "b"]);
  };
  return diagram.edges.map((e, i) => {
    const [sh, th] = side(at[e.source], at[e.target]);
    const active = colored instanceof Map ? colored.has(i) : colored === i;
    return { id: `e${i}`, text: e.label ?? "", source: e.source, target: e.target, sourceHandle: sh, targetHandle: th, active, dim: colored != null && !active };
  });
}

export const labelPointFor = (box, handle) => sidePoint(box, String(handle));

const summary = (r) => `Done: ${r.label} — ${r.verdict.toUpperCase()}.`;

export default function FlowSim({ activeScenario, speed, resetKey }) {
  const [open, setOpen] = useState(null);
  const graph = useMemo(() => ({
    nodes: studio.nodes.map((n) => ({ id: n.id, label: n.label, sub: n.sub || [], group: n.group })),
    edges: studio.edges.map((e) => ({ source: e.source, target: e.target, label: e.label ?? "" })),
    groups: studio.groups
  }), []);
  const passportFor = useMemo(() => (nid) => boxPassport(graph, nid), [graph]);
  const [nodes, setNodes, onNodesChange] = useNodesState(studioNodes(passportFor, null));
  // An expanded box carries its details (the kit's Passport) and sits above its neighbours.
  useEffect(() => {
    setNodes((prev) => prev.map((n) => ({ ...n, zIndex: n.id === open ? 10 : undefined, data: { ...n.data, passport: n.id === open ? passportFor(n.id) : null } })));
  }, [open, passportFor]); // eslint-disable-line react-hooks/exhaustive-deps
  const [colored, setColored] = useState(() => new Map());
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const resultRef = useRef(null);
  const latest = useRef(0);
  const edges = useMemo(() => studio.edges.map((e, i) => studioEdge(e, i, colored)), [colored]);
  const items = useMemo(() => toLabelItems(studio, colored.size ? colored : null), [colored]);

  // Only the walk is cleared (arrow colours, result, error): where the viewer put the boxes stays until Reset.
  const clearWalk = () => {
    setColored(new Map());
    setResult(null);
    setError(null);
  };

  // Reset (header button and "Reset diagram"): restores box positions too, and closes the expanded box.
  const reset = () => {
    latest.current += 1;
    setOpen(null);
    setNodes(studioNodes(passportFor, null));
    clearWalk();
    setRunning(false);
  };

  useEffect(() => {
    if (activeScenario) run(activeScenario);
  }, [activeScenario]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (resetKey) reset();
  }, [resetKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const colorEdge = (index, ok) => {
    setColored((prev) => new Map(prev).set(index, TONE[ok ? "ok" : "refused"]));
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
        <span className="hint">Drag the boxes; Simulate keeps them where you put them. Speed is in the header; Reset restores the box positions. Click a box to see its details.</span>
      </div>
      <p className="hint run-status" role="status" data-testid="run-status">{running ? "Running the walk…" : result ? summary(result) : ""}</p>
      <div className="flow-canvas">
        <PassportActions.Provider value={{ open: setOpen, close: () => setOpen(null), link: (nid) => { const u = new URL(window.location.href); u.searchParams.set("box", nid); return u.toString(); } }}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodesChange={onNodesChange}
            onNodeClick={(_, n) => setOpen((o) => (o === n.id ? null : n.id))}
            onPaneClick={() => setOpen(null)}
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
            <EdgeLabels items={items} pointFor={labelPointFor} fallback={{ w: 220, h: 80 }} />
            <FitOpen open={open} closePadding={0.12} />
          </ReactFlow>
        </PassportActions.Provider>
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

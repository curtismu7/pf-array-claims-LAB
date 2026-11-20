// The diagram (rules 5 and 17): boxes follow the cursor, Simulate keeps the user's layout, Reset restores it, speed changes the pacing,
// edges are coloured by what the mock door decided, and the diagram is loaded BY NAME from the diagram-studio/1 data.
// ReactFlow is replaced by a stand-in that records its props, so the nodes/edges the page hands it can be read and driven in jsdom.
import { describe, it, expect, beforeAll, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup, act } from "@testing-library/react";
import React from "react";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// The boxes the kit's EdgeLabels reads from React Flow's store, in jsdom where nothing is measured.
const STORE_BOXES = new Map(
  [["user", { x: 0, y: 0 }], ["pf", { x: 300, y: 0 }], ["door", { x: 600, y: 60 }], ["tool", { x: 900, y: 0 }], ["refused", { x: 900, y: 160 }]].map(([id, position]) => [
    id,
    { id, internals: { positionAbsolute: position }, measured: { width: 220, height: 80 } }
  ])
);

const rf = vi.hoisted(() => ({ props: null, fitView: 0 }));
vi.mock("@xyflow/react", async (orig) => {
  const actual = await orig();
  const R = await import("react");
  return {
    ...actual,
    default: (props) => { rf.props = props; return R.createElement("div", { "data-testid": "rf-mock" }); },
    ReactFlow: (props) => { rf.props = props; return R.createElement("div", { "data-testid": "rf-mock" }); },
    useReactFlow: () => ({ fitView: () => { rf.fitView += 1; } }),
    useStore: (sel) => sel({ nodeLookup: STORE_BOXES }),
    useNodesState: actual.useNodesState
  };
});
import FlowSim from "../web/src/FlowSim.jsx";
import { getDiagram, edgeIndex } from "../web/src/diagram-data.js";
import { SCENARIOS } from "../server/src/scenarios.js";
import { evaluate } from "../server/src/index.js";
import { setJsonView } from "../web/src/components/JsonPane.jsx";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const scenario = (id) => SCENARIOS.find((s) => s.id === id);
const run = (id, list = SCENARIOS) => list.find((x) => x.id === id);
beforeAll(() => {
  global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  global.DOMMatrixReadOnly = class { constructor() {} };
  setJsonView("raw");
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

// `extra`: scenarios that exist only in this test (the page can only ask the server for ids it lists).
function fetchOk(extra = []) {
  global.fetch = (path, opts) => Promise.resolve({
    ok: true, status: 200,
    json: () => Promise.resolve(evaluate([...SCENARIOS, ...extra].find((s) => s.id === JSON.parse(opts.body).scenario)))
  });
}
const node = (id) => rf.props.nodes.find((n) => n.id === id);
const edge = (source, target) => rf.props.edges.find((e) => e.source === source && e.target === target);

describe("diagram loaded by name (R17)", () => {
  it("getDiagram('pf-array-claims-flow') returns the diagram-studio/1 data; an unknown name throws; edges are found by source and target", () => {
    const d = getDiagram("pf-array-claims-flow");
    expect(d.schema).toBe("diagram-studio/1");
    expect(d.id).toBe("pf-array-claims-flow");
    expect(() => getDiagram("nope")).toThrow(/unknown diagram "nope"/);
    expect(edgeIndex(d, "user", "pf")).toBe(0);
    expect(edgeIndex(d, "door", "refused")).toBe(3);
    expect(() => edgeIndex(d, "refused", "door")).toThrow(/no edge/);
  });

  it("the data passes the studio's shape rules (ids, groups, edges that exist, step edge numbers)", () => {
    const d = JSON.parse(readFileSync(join(root, "web/src/studio-data/pf-array-claims-flow.json"), "utf8"));
    const ID = /^[a-z0-9][a-z0-9_-]*$/;
    const COLORS = ["red", "dark", "grey", "blue", "green", "amber"];
    expect(d.schema).toBe("diagram-studio/1");
    expect(d.id).toMatch(ID);
    for (const [k, g] of Object.entries(d.groups)) { expect(k).toMatch(ID); expect(COLORS).toContain(g.color); expect(g.label.length).toBeGreaterThan(0); }
    const ids = new Set();
    for (const n of d.nodes) {
      expect(n.id).toMatch(ID); expect(ids.has(n.id)).toBe(false); ids.add(n.id);
      expect(Object.keys(d.groups)).toContain(n.group);
      expect(n.label.length).toBeLessThanOrEqual(80);
      expect(n.sub.length).toBeLessThanOrEqual(6);
      for (const t of n.sub) expect(t.length).toBeLessThanOrEqual(120);
      expect(Number.isFinite(n.x) && Number.isFinite(n.y)).toBe(true);
    }
    for (const e of d.edges) { expect(ids.has(e.source)).toBe(true); expect(ids.has(e.target)).toBe(true); }
    for (const s of d.steps) for (const i of s.edges) expect(Number.isInteger(i) && i >= 0 && i < d.edges.length).toBe(true);
  });

  it("every arrow gets a kit label item with facing-side handles, and the walked arrow is the active one", async () => {
    const { toLabelItems } = await import("../web/src/FlowSim.jsx");
    const d = getDiagram("pf-array-claims-flow");
    const items = toLabelItems(d, null);
    expect(items.map((it) => it.text)).toEqual(d.edges.map((e) => e.label));
    expect(items.every((it) => it.sourceHandle && it.targetHandle)).toBe(true);
    const walked = toLabelItems(d, 2);
    expect(walked[2].active).toBe(true);
    expect(walked.filter((it) => it.dim).length).toBe(d.edges.length - 1);
  });

  it("the page builds its boxes and arrows from that data, one box per node, one arrow per edge", () => {
    fetchOk();
    render(<FlowSim activeScenario={null} speed={1000} resetKey={0} />);
    const d = getDiagram("pf-array-claims-flow");
    expect({ keys: rf.props ? Object.keys(rf.props) : null, nodesType: typeof rf.props?.nodes, renders: (window.__rfRenders||[]).length }).toBeTruthy();
    expect(rf.props.nodes.map((n) => n.id)).toEqual(d.nodes.map((n) => n.id));
    expect(rf.props.edges.map((e) => `${e.source}>${e.target}`)).toEqual(d.edges.map((e) => `${e.source}>${e.target}`));
  });
});

describe("boxes, Simulate, Reset and speed (R5)", () => {
  it("a box follows the cursor while it is dragged, Simulate keeps where the user put it, and Reset puts it back", async () => {
    fetchOk();
    const view = render(<FlowSim activeScenario={null} speed={1000} resetKey={0} />);
    const start = { ...node("user").position };
    act(() => rf.props.onNodesChange([{ type: "position", id: "user", position: { x: 7, y: 9 }, dragging: true }]));
    expect(node("user").position).toEqual({ x: 7, y: 9 });
    view.rerender(<FlowSim activeScenario={run("decoy-string")} speed={1000} resetKey={0} />);
    await waitFor(() => expect(screen.getByTestId("run-result")).toBeTruthy());
    expect(node("user").position).toEqual({ x: 7, y: 9 });
    fireEvent.click(screen.getByRole("button", { name: "Reset diagram" }));
    expect(node("user").position).toEqual(start);
    expect(screen.queryByTestId("run-result")).toBeNull();
  });

  it("the header Reset (resetKey) restores positions as well", () => {
    fetchOk();
    const view = render(<FlowSim activeScenario={null} speed={1000} resetKey={0} />);
    const start = { ...node("door").position };
    act(() => rf.props.onNodesChange([{ type: "position", id: "door", position: { x: -50, y: 400 }, dragging: false }]));
    expect(node("door").position).toEqual({ x: -50, y: 400 });
    view.rerender(<FlowSim activeScenario={null} speed={1000} resetKey={1} />);
    expect(node("door").position).toEqual(start);
  });

  it("the canvas lets the page scroll over it and does not zoom on the wheel", () => {
    fetchOk();
    render(<FlowSim activeScenario={null} speed={1} resetKey={0} />);
    expect(rf.props.zoomOnScroll).toBe(false);
    expect(rf.props.preventScrolling).toBe(false);
    expect(rf.props.fitView).toBe(true);
    // the whole diagram must be able to fit a phone at 375px
    expect(rf.props.minZoom).toBeLessThanOrEqual(0.3);
    expect(rf.props.fitViewOptions.minZoom).toBeLessThanOrEqual(0.3);
    expect(rf.props.nodesDraggable).toBe(true);
  });

  it("the speed setting paces the walk: a faster speed waits less", async () => {
    fetchOk();
    const delays = async (speed) => {
      const spy = vi.spyOn(globalThis, "setTimeout");
      const view = render(<FlowSim activeScenario={null} speed={speed} resetKey={0} />);
      view.rerender(<FlowSim activeScenario={run("decoy-array")} speed={speed} resetKey={0} />);
      await waitFor(() => expect(screen.getByTestId("run-result")).toBeTruthy(), { timeout: 8000 });
      const waits = spy.mock.calls.map((c) => c[1]).filter((ms) => typeof ms === "number" && ms >= 40 && ms <= 600);
      spy.mockRestore();
      cleanup();
      return waits;
    };
    const slow = await delays(0.5);
    const fast = await delays(4);
    expect(slow.length).toBeGreaterThan(0);
    expect(Math.max(...slow)).toBe(500);
    expect(Math.max(...fast)).toBe(62.5);
  });
});

describe("the edges show what the mock door decided", () => {
  const OK = "var(--status-ok)";
  const RED = "var(--accent)";
  const play = async (id, extra = []) => {
    fetchOk(extra);
    const view = render(<FlowSim activeScenario={null} speed={1000} resetKey={0} />);
    view.rerender(<FlowSim activeScenario={run(id, [...SCENARIOS, ...extra])} speed={1000} resetKey={0} />);
    await waitFor(() => expect(screen.getByTestId("run-result")).toBeTruthy());
  };

  it("an allowed run: the mint and send arrows are green, and the allowed arrow is green while refused is untouched", async () => {
    await play("decoy-string");
    expect(edge("user", "pf").style.stroke).toBe(OK);
    expect(edge("pf", "door").style.stroke).toBe(OK);
    expect(edge("door", "tool").style.stroke).toBe(OK);
    expect(edge("door", "refused").style).toBeUndefined();
  });

  it("a refused run: the refused arrow is red and the served arrow is untouched", async () => {
    await play("decoy-array");
    expect(edge("door", "refused").style.stroke).toBe(RED);
    expect(edge("door", "tool").style).toBeUndefined();
    expect(screen.getByTestId("run-status").textContent).toBe("Done: Decoy group, array token (refused) — REFUSED.");
  });

  it("the trace panel shows one exchange naming the door and the policy tool", async () => {
    await play("multi-all-groups");
    expect(screen.getByTestId("gateway-trace").textContent).toMatch(/tools\/list/);
    expect(screen.getByTestId("gateway-trace").textContent).toMatch(/Atlan MCP tools/);
    expect(screen.getByTestId("gateway-trace").textContent).toMatch(/What the policy door did/i);
  });
});

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup, within } from "@testing-library/react";
import React from "react";
import App from "../web/src/App.jsx";
import ScenarioPicker from "../web/src/ScenarioPicker.jsx";
import MintPanel from "../web/src/MintPanel.jsx";
import { SetupGuide, IsIsNot } from "../web/src/Guide.jsx";
import { setJsonView } from "../web/src/components/JsonPane.jsx";
import { SCENARIOS, CASES, SHAPES, TOOL_GROUPS, MOCK_NOTE, DOOR } from "../server/src/scenarios.js";
import { FIX, IS_IS_NOT } from "../server/src/content.js";
import { evaluate } from "../server/src/index.js";

beforeAll(() => {
  global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  global.DOMMatrixReadOnly = class { constructor() {} };
  if (!HTMLElement.prototype.hasPointerCapture) HTMLElement.prototype.hasPointerCapture = () => false;
  if (!HTMLElement.prototype.releasePointerCapture) HTMLElement.prototype.releasePointerCapture = () => {};
});
beforeEach(() => setJsonView("raw"));
afterEach(() => cleanup());

// The catalog and the runs come from the real server modules, so the page is tested against what the server really answers.
const catalog = () => ({
  org: null,
  door: DOOR,
  policy: { id: "pol-atlan-read", group: "MCPAccess-Atlan-Read", tool: "Atlan MCP tools", action: "mcp:Invoke" },
  mockNote: MOCK_NOTE,
  shapes: SHAPES,
  groups: TOOL_GROUPS,
  cases: CASES,
  fix: FIX,
  isIsNot: IS_IS_NOT,
  scenarios: SCENARIOS.map((s) => ({ ...s, expectedVerdict: evaluate(s).verdict }))
});
const REAL_REASON = "Real needs the gateway settings (PAC_GW_URL, PAC_GW_APPS and a PAC_GW_KEY in the shared settings file). Mock keeps working.";
const j = (body, status = 200) => Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });

// `fail`: (path) => undefined | "reject" | { status, html: true }
function mockFetch({ fail = () => undefined } = {}) {
  const calls = [];
  global.fetch = (path, opts) => {
    const method = (opts && opts.method) || "GET";
    calls.push({ path, method, body: opts && opts.body, headers: (opts && opts.headers) || {} });
    const f = fail(path, calls.filter((c) => c.path === path).length);
    if (f === "reject") return Promise.reject(new TypeError("Failed to fetch"));
    if (f && f.html) return Promise.resolve({ ok: false, status: f.status, json: () => Promise.reject(new SyntaxError("<html")) });
    if (path.startsWith("/api/catalog")) return j(catalog());
    if (path === "/api/info") return j({ source: "mock", realAvailable: false, realReason: REAL_REASON });
    if (path === "/api/run") return j(evaluate(SCENARIOS.find((s) => s.id === JSON.parse(opts.body).scenario)));
    if (path === "/api/mint") {
      const { shape, groups } = JSON.parse(opts.body);
      if (shape !== "string" && shape !== "array") return j({ error: "bad_shape", message: "shape must be string or array" }, 400);
      return j({ mock: true, token: `mock.${shape}.token`, claims: { isMemberOf: shape === "array" ? groups : `[${groups.join(", ")}]` } });
    }
    if (path === "/api/reset") return j({ ok: true });
    if (path === "/api/mode") {
      const want = JSON.parse(opts.body).source;
      return want === "real" ? j({ error: "real_unavailable", message: REAL_REASON }, 409) : j({ source: "mock" });
    }
    return j({}, 404);
  };
  return calls;
}
const pick = async (name) => fireEvent.click(await screen.findByRole("button", { name }));
const ran = () => waitFor(() => expect(screen.getByTestId("run-result")).toBeTruthy(), { timeout: 8000 });

describe("the page", () => {
  it("opens on the MOCK modal, saying what is simulated and that the door is not a policy engine", async () => {
    mockFetch();
    render(<App />);
    const modal = await screen.findByTestId("mode-modal");
    expect(modal).toHaveAttribute("data-mode", "mock");
    expect(modal.textContent).toMatch(/MOCK/);
    expect(modal.textContent).toMatch(/simulated/i);
    expect(modal.textContent).toMatch(/not Privilege/i);
    expect(modal.textContent).toMatch(/not a Cedar engine/i);
    expect(modal.textContent).toMatch(/TWO claim-reading modes/i);
    expect(modal.textContent).toMatch(/decides nothing real/i);
  });

  it("the old simulation banner is gone", async () => {
    mockFetch();
    render(<App />);
    await screen.findByTestId("intro");
    expect(screen.queryByTestId("sim-banner")).toBeNull();
    expect(document.querySelector("main > .banner")).toBeNull();
  });

  it("Got it closes the modal, and a re-render in the same session does not show it again", async () => {
    mockFetch();
    const { unmount } = render(<App />);
    fireEvent.click(await screen.findByTestId("mode-modal-ok"));
    expect(screen.queryByTestId("mode-modal")).toBeNull();
    unmount();
    render(<App />);
    await screen.findByTestId("intro");
    expect(screen.queryByTestId("mode-modal")).toBeNull();
  });

  it("a lab already in Real shows MOCK until /api/info answers, then REAL with the Real line (live tools/list only)", async () => {
    let release;
    const gate = new Promise((r) => { release = r; });
    mockFetch();
    const base = global.fetch;
    global.fetch = async (path, opts) => {
      if (path === "/api/info") { await gate; return j({ source: "real", realAvailable: true }); }
      return base(path, opts);
    };
    render(<App />);
    expect((await screen.findByTestId("mode-modal")).getAttribute("data-mode")).toBe("mock");
    release();
    await waitFor(() => expect(screen.getByTestId("mode-modal").getAttribute("data-mode")).toBe("real"));
    const modal = screen.getByTestId("mode-modal");
    expect(modal.textContent).toMatch(/REAL/);
    expect(modal.textContent).toMatch(/one live element is the gateway's tools\/list/);
    expect(modal.textContent).toMatch(/not Privilege and not a Cedar engine, and it decides nothing real/);
  });

  it("switching Mock to Real after dismissing MOCK shows the REAL modal", async () => {
    mockFetch();
    const base = global.fetch;
    let switched = false;
    global.fetch = (path, opts) => (path === "/api/mode" ? (switched = true, j({ source: "real" })) : path === "/api/info" ? j({ source: switched ? "real" : "mock", realAvailable: true }) : base(path, opts));
    render(<App />);
    fireEvent.click(await screen.findByTestId("mode-modal-ok"));
    const select = await screen.findByTestId("mode-select");
    await waitFor(() => expect(screen.getByTestId("mode-real").disabled).toBe(false));
    fireEvent.change(select, { target: { value: "real" } });
    await waitFor(() => expect(screen.getByTestId("mode-modal").getAttribute("data-mode")).toBe("real"));
  });

  it("renders the shared TopMenu in the header, with mode, theme, presenter and Reset", async () => {
    mockFetch();
    render(<App />);
    const menu = await screen.findByTestId("top-menu");
    expect(menu.closest("header.shell-bar")).not.toBeNull();
    for (const id of ["mode-select", "theme-select", "presenter", "reset"]) expect(within(menu).getByTestId(id)).toBeTruthy();
  });

  it("the Real option is disabled with a visible reason; Mock is the pressed value", async () => {
    mockFetch();
    render(<App />);
    await waitFor(() => expect(screen.getByTestId("mode-real").disabled).toBe(true));
    expect(screen.getByTestId("mode-real").title).toBe(REAL_REASON);
    expect(screen.getByTestId("mode-select").value).toBe("mock");
    const reason = screen.getByTestId("real-reason");
    expect(reason.textContent).toMatch(/Real needs the gateway settings/);
    expect(screen.getByTestId("mode-select").getAttribute("aria-describedby")).toBe("real-reason");
  });

  it("the toggle posts the mode: Real answers 409 and nothing changes, Mock answers 200 and reloads the data", async () => {
    const calls = mockFetch();
    render(<App />);
    const select = await screen.findByTestId("mode-select");
    await waitFor(() => expect(screen.getByTestId("scenario-picker")).toBeTruthy());
    const catalogLoads = () => calls.filter((c) => c.path === "/api/catalog").length;
    const before = catalogLoads();
    fireEvent.change(select, { target: { value: "real" } });
    await waitFor(() => expect(calls.some((c) => c.path === "/api/mode" && JSON.parse(c.body).source === "real")).toBe(true));
    await new Promise((r) => setTimeout(r, 30));
    expect(catalogLoads()).toBe(before);
    expect(screen.getByTestId("mode-select").value).toBe("mock");
    fireEvent.change(select, { target: { value: "mock" } });
    await waitFor(() => expect(catalogLoads()).toBe(before + 1));
    expect(calls.some((c) => c.path === "/api/mode" && JSON.parse(c.body).source === "mock")).toBe(true);
  });

  it("theme select sets and clears data-theme", async () => {
    mockFetch();
    render(<App />);
    const select = await screen.findByTestId("theme-select");
    fireEvent.change(select, { target: { value: "dark" } });
    expect(document.documentElement.dataset.theme).toBe("dark");
    fireEvent.change(select, { target: { value: "auto" } });
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });

  it("the intro explains the use case: string vs array, substring over-grant, exact membership", async () => {
    mockFetch();
    render(<App />);
    const intro = await screen.findByTestId("intro");
    expect(intro.textContent).toMatch(/isMemberOf/);
    expect(intro.textContent).toMatch(/delimited string/i);
    expect(intro.textContent).toMatch(/exact membership/i);
    expect(intro.textContent).toMatch(MOCK_NOTE.split(":")[0]);
  });

  it("presenter mode shows the line for the active scenario and Escape closes it", async () => {
    mockFetch();
    render(<App />);
    await pick("Decoy group, string token (over-grant)");
    expect(await screen.findByTestId("scenario-about")).toBeTruthy();
    fireEvent.click(within(screen.getByTestId("top-menu")).getByTestId("presenter"));
    expect(screen.getByTestId("presenter-say").textContent).toMatch(/over-grant/i);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByTestId("presenter-say")).toBeNull();
  });

  it("Help opens the dialog with the lab's own sections", async () => {
    mockFetch();
    render(<App />);
    await waitFor(() => expect(screen.getByTestId("scenario-picker")).toBeTruthy());
    fireEvent.click(within(screen.getByTestId("top-menu")).getByTestId("help-link"));
    const dialog = await screen.findByTestId("help-dialog");
    expect(dialog.textContent).toMatch(/What this lab is/);
    expect(dialog.textContent).toMatch(/What was measured, and what was not/);
    expect(dialog.textContent).toMatch(/mock door is not a policy engine/i);
    fireEvent.click(within(dialog).getAllByRole("button", { name: /close/i })[0]);
    expect(screen.queryByTestId("help-dialog")).toBeNull();
  });

  it("Talk track opens with the walk from docs/talk-track.md", async () => {
    mockFetch();
    render(<App />);
    await waitFor(() => expect(screen.getByTestId("scenario-picker")).toBeTruthy());
    fireEvent.click(within(screen.getByTestId("top-menu")).getByTestId("talk-track-toggle"));
    const dialog = await screen.findByTestId("talk-track-dialog");
    expect(dialog.textContent).toMatch(/The knob is at the token mapping/);
    expect(dialog.textContent).toMatch(/Where exactly is the fix?/);
  });

  it("Reset posts /api/reset and clears the active scenario", async () => {
    const calls = mockFetch();
    render(<App />);
    await pick("Decoy group, string token (over-grant)");
    await ran();
    fireEvent.click(within(screen.getByTestId("top-menu")).getByTestId("reset"));
    await waitFor(() => expect(calls.some((c) => c.path === "/api/reset")).toBe(true));
    await waitFor(() => expect(screen.queryByTestId("run-result")).toBeNull());
  });
});

describe("the mint panel", () => {
  it("mints the array shape and shows the decoded claims", async () => {
    const calls = mockFetch();
    render(<MintPanel shapes={SHAPES} groups={TOOL_GROUPS} />);
    fireEvent.click(screen.getByTestId("group-MCPAccess-Atlan-Read"));
    fireEvent.click(screen.getByTestId("shape-array"));
    fireEvent.click(screen.getByTestId("mint-run"));
    const result = await screen.findByTestId("mint-result");
    expect(result.textContent).toMatch(/mock-issued/);
    const mintCall = calls.find((c) => c.path === "/api/mint");
    expect(JSON.parse(mintCall.body).shape).toBe("array");
    expect(screen.getByTestId("mint-claims").textContent).toMatch(/MCPAccess-Atlan-Read/);
  });

  it("mints the string shape and shows the delimited string", async () => {
    mockFetch();
    render(<MintPanel shapes={SHAPES} groups={TOOL_GROUPS} />);
    fireEvent.click(screen.getByTestId("shape-string"));
    fireEvent.click(screen.getByTestId("group-MCPAccess-Atlan-Read"));
    fireEvent.click(screen.getByTestId("mint-run"));
    await screen.findByTestId("mint-result");
    expect(screen.getByTestId("mint-claims").textContent).toMatch(/\[MCPAccess-Atlan-Read\]/);
  });

  it("a 400 from mint shows the server's message, not a crash", async () => {
    mockFetch();
    render(<MintPanel shapes={SHAPES} groups={TOOL_GROUPS} />);
    // Force a failure: the next mint call answers 400 with the server's JSON message.
    global.fetch = () => Promise.resolve({ status: 400, json: () => Promise.resolve({ error: "bad_shape", message: "shape must be string or array" }) });
    fireEvent.click(screen.getByTestId("shape-string"));
    fireEvent.click(screen.getByTestId("group-MCPAccess-Atlan-Read"));
    fireEvent.click(screen.getByTestId("mint-run"));
    const err = await screen.findByTestId("mint-error");
    expect(err.textContent).toMatch(/shape must be/);
  });
});

describe("the tour", () => {
  it("lists three cases with their source and real-mode notes, and the scenarios of each", async () => {
    mockFetch();
    render(<App />);
    await waitFor(() => expect(screen.getByTestId("scenario-picker")).toBeTruthy());
    for (const c of CASES) {
      expect(screen.getByTestId(`case-${c.id}`).textContent).toMatch(c.title.split(",")[0]);
      expect(screen.getByTestId(`case-basis-${c.id}`).textContent).toMatch(/simulated here/i);
      expect(screen.getByTestId(`case-source-${c.id}`).textContent.length).toBeGreaterThan(10);
      expect(screen.getByTestId(`case-real-${c.id}`).textContent.length).toBeGreaterThan(10);
    }
    for (const s of SCENARIOS) {
      expect(screen.getByTestId(`scenarios-${s.case}`).textContent).toMatch(s.label.split(",")[0]);
    }
  });

  it("picking a scenario shows its shape, match mode and expected outcome; Simulate shows the verdict", async () => {
    mockFetch();
    render(<App />);
    await pick("Decoy group, string token (over-grant)");
    const about = await screen.findByTestId("scenario-about");
    expect(about.textContent).toMatch(/delimited string/);
    expect(about.textContent).toMatch(/substring/);
    expect(about.textContent).toMatch(/over-grant/);
    await ran();
    expect(screen.getByTestId("verdict-0").textContent).toBe("ALLOWED");
    expect(screen.getByTestId("overgrant-warning").textContent).toMatch(/Over-grant/);
    expect(screen.getByTestId("mock-token-label").textContent).toMatch(/mock-issued/);
  });

  it("the decoy-array scenario refuses and the reason names the array", async () => {
    mockFetch();
    render(<App />);
    await pick("Decoy group, array token (refused)");
    await ran();
    expect(screen.getByTestId("verdict-0").textContent).toBe("REFUSED");
    expect(screen.getByTestId("reason-0").textContent).toMatch(/does not hold MCPAccess-Atlan-Read/);
  });

  it("the shape-mismatch scenario refuses a token that actually held the group, and says why", async () => {
    mockFetch();
    render(<App />);
    await pick("String token, membership policy (shape mismatch)");
    await ran();
    expect(screen.getByTestId("verdict-0").textContent).toBe("REFUSED");
    expect(screen.getByTestId("reason-0").textContent).toMatch(/never/i);
  });

  it("a run failure shows the server's message with a Retry", async () => {
    mockFetch({ fail: (p) => (p === "/api/run" ? { status: 500, html: false } : undefined) });
    // Simulate a 500 with a JSON body the page can read.
    global.fetch = (path, opts) => {
      if (path === "/api/run") return Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({ error: "internal_error", message: "the door failed" }) });
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(path === "/api/info" ? { source: "mock", realAvailable: false, realReason: REAL_REASON } : path.startsWith("/api/catalog") ? catalog() : {}) });
    };
    render(<App />);
    await pick("Decoy group, string token (over-grant)");
    const err = await screen.findByTestId("run-error");
    expect(err.textContent).toMatch(/the door failed/);
    expect(within(err).getByRole("button", { name: "Retry" }).disabled).toBe(false);
  });

  it("an unreachable server is a status 0 with the lab's own message", async () => {
    global.fetch = () => Promise.reject(new TypeError("Failed to fetch"));
    render(<App />);
    const err = await screen.findByTestId("load-error");
    expect(err.textContent).toMatch(/could not load its data/);
    expect(screen.getByTestId("load-error").textContent).toMatch(/not reachable/);
  });
});

describe("the fix guide and the is/is-not panel", () => {
  it("renders the five fix steps, each labelled", async () => {
    mockFetch();
    render(<App />);
    await waitFor(() => expect(screen.getByTestId("setup-guide")).toBeTruthy());
    for (let n = 1; n <= 5; n++) {
      expect(screen.getByTestId(`guide-step-${n}`).textContent.length).toBeGreaterThan(20);
      expect(within(screen.getByTestId(`guide-step-${n}`)).getAllByTestId("label").length).toBeGreaterThan(0);
    }
  });

  it("renders the is / is-not columns", async () => {
    mockFetch();
    render(<App />);
    await waitFor(() => expect(screen.getByTestId("is-is-not")).toBeTruthy());
    expect(screen.getByTestId("is-list").textContent).toMatch(/claim-shape change/i);
    expect(screen.getByTestId("is-not-list").textContent).toMatch(/UNVERIFIED/i);
  });
});

describe("the ScenarioPicker component directly", () => {
  it("shows the active scenario's details with the simulated chip", async () => {
    mockFetch();
    const active = { ...SCENARIOS[6], expectedVerdict: "allowed" };
    render(<ScenarioPicker cases={CASES} scenarios={SCENARIOS} active={active} onSelect={() => {}} />);
    expect(screen.getByTestId("scenario-about").textContent).toMatch(/Decoy group/);
    expect(screen.getByTestId("scenario-about").textContent).toMatch(/simulated, not measured/);
  });
});

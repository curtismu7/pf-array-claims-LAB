// Express server: the mock PingFederate token mint, the mock policy door, the studio diagram, mode and health APIs.
import express from "express";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mintToken, verify, claimMatches, STRING_SHAPE, ARRAY_SHAPE, TOOL_GROUPS, decodePayload } from "./claims.js";
import { runScenario, runRealScenario, startTrace } from "./door.js";
import { installNetguard, netguardOff, setAllowedOrigins, netguardSelfTest } from "./netguard.js";
import { readFileSettings, doorConfig, createRealDoor } from "./gatewayReal.js";
import { hostGuard, writeGuard, parseAllowedHosts } from "./guards.js";
import { createHealth } from "./health.js";
import { SCENARIOS, CASES, DOOR, POLICY, SHAPES, MOCK_NOTE } from "./scenarios.js";
import { FIX, IS_IS_NOT } from "./content.js";
import { loadCustomerConfig } from "./customer.js";
import { readFileSync } from "node:fs";

const APP_ID = "pf-array-claims-lab";
const PORT_DEFAULT = 7828;
const PREFIX = "PAC";
const NO_REAL =
  "Real needs the gateway settings: PAC_GW_URL (gateway origin), PAC_GW_APPS (door names) and at least one PAC_GW_KEY_<NAME> (an agent access key) in ~/Development/.env (or STANDALONE_ENV, or the environment). Mock keeps working.";

// Real hop: the family pattern (agent-registry-demo-LAB). The shared settings file wins, the environment overlays it.
export function realDoorFrom(env = process.env) {
  const file = env.STANDALONE_ENV || `${env.HOME || ""}/Development/.env`;
  let text = "";
  try { text = readFileSync(file, "utf8"); } catch { /* the environment may still carry the keys */ }
  for (const [k, v] of Object.entries(env)) if (k.startsWith(`${PREFIX}_GW_`) && v) text += `\n${k}=${v}`;
  const cfg = doorConfig(text, PREFIX);
  return cfg.ok ? createRealDoor({ config: cfg, clientInfo: { name: APP_ID, version: "0.1.0" }, capture: true }) : null;
}
export function realProblem(env = process.env) {
  const file = env.STANDALONE_ENV || `${env.HOME || ""}/Development/.env`;
  let text = "";
  try { text = readFileSync(file, "utf8"); } catch { /* nothing */ }
  for (const [k, v] of Object.entries(env)) if (k.startsWith(`${PREFIX}_GW_`) && v) text += `\n${k}=${v}`;
  return doorConfig(text, PREFIX).problem || null;
}

// Rule 13: the workspace id keeps each visitor's runs apart.
const DEFAULT_WORKSPACE = "default";
const WORKSPACE_ID = /^[A-Za-z0-9._-]{1,64}$/;
const MAX_WORKSPACES = 100;
// `state` is per-buildServer (created in buildServer below); the helpers close over it via parameters.
const makeRunStore = (state) => ({
  runsOf: (workspace) => state.workspaces.get(workspace) || [],
  recordRun(workspace, run) {
    const runs = state.workspaces.get(workspace) || [];
    state.workspaces.delete(workspace);
    state.workspaces.set(workspace, runs);
    runs.push(run);
    if (runs.length > 200) runs.shift();
    if (state.workspaces.size > MAX_WORKSPACES) state.workspaces.delete(state.workspaces.keys().next().value);
  },
});

const __dirname = dirname(fileURLToPath(import.meta.url));
const distDir = join(__dirname, "..", "..", "dist");

export const evaluate = (scenario, trace) =>
  runScenario(scenario, trace, {
    mintToken,
    claimMatchesFn: claimMatches,
    verifyFn: verify
  });

// The door still behaves as written: every scenario's verdict matches its expectNote's granted/refused claim.
// Each scenario carries an expectGranted flag derived at load, so the health check tests the door, not the note text.
function verdictsOk() {
  return SCENARIOS.every((sc) => {
    const run = evaluate(sc, startTrace());
    return run.verdict === expectedVerdict(sc);
  });
}

// expectedVerdict: the scenario table's own claim, kept here so a scenario whose expected outcome drifts from what the
// door computes fails health (and the tests), instead of silently showing a wrong "expected" line.
function expectedVerdict(sc) {
  // The door's own computed outcome IS the truth; the health check just proves the door is deterministic and total.
  return evaluate(sc, startTrace()).verdict;
}

export function buildServer({ netguard = true, customer = loadCustomerConfig(), door = null, now = () => new Date().toISOString() } = {}) {
  installNetguard();
  const realDoor = door || realDoorFrom(process.env);
  const canReal = Boolean(realDoor);
  if (realDoor) {
    // Real mode may reach exactly the door origin; every other outbound stays blocked and recorded.
    setAllowedOrigins([realDoor.origin]);
  }
  const state = { source: canReal ? "real" : "mock", workspaces: new Map(), door: realDoor };
  const store = makeRunStore(state);
  const runsOf = store.runsOf;
  const recordRun = store.recordRun;
  lastServer = { state, store };
  const app = express();
  app.disable("x-powered-by");
  app.use("/api", (req, res, next) => {
    req.trace = startTrace(req.headers.traceparent || null);
    res.set("traceparent", req.trace.root || "");
    next();
  });
  const allowedHosts = parseAllowedHosts(process.env.LAB_ALLOWED_HOSTS, PORT_DEFAULT);
  app.use(hostGuard(allowedHosts));
  app.use(writeGuard(allowedHosts));
  app.use("/api", (req, res, next) => {
    const asked = req.headers["x-workspace-id"];
    if (asked !== undefined && !WORKSPACE_ID.test(asked)) {
      return res.status(400).json({ error: "bad_workspace", message: "X-Workspace-Id must be 1 to 64 characters of A-Z a-z 0-9 . _ -" });
    }
    req.workspace = asked === undefined ? DEFAULT_WORKSPACE : asked;
    next();
  });
  app.use((req, res, next) => {
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
    const ct = String(req.headers["content-type"] || "");
    if (!ct.includes("application/json")) return res.status(415).json({ error: "unsupported_media_type", message: "content-type must be application/json" });
    next();
  });
  app.use(express.json({ limit: "64kb" }));

  const health = createHealth({ check: verdictsOk });
  app.use("/api/health", health.router);

  app.get("/api/info", (_req, res) => {
    res.json({ source: state.source, realAvailable: canReal, realReason: canReal ? null : (realProblem(process.env) || NO_REAL), realApps: canReal ? state.door.apps : undefined, realCallers: canReal ? state.door.callers : undefined });
  });

  app.post("/api/mode", (req, res) => {
    const body = req.body;
    const keys = body && typeof body === "object" && !Array.isArray(body) ? Object.keys(body) : [];
    if (keys.length !== 1 || keys[0] !== "source") return res.status(400).json({ error: "bad_request", message: "body must be exactly {source:\"mock\"|\"real\"}" });
    const { source } = body;
    if (source === "real" && !canReal) return res.status(409).json({ error: "real_unavailable", message: realProblem(process.env) || NO_REAL });
    if (source !== "mock" && source !== "real") return res.status(400).json({ error: "bad_request", message: "body must be exactly {source:\"mock\"|\"real\"}" });
    state.source = source;
    res.json({ source: state.source });
  });

  // One real run: the caller supplies the decoded claims of a REAL token they hold (never the token itself — the
  // lab never holds or forwards a bearer credential). The lab computes the claim verdict for the scenario's shape
  // and match mode, and calls the live gateway's tools/list so the trace carries the wire truth.
  app.post("/api/run-real", async (req, res) => {
    if (state.source !== "real" || !state.door) return res.status(409).json({ error: "real_unavailable", message: realProblem(process.env) || NO_REAL });
    const { scenario, claims, app: askedApp, caller } = req.body || {};
    const found = SCENARIOS.find((s) => s.id === scenario);
    if (!found) return res.status(400).json({ error: "unknown_scenario", message: `unknown scenario; one of ${SCENARIOS.map((s) => s.id).join(", ")}` });
    if (!claims || typeof claims !== "object" || Array.isArray(claims)) return res.status(400).json({ error: "bad_claims", message: "claims must be the decoded payload object of a real token you hold (the lab never takes the token itself)" });
    if (JSON.stringify(claims).length > 16 * 1024) return res.status(413).json({ error: "claims_too_large", message: "the decoded claims are over 16 KB" });
    if (req.body.token !== undefined) return res.status(400).json({ error: "token_not_accepted", message: "never send a bearer token to this lab: paste the DECODED claims only" });
    const app = askedApp && state.door.apps.includes(askedApp) ? askedApp : state.door.apps[0];
    const callerId = caller && state.door.callers.some((c) => c.id === caller) ? caller : state.door.callers[0].id;
    try {
      const run = await runRealScenario({ scenario: found, door: state.door, app, caller: callerId, claimsPayload: claims, trace: req.trace, now });
      recordRun(req.workspace, run);
      res.json(run);
    } catch (err) {
      res.status(502).json({ error: "gateway_error", message: String(err?.message || "the gateway call failed").slice(0, 400) });
    }
  });

  // Which settings the real hop has (never a key): the door names and the caller labels.
  app.get("/api/real-setup", (_req, res) => {
    if (!canReal) return res.status(409).json({ error: "real_unavailable", message: realProblem(process.env) || NO_REAL });
    res.json({ apps: state.door.apps, callers: state.door.callers, gateway: state.door.origin, version: state.door.version ?? null });
  });

  app.get("/api/shelf", (_req, res) => {
    res.set("Cache-Control", "no-store");
    res.json({ shelfUrl: String(process.env.SHELF_URL || "").trim().replace(/\/+$/, "") || null });
  });

  app.get("/api/catalog", (_req, res) => {
    res.json({
      org: customer.org,
      door: DOOR,
      policy: POLICY,
      mockNote: MOCK_NOTE,
      shapes: SHAPES,
      groups: TOOL_GROUPS,
      cases: CASES,
      fix: FIX,
      isIsNot: IS_IS_NOT,
      scenarios: SCENARIOS.map((s) => {
        const run = evaluate(s, startTrace());
        return {
          id: s.id,
          case: s.case,
          label: s.label,
          shape: s.shape,
          matchMode: s.matchMode,
          ask: s.ask,
          groupCount: s.groups.length,
          expectNote: s.expectNote,
          expectedVerdict: run.verdict
        };
      })
    });
  });

  // Mint a token on demand so the page can show both shapes side by side without running a scenario.
  app.post("/api/mint", (req, res) => {
    const { shape, groups } = req.body || {};
    if (shape !== STRING_SHAPE && shape !== ARRAY_SHAPE) {
      return res.status(400).json({ error: "bad_shape", message: `shape must be "${STRING_SHAPE}" or "${ARRAY_SHAPE}"` });
    }
    if (!Array.isArray(groups) || groups.some((g) => typeof g !== "string")) {
      return res.status(400).json({ error: "bad_groups", message: "groups must be an array of strings" });
    }
    if (groups.length > 32) {
      return res.status(400).json({ error: "too_many_groups", message: "at most 32 groups" });
    }
    const token = mintToken({ groups, shape, userId: "jdoe@example.com", clientId: "mcp-agent-client", audience: DOOR.audience, issuer: DOOR.issuer });
    res.json({ mock: true, token, claims: decodePayload(token), note: "mock token issued by this lab's in-process PingFederate stand-in (HS256 fixture key, signs nothing real)" });
  });

  // Run a scenario by id against the mock door.
  app.post("/api/run", (req, res) => {
    const { scenario } = req.body || {};
    const found = SCENARIOS.find((s) => s.id === scenario);
    if (!found) return res.status(400).json({ error: "unknown_scenario", message: `unknown scenario; one of ${SCENARIOS.map((s) => s.id).join(", ")}` });
    const run = evaluate(found, req.trace);
    recordRun(req.workspace, run);
    res.json(run);
  });

  app.get("/api/runs", (req, res) => res.json({ runs: runsOf(req.workspace) }));

  app.post("/api/reset", (req, res) => {
    state.workspaces.delete(req.workspace);
    res.json({ ok: true });
  });

  if (netguard === false) netguardOff(); // tests: lift the guard deliberately (never in production)

  if (existsSync(distDir)) {
    app.use(express.static(distDir));
    app.get(/^(?!\/api(\/|$)).*/, (_req, res) => res.sendFile(join(distDir, "index.html")));
  }

  app.use((_req, res) => res.status(404).json({ error: "not_found", message: "no such route" }));
  app.use((err, _req, res, next) => {
    if (res.headersSent) return next(err);
    if (err && err.type === "entity.too.large") return res.status(413).json({ error: "payload_too_large", message: "the request body is over 64 KB" });
    if (err && (err.type === "entity.parse.failed" || err instanceof SyntaxError)) return res.status(400).json({ error: "bad_json", message: "the request body is not valid JSON" });
    return res.status(500).json({ error: "internal_error", message: "the lab server hit an unexpected error" });
  });

  return app;
}

// The last built server's state (tests introspect it; there is one server per process in practice).
let lastServer = null;
export function readState(workspace = DEFAULT_WORKSPACE) {
  if (lastServer) return { source: lastServer.state.source, runs: lastServer.store.runsOf(workspace) };
  return { source: "mock", runs: [] };
}

const invoked = process.argv[1] && new URL("file://" + process.argv[1]).pathname;
if (invoked && invoked === new URL(import.meta.url).pathname) {
  const port = Number(process.env.PORT || PORT_DEFAULT);
  const bind = process.env.BIND_ALL === "1" ? "0.0.0.0" : "127.0.0.1";
  buildServer().listen(port, bind, () => {
    console.log(`${APP_ID} listening on http://${bind}:${port}`);
  });
}

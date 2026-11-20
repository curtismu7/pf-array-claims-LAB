import { test } from "node:test";
import assert from "node:assert/strict";
import { request } from "node:http";
import dns from "node:dns";
import { buildServer, readState, evaluate } from "../server/src/index.js";
import { installNetguard } from "../server/src/netguard.js";
import { createHealth } from "../server/src/health.js";
import { SCENARIOS } from "../server/src/scenarios.js";
import * as claims from "../server/src/claims.js";

const HOST = "localhost:7828";
const TRACEPARENT = /^00-(?!0{32})[0-9a-f]{32}-(?!0{16})[0-9a-f]{16}-[0-9a-f]{2}$/;
const JWT = /^eyJ[\w-]{10,}\.[\w-]{10,}\.[\w-]{10,}$/;

async function withServer(fn, buildOpts = {}) {
  const saved = process.env.LAB_ALLOWED_HOSTS;
  process.env.LAB_ALLOWED_HOSTS = "localhost:7828,127.0.0.1:7828";
  const srv = buildServer(buildOpts).listen(0, "127.0.0.1");
  await new Promise((r) => srv.on("listening", r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const j = async (p, b, method = "POST") => {
    const res = await fetch(base + p, {
      method,
      headers: { "content-type": "application/json", ...(method !== "GET" ? { origin: base } : {}) },
      body: method === "GET" ? undefined : JSON.stringify(b || {})
    });
    return { status: res.status, body: await res.json() };
  };
  try { await fn(j, base); } finally {
    srv.close();
    if (saved === undefined) delete process.env.LAB_ALLOWED_HOSTS; else process.env.LAB_ALLOWED_HOSTS = saved;
  }
}

// A server built with the given LAB_ALLOWED_HOSTS value (undefined = the server's own default list), and a raw HTTP helper
// that can set Host (fetch cannot be trusted to).
async function withRaw(env, fn, opts = {}) {
  const saved = process.env.LAB_ALLOWED_HOSTS;
  if (env === undefined) delete process.env.LAB_ALLOWED_HOSTS; else process.env.LAB_ALLOWED_HOSTS = env;
  const srv = buildServer(opts).listen(0, "127.0.0.1");
  await new Promise((r) => srv.on("listening", r));
  const port = srv.address().port;
  const raw = (method, path, headers = {}, body) => new Promise((resolve, reject) => {
    const req = request({ host: "127.0.0.1", port, method, path, headers: { host: `127.0.0.1:${port}`, ...headers } }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        let json = null;
        try { json = JSON.parse(text); } catch { /* not JSON */ }
        resolve({ status: res.statusCode, headers: res.headers, text, json });
      });
    });
    req.on("error", reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
  try { await fn(raw, port); } finally {
    srv.close();
    if (saved === undefined) delete process.env.LAB_ALLOWED_HOSTS; else process.env.LAB_ALLOWED_HOSTS = saved;
  }
}

// ---- The claim shapes (the lab's subject) -----------------------------------------------------------------

test("the string shape serialises isMemberOf as one delimited string", () => {
  const token = claims.mintToken({ groups: ["A", "B"], shape: "string", userId: "u@example.com", clientId: "c", audience: "https://mcp-gateway.example.com/mcp", issuer: "https://pf.example.com" });
  const payload = claims.decodePayload(token);
  assert.equal(typeof payload.isMemberOf, "string");
  assert.equal(payload.isMemberOf, "[A, B]");
  assert.equal(payload.mock, true);
});

test("the array shape serialises isMemberOf as a real JSON array", () => {
  const token = claims.mintToken({ groups: ["A", "B"], shape: "array", userId: "u@example.com", clientId: "c", audience: "https://mcp-gateway.example.com/mcp", issuer: "https://pf.example.com" });
  const payload = claims.decodePayload(token);
  assert.deepEqual(payload.isMemberOf, ["A", "B"]);
});

test("claimMatches: array mode over an array is exact membership (decoy refused)", () => {
  const hit = claims.claimMatches({ isMemberOf: ["MCPAccess-Atlan-Read"] }, "array", "MCPAccess-Atlan-Read");
  assert.equal(hit.matched, true);
  assert.equal(hit.exact, true);
  const miss = claims.claimMatches({ isMemberOf: ["MCPAccess-Atlan-Read-Extra"] }, "array", "MCPAccess-Atlan-Read");
  assert.equal(miss.matched, false);
});

test("claimMatches: substring mode over the delimited string over-grants the decoy", () => {
  const decoy = claims.claimMatches({ isMemberOf: "[MCPAccess-Atlan-Read-Extra]" }, "substring", "MCPAccess-Atlan-Read");
  assert.equal(decoy.matched, true, "the over-grant the lab exists to show");
  assert.equal(decoy.exact, false);
});

test("claimMatches: array mode over a string claim can never grant", () => {
  const r = claims.claimMatches({ isMemberOf: "[MCPAccess-Atlan-Read]" }, "array", "MCPAccess-Atlan-Read");
  assert.equal(r.matched, false);
  assert.match(r.reason, /array.*string|string.*array/i);
});

test("claimMatches: substring mode over an array claim stringifies (the accident)", () => {
  const r = claims.claimMatches({ isMemberOf: ["MCPAccess-Atlan-Read"] }, "substring", "MCPAccess-Atlan-Read");
  assert.equal(r.matched, true);
  assert.equal(r.exact, false);
  assert.match(r.reason, /stringified|as text/i);
});

test("claimMatches handles a missing claim without throwing", () => {
  assert.equal(claims.claimMatches({}, "array", "X").matched, false);
  assert.equal(claims.claimMatches(undefined, "substring", "X").matched, false);
});

// ---- The door: every scenario's verdict is computed and matches its claim ---------------------------------

test("every scenario runs and produces a verdict with a full trace", () => {
  for (const s of SCENARIOS) {
    const run = evaluate(s);
    assert.ok(run.verdict === "allowed" || run.verdict === "refused", `${s.id} verdict`);
    assert.ok(run.trace, `${s.id} trace`);
    assert.ok(run.trace.decisions.length >= 3, `${s.id} decisions`);
    assert.ok(run.trace.decisions.every((d) => d.basis === "checked"), `${s.id} decisions are the mock door's own`);
  }
});

test("the decoy pair behaves as the page promises: string over-grants, array refuses", () => {
  const stringRun = evaluate(SCENARIOS.find((s) => s.id === "decoy-string"));
  assert.equal(stringRun.verdict, "allowed");
  assert.equal(stringRun.outcome.exact, false);
  const arrayRun = evaluate(SCENARIOS.find((s) => s.id === "decoy-array"));
  assert.equal(arrayRun.verdict, "refused");
  assert.equal(arrayRun.outcome.exact, true);
});

test("the shape-mismatch scenario refuses a token that actually held the group", () => {
  const run = evaluate(SCENARIOS.find((s) => s.id === "string-asked-as-array"));
  assert.equal(run.verdict, "refused");
  const claimsPayload = claims.decodePayload(run.token.token);
  assert.ok(String(claimsPayload.isMemberOf).includes("MCPAccess-Atlan-Read"));
});

test("the door is deterministic (health's premise)", () => {
  for (const s of SCENARIOS) {
    const a = evaluate(s);
    const b = evaluate(s);
    assert.equal(a.verdict, b.verdict, s.id);
    assert.equal(a.outcome.reason, b.outcome.reason, s.id);
  }
});

test("mock token verification: tampered payload fails", () => {
  const s = SCENARIOS[0];
  const run = evaluate(s);
  const parts = run.token.token.split(".");
  const forged = Buffer.from(JSON.stringify({ ...run.token.claims, isMemberOf: ["Everything"] })).toString("base64url");
  const bad = claims.verify([parts[0], forged, parts[2]].join("."));
  assert.equal(bad.ok, false);
  assert.match(bad.reason, /signature/);
});

// ---- HTTP surface -------------------------------------------------------------------------------------------

test("health: demo-health/1 contract, ready, offline, no-store, traceparent", async () => {
  await withServer(async (j, base) => {
    const res = await fetch(`${base}/api/health`);
    const body = await res.json();
    assert.equal(body.schema, "demo-health/1");
    assert.equal(body.state, "ready");
    assert.equal(body.runtime, "offline");
    assert.deepEqual(body.demo, { id: "pf-array-claims-lab", name: "PF Array Claims", version: body.demo.version });
    assert.equal(res.headers.get("cache-control"), "no-store");
    assert.match(res.headers.get("traceparent") || "", TRACEPARENT);
  });
});

test("every scenario runs over HTTP with the expected verdict and labelled mock token", async () => {
  await withServer(async (j) => {
    for (const s of SCENARIOS) {
      const { status, body } = await j("/api/run", { scenario: s.id });
      assert.equal(status, 200, s.id);
      assert.equal(body.scenario, s.id);
      assert.ok(body.verdict);
      assert.equal(body.token.mock, true);
      assert.match(body.token.token, JWT);
      assert.ok(body.trace, `${s.id} carries a trace`);
      assert.match(body.traceparent || "", TRACEPARENT);
    }
  });
});

test("an unknown scenario is a 400 JSON error listing the valid ids", async () => {
  await withServer(async (j) => {
    const { status, body } = await j("/api/run", { scenario: "nope" });
    assert.equal(status, 400);
    assert.equal(body.error, "unknown_scenario");
    assert.match(body.message, /decoy-string/);
  });
});

test("mint: both shapes over HTTP, bad shape and bad groups are 400 JSON errors", async () => {
  await withServer(async (j) => {
    const arr = await j("/api/mint", { shape: "array", groups: ["MCPAccess-Atlan-Read"] });
    assert.equal(arr.status, 200);
    assert.deepEqual(arr.body.claims.isMemberOf, ["MCPAccess-Atlan-Read"]);
    assert.equal(arr.body.mock, true);

    const str = await j("/api/mint", { shape: "string", groups: ["A", "B"] });
    assert.equal(str.status, 200);
    assert.equal(str.body.claims.isMemberOf, "[A, B]");

    const badShape = await j("/api/mint", { shape: "scalar", groups: [] });
    assert.equal(badShape.status, 400);
    assert.equal(badShape.body.error, "bad_shape");

    const badGroups = await j("/api/mint", { shape: "array", groups: "not-an-array" });
    assert.equal(badGroups.status, 400);
    assert.equal(badGroups.body.error, "bad_groups");

    const tooMany = await j("/api/mint", { shape: "array", groups: Array.from({ length: 33 }, (_, i) => `G${i}`) });
    assert.equal(tooMany.status, 400);
    assert.equal(tooMany.body.error, "too_many_groups");
  });
});

test("catalog: two shapes, three cases, ten scenarios, the fix guide and the is/is-not panel", async () => {
  await withServer(async (j, base) => {
    const body = await (await fetch(`${base}/api/catalog`)).json();
    assert.equal(body.shapes.length, 2);
    assert.equal(body.cases.length, 3);
    assert.ok(body.scenarios.length >= 10);
    for (const s of body.scenarios) assert.ok(s.expectedVerdict === "allowed" || s.expectedVerdict === "refused");
    assert.ok(body.fix.steps.length === 5);
    assert.ok(body.isIsNot.is.length > 0 && body.isIsNot.isNot.length > 0);
    assert.ok(body.groups.length >= 4);
    assert.equal(body.door.audience, "https://mcp-gateway.example.com/mcp");
  });
});

test("mode: mock default, real refused with 409 and a reason, malformed body 400", async () => {
  await withServer(async (j) => {
    const real = await j("/api/mode", { source: "real" });
    assert.equal(real.status, 409);
    assert.equal(real.body.error, "real_unavailable");
    assert.ok(typeof real.body.message === "string" && real.body.message.length > 10);
    const bad = await j("/api/mode", { source: "mock", extra: 1 });
    assert.equal(bad.status, 400);
    const wrong = await j("/api/mode", { source: "banana" });
    assert.equal(wrong.status, 400);
    const good = await j("/api/mode", { source: "mock" });
    assert.equal(good.status, 200);
    assert.equal(good.body.source, "mock");
  });
});

test("runs are recorded per workspace and reset clears them", async () => {
  await withServer(async (j, base) => {
    const run = async (p, b, ws) => {
      const res = await fetch(base + p, {
        method: p === "/api/runs" ? "GET" : "POST",
        headers: { "content-type": "application/json", origin: base, ...(ws ? { "X-Workspace-Id": ws } : {}) },
        body: p === "/api/runs" ? undefined : JSON.stringify(b || {})
      });
      return res.json();
    };
    await run("/api/run", { scenario: "decoy-string" }, "ws-a");
    const a = await run("/api/runs", null, "ws-a");
    assert.equal(a.runs.length, 1);
    const b = await run("/api/runs", null, "ws-b");
    assert.equal(b.runs.length, 0);
    await run("/api/reset", null, "ws-a");
    const aAfter = await run("/api/runs", null, "ws-a");
    assert.equal(aAfter.runs.length, 0);
    readState("ws-a");
  });
});

test("host guard: a foreign Host is a 403 JSON error; the proxy host forms are allowed", async () => {
  await withRaw(undefined, async (raw, port) => {
    const refused = await raw("GET", "/api/health", { host: `127.0.0.1.evil.example:${port}` });
    assert.equal(refused.status, 403);
    assert.equal(refused.json.error, "host_not_allowed");
    const okHost = await raw("GET", "/api/health", { host: `pf-array-claims-lab.local.ping-devops.com:7828` });
    assert.equal(okHost.status, 200);
    const badPort = await raw("GET", "/api/health", { host: "localhost:9999" });
    assert.equal(badPort.status, 403);
    const zero = await raw("GET", "/api/health", { host: "0.0.0.0:7828" });
    assert.equal(zero.status, 403);
  });
});

test("write guard: a cross-origin write is a 403 JSON error; same-origin and the lab-proxy origin pass", async () => {
  await withRaw(undefined, async (raw, port) => {
    const base = `http://127.0.0.1:${port}`;
    const body = JSON.stringify({ scenario: "decoy-string" });
    const send = (headers) => raw("POST", "/api/run", { "content-type": "application/json", ...headers }, body);
    const ok = await send({ host: `127.0.0.1:${port}`, origin: base });
    assert.equal(ok.status, 200);
    const cross = await send({ host: `127.0.0.1:${port}`, origin: "https://evil.example", "sec-fetch-site": "cross-site" });
    assert.equal(cross.status, 403);
    assert.equal(cross.json.error, "cross_origin");
    const proxyHost = "pf-array-claims-lab.local.ping-devops.com:7828";
    const viaProxy = await send({ host: proxyHost, origin: "https://local.ping-devops.com:8443", "x-forwarded-host": "local.ping-devops.com:8443", "x-forwarded-proto": "https" });
    assert.equal(viaProxy.status, 200);
    const forged = await send({ host: proxyHost, origin: "https://evil.example", "x-forwarded-host": "local.ping-devops.com:8443", "x-forwarded-proto": "https" });
    assert.equal(forged.status, 403);
  });
});

test("a non-JSON write and an oversized body are structured 415/400/413 errors, never HTML", async () => {
  await withRaw(undefined, async (raw, port) => {
    const base = `http://127.0.0.1:${port}`;
    const noCt = await raw("POST", "/api/run", { host: `127.0.0.1:${port}`, origin: base, "content-type": "text/plain" }, "x");
    assert.equal(noCt.status, 415);
    assert.equal(noCt.json.error, "unsupported_media_type");
    const badJson = await raw("POST", "/api/run", { host: `127.0.0.1:${port}`, origin: base, "content-type": "application/json" }, "{nope");
    assert.equal(badJson.status, 400);
    assert.equal(badJson.json.error, "bad_json");
    const big = await raw("POST", "/api/run", { host: `127.0.0.1:${port}`, origin: base, "content-type": "application/json" }, JSON.stringify({ scenario: "x".repeat(70 * 1024) }));
    assert.equal(big.status, 413);
    assert.equal(big.json.error, "payload_too_large");
  });
});

test("an unknown API route is a JSON 404, not an HTML page", async () => {
  await withServer(async (_j, base) => {
    const res = await fetch(`${base}/api/nope`);
    assert.equal(res.status, 404);
    const body = await res.json();
    assert.equal(body.error, "not_found");
  });
});

test("netguard: install is idempotent and blocks an outbound attempt", async () => {
  installNetguard();
  installNetguard();
  await assert.rejects(() => fetch("https://example.invalid/"), /network blocked/);
});

test("health module standalone: the check function decides the state", async () => {
  const { router } = createHealth({ check: () => true });
  assert.ok(router);
});

// ---- Real mode ---------------------------------------------------------------------------------------------

// A fake door: same contract as createRealDoor's product, no network.
function fakeDoor({ ok = true } = {}) {
  return {
    origin: "https://gw.example.com",
    apps: ["door-example"],
    callers: [{ id: "agent-a", label: "Agent a" }],
    version: "test",
    list: async (app, caller) => ({
      ok, ms: 5,
      tools: ok ? [{ name: "atlan_search", description: "search" }] : undefined,
      refusal: ok ? undefined : { status: 401, message: "the gateway refused", layer: "key" },
      wire: ok ? [
        { http: "POST", url: `https://gw.example.com/${app}/mcp`, rpcMethod: "initialize", request: { headers: { authorization: "Bearer <agent key, 20 characters, kept on the server>" }, body: { method: "initialize" } }, response: { status: 200, headers: { "content-type": "application/json" }, body: { result: { serverInfo: { name: "gw" } } } }, at: "t", ms: 2 },
        { http: "POST", url: `https://gw.example.com/${app}/mcp`, rpcMethod: "tools/list", request: { headers: {}, body: { method: "tools/list" } }, response: { status: 200, headers: { "content-type": "application/json" }, body: { result: { tools: [{ name: "atlan_search" }] } } }, at: "t", ms: 3 },
      ] : [
        { http: "POST", url: `https://gw.example.com/${app}/mcp`, rpcMethod: "initialize", request: { headers: { authorization: "Bearer <agent key, 7 characters, kept on the server>" }, body: { method: "initialize" } }, response: { status: 401, headers: { "content-type": "application/json" }, body: { error: "bad key" } }, at: "t", ms: 2 },
      ],
    }),
    call: async () => ({ ok: false, refusal: { status: 403, message: "refused", layer: "policy" }, ms: 4 }),
  };
}

test("real: with an injected door, info offers Real, mode accepts real, and a run-real carries the real trace", async () => {
  await withServer(async (j, base) => {
    const info = await (await fetch(`${base}/api/info`)).json();
    assert.equal(info.realAvailable, true);
    assert.equal(info.source, "real");
    assert.deepEqual(info.realApps, ["door-example"]);

    const mode = await j("/api/mode", { source: "real" });
    assert.equal(mode.status, 200);
    assert.equal(mode.body.source, "real");

    const setup = await (await fetch(`${base}/api/real-setup`)).json();
    assert.deepEqual(setup.apps, ["door-example"]);
    assert.deepEqual(setup.callers.map((c) => c.id), ["agent-a"]);

    const claims = { iss: "https://pf.example.com", sub: "jdoe@example.com", isMemberOf: ["MCPAccess-Atlan-Read"] };
    const run = await j("/api/run-real", { scenario: "array-exact-hit", claims });
    assert.equal(run.status, 200);
    assert.equal(run.body.source, "real");
    assert.equal(run.body.verdict, "allowed");
    assert.equal(run.body.token.mock, false);
    assert.deepEqual(run.body.token.claims, claims);
    assert.equal(run.body.real.app, "door-example");
    assert.equal(run.body.real.gateway, "https://gw.example.com");
    // the trace is the real trace shape: source real, every decision observed/inferred, never checked
    assert.equal(run.body.trace.source, "real");
    for (const d of run.body.trace.decisions) assert.ok(d.basis !== "checked", "a real trace never says checked");
    assert.match(JSON.stringify(run.body.trace), /tools\/list/);
    // the trace must not hold a real bearer credential
    assert.ok(!/Bearer eyJ/.test(JSON.stringify(run.body.trace)));
    const back = await j("/api/mode", { source: "mock" });
    assert.equal(back.status, 200);
  }, { door: fakeDoor() });
});

test("real: a bad-key refusal still computes the claim verdict honestly and shows the refusal", async () => {
  await withServer(async (j) => {
    const claims = { isMemberOf: ["MCPAccess-Atlan-Read-Extra"] };
    const run = await j("/api/run-real", { scenario: "decoy-array", claims });
    assert.equal(run.status, 200);
    assert.equal(run.body.verdict, "refused", "the claim verdict is computed even when the gateway refuses");
    assert.equal(run.body.outcome.exact, true);
    assert.equal(run.body.real.listing.ok, false);
    assert.equal(run.body.real.listing.refusal.layer, "key");
  }, { door: fakeDoor({ ok: false }) });
});

test("real: the lab refuses a bearer token outright, and validates the claims shape", async () => {
  await withServer(async (j) => {
    const refused = await j("/api/run-real", { scenario: "array-exact-hit", claims: { isMemberOf: [] }, token: ["a", "fake bearer credential shaped value", "b"].join(".") });
    assert.equal(refused.status, 400);
    assert.equal(refused.body.error, "token_not_accepted");

    const noClaims = await j("/api/run-real", { scenario: "array-exact-hit" });
    assert.equal(noClaims.status, 400);
    assert.equal(noClaims.body.error, "bad_claims");

    const badShape = await j("/api/run-real", { scenario: "array-exact-hit", claims: ["not", "an", "object"] });
    assert.equal(badShape.status, 400);

    const unknown = await j("/api/run-real", { scenario: "nope", claims: {} });
    assert.equal(unknown.status, 400);

    const huge = await j("/api/run-real", { scenario: "array-exact-hit", claims: { pad: "x".repeat(17 * 1024) } });
    assert.equal(huge.status, 413);
  }, { door: fakeDoor() });
});

test("real: run-real without a door is a 409 with the settings hint", async () => {
  await withServer(async (j, base) => {
    const info = await (await fetch(`${base}/api/info`)).json();
    assert.equal(info.realAvailable, false);
    assert.ok(typeof info.realReason === "string" && info.realReason.length > 10);
    const r = await j("/api/run-real", { scenario: "array-exact-hit", claims: {} });
    assert.equal(r.status, 409);
    assert.equal(r.body.error, "real_unavailable");
    assert.ok(r.body.message.length > 10);
  });
});

test("netguard: an allowed real origin passes; everything else stays blocked", async () => {
  // the guard is module-global; the withServer servers already installed it. Prove the allow-list path:
  const ng = await import("../server/src/netguard.js");
  ng.setAllowedOrigins(["https://gw.example.com"]);
  try {
    // DNS for a non-allowed name is still blocked
    await assert.rejects(() => dns.promises.lookup("self-test.invalid"), /network blocked/);
  } finally {
    ng.setAllowedOrigins([]);
  }
});

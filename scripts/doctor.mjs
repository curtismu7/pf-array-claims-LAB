#!/usr/bin/env node
// Preflight: netguard self-test, health contract, the mock door behaves as written, Real is refused, reset works.
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

let failures = 0;
const ok = (name, cond, detail = "") => {
  console.log(`${cond ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures++;
};

const ng = await import(new URL("../server/src/netguard.js", import.meta.url));
const ngResult = await ng.netguardSelfTest();
ok(`netguard self-test (${ngResult.blocked}/8 routes blocked)`, ngResult.ok, ngResult.ok ? "" : ngResult.detail);

const PORT = Number(process.env.DOCTOR_PORT || 17828);
const base = `http://127.0.0.1:${PORT}`;

const server = spawn(process.execPath, ["server/src/index.js"], {
  env: { ...process.env, PORT: String(PORT), LAB_ALLOWED_HOSTS: `localhost:${PORT},127.0.0.1:${PORT}` },
  stdio: "ignore"
});

const post = async (path, body) => {
  const res = await fetch(`${base}${path}`, { method: "POST", headers: { "content-type": "application/json", origin: base }, body: JSON.stringify(body || {}) });
  return { status: res.status, body: await res.json() };
};

try {
  let healthy = false;
  for (let i = 0; i < 40 && !healthy; i++) {
    await sleep(250);
    try { healthy = (await fetch(`${base}/api/health`)).status === 200; } catch { /* not up yet */ }
  }
  ok("server healthy", healthy);

  const healthRes = await fetch(`${base}/api/health`);
  const health = await healthRes.json();
  ok("health contract demo-health/1: schema, state ready, runtime offline, no-store", health.schema === "demo-health/1" && health.state === "ready" && health.runtime === "offline" && health.demo?.id === "pf-array-claims-lab" && healthRes.headers.get("cache-control") === "no-store");
  ok("API answers carry a W3C traceparent", /^00-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$/.test(healthRes.headers.get("traceparent") || ""));
  const missing = await fetch(`${base}/api/nope`);
  const missingBody = await missing.json().catch(() => null);
  ok("an unknown API route is a JSON error, not an HTML page", missing.status === 404 && missingBody?.error === "not_found" && typeof missingBody?.message === "string");

  const info = await (await fetch(`${base}/api/info`)).json();
  ok("info reports mock, Real unavailable with a reason", info.source === "mock" && info.realAvailable === false && typeof info.realReason === "string" && info.realReason.length > 10);

  const info2 = await (await fetch(`${base}/api/info`)).json();
  if (info2.realAvailable) {
    ok("Real is available: /api/real-setup names the doors and callers", (await (await fetch(`${base}/api/real-setup`)).json()).apps.length > 0);
    ok("switching to Mock works", (await post("/api/mode", { source: "mock" })).status === 200);
  } else {
    const mode = await post("/api/mode", { source: "real" });
    ok("switching to Real without settings is refused with 409 and a JSON reason", mode.status === 409 && mode.body.error === "real_unavailable");
  }

  const catalog = await (await fetch(`${base}/api/catalog`)).json();
  ok("catalog carries the two shapes and the scenarios", Array.isArray(catalog.shapes) && catalog.shapes.length === 2 && catalog.scenarios.length >= 8);

  const mintArray = await post("/api/mint", { shape: "array", groups: ["MCPAccess-Atlan-Read"] });
  const arrayClaims = mintArray.body && mintArray.body.claims;
  ok("array mint puts a real JSON array in isMemberOf", mintArray.status === 200 && Array.isArray(arrayClaims?.isMemberOf) && arrayClaims.isMemberOf[0] === "MCPAccess-Atlan-Read");

  const mintString = await post("/api/mint", { shape: "string", groups: ["MCPAccess-Atlan-Read"] });
  const stringClaims = mintString.body && mintString.body.claims;
  ok("string mint puts a delimited string in isMemberOf", mintString.status === 200 && typeof stringClaims?.isMemberOf === "string" && stringClaims.isMemberOf.startsWith("[") && stringClaims.isMemberOf.includes("MCPAccess-Atlan-Read"));

  const decoy = await post("/api/run", { scenario: "decoy-string" });
  ok("the decoy over-grant reproduces (string token grants a group it never held)", decoy.status === 200 && decoy.body.verdict === "allowed" && decoy.body.outcome?.exact === false);
  const decoyArray = await post("/api/run", { scenario: "decoy-array" });
  ok("the array policy refuses the decoy", decoyArray.status === 200 && decoyArray.body.verdict === "refused" && decoyArray.body.outcome?.exact === true);

  const bad = await post("/api/run", { scenario: "no-such-scenario" });
  ok("an unknown scenario is a 400 JSON error", bad.status === 400 && bad.body.error === "unknown_scenario");

  const badShape = await post("/api/mint", { shape: "scalar", groups: [] });
  ok("a bad mint shape is a 400 JSON error", badShape.status === 400 && badShape.body.error === "bad_shape");

  const reset = await post("/api/reset", {});
  ok("reset answers ok", reset.status === 200 && reset.body.ok === true);
} finally {
  server.kill();
}

console.log(failures === 0 ? "doctor: all checks passed" : `doctor: ${failures} check(s) failed`);
process.exit(failures ? 1 : 0);

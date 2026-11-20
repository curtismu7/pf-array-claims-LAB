// "What the mock policy door did" (Rule 25): the vendored files are pinned by sha256. Every trace this lab builds is tested in server.test.js
// (assertTrace). Re-vendor (cp, never edit), then re-pin: cd web/src/gateway-trace && shasum -a 256 GatewayTrace.jsx gateway-trace.css gateway-trace.test.jsx
// (gatewayTrace.js in server/src is pinned by the same file).
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { assertTrace } from "../server/src/gatewayTrace.js";
import { runScenario } from "../server/src/door.js";
import { mintToken, verify, decodePayload } from "../server/src/claims.js";
import { SCENARIOS, DOOR } from "../server/src/scenarios.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const WEB = "web/src/gateway-trace";
const WHERE = { "GatewayTrace.jsx": WEB, "gateway-trace.css": WEB, "gateway-trace.test.jsx": WEB, "gatewayTrace.js": "server/src" };
const sha = (p) => createHash("sha256").update(readFileSync(join(root, p))).digest("hex");
const pins = readFileSync(join(root, WEB, "gateway-trace.sha256"), "utf8").split("\n").filter((l) => /^[0-9a-f]{64}\s/.test(l)).map((l) => l.split(/\s+/));

test("every vendored gateway-trace file matches its pinned sha256, and all four are pinned", () => {
  assert.deepEqual(pins.map(([, f]) => f).sort(), Object.keys(WHERE).sort());
  for (const [hash, file] of pins) assert.equal(sha(`${WHERE[file]}/${file}`), hash, `${file} differs from gateway-trace.sha256 (hand-edited, or re-vendored without re-pinning)`);
});

// Rule 25 honesty: every decision in this lab's traces is `checked` (the mock door computed it); assertTrace passes.
test("every scenario's trace passes assertTrace, with all decisions checked and no full bearer", () => {
  for (const s of SCENARIOS) {
    const run = runScenario(s, { root: null }, { mintToken, claimMatchesFn: (p, m, g) => ({ matched: Array.isArray(p.isMemberOf) ? p.isMemberOf.includes(g) : String(p.isMemberOf).includes(g), exact: Array.isArray(p.isMemberOf), reason: "test" }), verifyFn: verify });
    assert.deepEqual(assertTrace(run.trace), [], s.id);
    assert.equal(run.trace.source, "mock");
    assert.ok(!/Bearer eyJ/.test(run.trace.request.headers.authorization), `${s.id}: the trace never carries the raw mock token (it is shown in the run result)`);
    assert.equal(decodePayload(run.token.token).mock, true);
  }
});

test("the door's audience is an .example host, and the trace request names it", () => {
  assert.match(DOOR.audience, /\.example\.com/);
  const run = runScenario(SCENARIOS[0], { root: null }, { mintToken, claimMatchesFn: () => ({ matched: true, exact: true, reason: "test" }), verifyFn: verify });
  assert.ok(run.trace.request.url.startsWith(DOOR.audience));
});

test("this lab is mock only, so no real trace exists: a real trace is not built anywhere in the server", () => {
  const index = readFileSync(join(root, "server/src/index.js"), "utf8");
  assert.ok(!/realTrace|failureTrace|traceFromDoor/.test(index));
});

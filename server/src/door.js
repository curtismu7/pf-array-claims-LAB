// The door: this lab's own evaluator of the two ways a Privilege-style policy can read the isMemberOf claim.
// It computes a verdict plus the decisions a trace shows. It is NOT a Cedar engine and NOT Privilege.
import { mockTrace } from "./gatewayTrace.js";
import { traceFromDoor } from "./gatewayTrace.js";
import { claimMatches, verify } from "./claims.js";
import { newTrace, formatTraceparent } from "./trace.js";
import { POLICY, DOOR } from "./scenarios.js";

// Rule 14: a valid incoming traceparent continues its trace; anything else starts a new one.
export function startTrace(incoming) {
  const t = newTrace(incoming);
  return { root: formatTraceparent(t.traceId, t.span()) };
}

// ---- Real mode ---------------------------------------------------------------------------------------------
// The real run of a scenario: the caller presents a REAL token's decoded claims and the lab asks the live
// Privilege gateway's policy question by calling the door. The door decides on its own policy; what Real adds
// is the wire truth: the exact tools/list exchange with the gateway, so the shape conversation happens over a
// live hop instead of a mock. The claim verdict is still computed here from the claims the caller supplies —
// the lab never sends the caller's claims to the gateway (they would not change the door's policy answer, and
// a token the lab does not hold must never be forwarded).
export function runRealScenario({ scenario, door, app, caller, claimsPayload, trace = startTrace(), now = () => new Date().toISOString() }) {
  const ask = scenario.ask || POLICY.group;
  const outcome = claimMatches(claimsPayload, scenario.matchMode, ask);
  const granted = outcome.matched === true;
  return (async () => {
    const listing = await door.list(app, caller);
    const ex = {
      step: 1,
      title: "Real gateway check: tools/list",
      status: null,
      trace: traceFromDoor(listing, { rpcMethod: "tools/list" }),
    };
    ex.status = ex.trace.response?.status ?? null;
    return {
      id: scenario.id,
      at: now(),
      scenario: scenario.id,
      label: scenario.label,
      case: scenario.case,
      door: { ...DOOR, real: door.origin },
      traceparent: trace.root,
      real: {
        app,
        caller,
        gateway: door.origin,
        listing: { ok: listing.ok, ms: listing.ms, tools: listing.ok ? listing.tools.length : 0, refusal: listing.refusal ?? null },
      },
      policy: { ...POLICY, ask },
      outcome: { granted, exact: outcome.exact === true, reason: outcome.reason },
      verdict: granted ? "allowed" : "refused",
      http: ex.trace.response?.status ?? (granted ? 200 : 403),
      source: "real",
      trace: ex.trace,
      exchanges: [ex],
      token: {
        mock: false,
        claims: claimsPayload,
        shape: scenario.shape,
        note: "claims the caller supplied (decoded client-side; the lab never holds or forwards a real token)"
      }
    };
  })();
}

// Evaluate one scenario: mint the token, run the policy, build the trace.
// shape: "string" | "array"; matchMode: "substring" | "array".
export function runScenario(scenario, trace = startTrace(), deps = {}) {
  const { mintToken, claimMatchesFn, verifyFn, now = () => new Date().toISOString() } = deps;
  const token = mintToken({
    groups: scenario.groups,
    shape: scenario.shape,
    userId: "jdoe@example.com",
    clientId: "mcp-agent-client",
    audience: DOOR.audience,
    issuer: DOOR.issuer
  });
  const check = verifyFn(token);
  if (!check.ok) throw new Error(`the mock token failed its own verification: ${check.reason}`);
  const payload = check.payload;
  const ask = scenario.ask || POLICY.group;
  const outcome = claimMatchesFn(payload, scenario.matchMode, ask);
  const granted = outcome.matched === true;

  const decisions = [
    {
      id: "token",
      label: "Token verified",
      outcome: "pass",
      evidence: `HS256 fixture token, mock-issued; claims decoded for display`
    },
    {
      id: "claim-shape",
      label: `Claim shape: isMemberOf is ${Array.isArray(payload.isMemberOf) ? "an array" : typeof payload.isMemberOf === "string" ? "a delimited string" : typeof payload.isMemberOf}`,
      outcome: "info",
      evidence: JSON.stringify(payload.isMemberOf)
    },
    {
      id: "policy",
      label: `Policy asks: does ${scenario.matchMode === "array" ? "the array" : "the text"} contain ${ask}?`,
      outcome: granted ? "pass" : "fail",
      evidence: outcome.reason
    }
  ];

  const http = granted ? 200 : 403;
  const body = granted
    ? { jsonrpc: "2.0", result: { tools: [POLICY.tool] } }
    : { jsonrpc: "2.0", error: { code: -32600, message: `policy refused: ${outcome.reason}` } };

  const requestHeaders = { authorization: "Bearer <mock token, shown in the run result>" };
  const t = mockTrace({
    url: `${DOOR.audience}/tools/list`,
    authorization: requestHeaders.authorization,
    rpc: { method: "tools/list" },
    status: http,
    body,
    requestHeaders,
    decisions,
    record: null
  });
  // The mock token is shown raw in the run result (education); the trace shows a placeholder instead.
  t.request.headers.authorization = "Bearer <mock token: shown in the run result below>";

  return {
    id: scenario.id,
    at: now(),
    scenario: scenario.id,
    label: scenario.label,
    case: scenario.case,
    door: DOOR,
    traceparent: trace.root,
    token: {
      mock: true,
      token,
      claims: payload,
      shape: scenario.shape,
      note: "mock token issued by this lab's in-process PingFederate stand-in (HS256 fixture key, signs nothing real)"
    },
    policy: { ...POLICY, ask },
    outcome: { granted, exact: outcome.exact === true, reason: outcome.reason },
    verdict: granted ? "allowed" : "refused",
    http,
    trace: t
  };
}

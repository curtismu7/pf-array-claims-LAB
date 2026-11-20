// The door: this lab's own evaluator of the two ways a Privilege-style policy can read the isMemberOf claim.
// It computes a verdict plus the decisions a trace shows. It is NOT a Cedar engine and NOT Privilege.
import { mockTrace } from "./gatewayTrace.js";
import { claimMatches, verify } from "./claims.js";
import { newTrace, formatTraceparent } from "./trace.js";
import { POLICY, DOOR } from "./scenarios.js";

// Rule 14: a valid incoming traceparent continues its trace; anything else starts a new one.
export function startTrace(incoming) {
  const t = newTrace(incoming);
  return { root: formatTraceparent(t.traceId, t.span()) };
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

// The lab's subject: the shape of the isMemberOf claim in a PingFederate-issued access token, and what a Privilege-style
// policy engine can do with each shape.
//
//   STRING shape ("[A, B, C]"): the claim value is one string with the groups delimited. A policy engine that wants
//     "does this token carry group X" can only look for X inside the string — substring matching. That answers yes for
//     MCPAccess-Atlan-Read even when the token only holds MCPAccess-Atlan-Read-Extra, and it answers differently again
//     when the delimiter or the brackets change. This is the shape the NYL-style POC hit.
//   ARRAY shape (["A", "B", "C"]): the claim value is a real JSON array. Membership is exact: X is granted only when the
//     array holds X, and a decoy name never matches.
//
// Everything here is a mock: the tokens are HS256 fixtures that sign nothing real, and the door is this lab's own
// evaluator of two rule shapes (array membership, substring). It is not Privilege and not a Cedar engine.
import { createHmac } from "node:crypto";

export const STRING_SHAPE = "string";
export const ARRAY_SHAPE = "array";

const FIXTURE_SECRET = "pf-array-claims-lab-fixture-key";

function b64url(buf) {
  return Buffer.from(buf).toString("base64url");
}

export function decodePayload(token) {
  try {
    const parts = String(token || "").split(".");
    if (parts.length !== 3) return null;
    return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

export function sign(payload) {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(JSON.stringify(payload));
  const sig = createHmac("sha256", FIXTURE_SECRET).update(`${header}.${body}`).digest("base64url");
  return `${header}.${body}.${sig}`;
}

export function verify(token) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3) return { ok: false, reason: "not a three-part token" };
  const expect = createHmac("sha256", FIXTURE_SECRET).update(`${parts[0]}.${parts[1]}`).digest("base64url");
  if (parts[2] !== expect) return { ok: false, reason: "bad signature" };
  const payload = decodePayload(token);
  if (!payload) return { ok: false, reason: "undecodable payload" };
  return { ok: true, payload };
}

// The groups a user's token can carry. Names follow the MCPAccess-<tool>-<level> pattern of the POC, with
// example.invalid nowhere needed because these are example group names, not hosts.
export const TOOL_GROUPS = [
  "MCPAccess-Atlan-Read",
  "MCPAccess-Databricks-Write",
  "MCPAccess-Atlassian-All_Tools",
  "MCPAccess-PDP-Write"
];

// Mint the access token. shape "string" reproduces the delimited-string isMemberOf a text attribute or a
// bracketed mapping expression produces; shape "array" is the real JSON array the policy engine wants.
export function mintToken({ groups, shape, userId, clientId, audience, issuer }) {
  const now = Math.floor(Date.now() / 1000);
  const list = Array.isArray(groups) ? groups : [];
  const isMemberOf = shape === STRING_SHAPE
    ? `[${list.join(", ")}]`
    : list.slice();
  return sign({
    iss: issuer,
    sub: userId,
    aud: audience,
    client_id: clientId,
    isMemberOf,
    iat: now,
    exp: now + 300,
    mock: true
  });
}

// What the policy engine sees, given the two match modes it could apply. mode "array" is exact membership and only
// works when the claim is a real array; mode "substring" is the only thing a delimited string supports.
export function claimMatches(payload, matchMode, group) {
  const claim = payload ? payload.isMemberOf : undefined;
  if (matchMode === "array") {
    if (!Array.isArray(claim)) {
      return { matched: false, exact: false, reason: `the policy matches the claim as an array, but the claim is a ${claim === undefined ? "missing" : typeof claim} — this pairing can never grant` };
    }
    return { matched: claim.includes(group), exact: true, reason: claim.includes(group) ? `the array holds ${group} exactly` : `the array does not hold ${group}` };
  }
  // substring mode
  if (typeof claim !== "string") {
    // An array is also searchable by text: the engine stringifies it. That is the accident that makes substring
    // matching "work" on array tokens while staying unsafe. A missing claim stringifies to undefined and matches nothing.
    const asText = claim === undefined ? "" : JSON.stringify(claim);
    return { matched: asText.includes(group), exact: false, reason: claim === undefined ? "substring match, but the claim is missing" : `substring match against the claim as text (an array stringified)` };
  }
  return { matched: String(claim).includes(group), exact: false, reason: `substring match inside the delimited string` };
}

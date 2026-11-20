// The scenarios the door runs, as data. Each scenario picks a token shape (string or array), the groups the token
// carries, the policy's match mode, and the group the policy asks for. The door's verdict is computed, never asserted.
import { TOOL_GROUPS, STRING_SHAPE, ARRAY_SHAPE } from "./claims.js";

const [ATLAN, DATABRICKS, ATLASSIAN, PDP] = TOOL_GROUPS;
const DECOY = "MCPAccess-Atlan-Read-Extra";

export const DOOR = {
  name: "door-array-policy",
  audience: "https://mcp-gateway.example.com/mcp",
  issuer: "https://pf.example.com"
};

// The groups a user's token can carry, re-exported for the catalog and the page.
export { TOOL_GROUPS } from "./claims.js";

export const POLICY = {
  id: "pol-atlan-read",
  group: ATLAN,
  tool: "Atlan MCP tools",
  action: "mcp:Invoke"
};

export const SHAPES = [
  {
    id: STRING_SHAPE,
    label: "String (the POC's bug)",
    what: "isMemberOf is one delimited string: \"[A, B, C]\". This is what a text attribute or a bracketed mapping expression puts in the token."
  },
  {
    id: ARRAY_SHAPE,
    label: "Array (the fix)",
    what: "isMemberOf is a real JSON array: [\"A\", \"B\"]. This is what the policy engine needs for exact membership."
  }
];

// ---- Cases -------------------------------------------------------------------------------------------

export const CASES = [
  {
    id: "shape",
    n: 1,
    title: "The claim shape decides what the policy can do",
    summary: "The same policy, the same user, two token shapes. With the string the door can only look for the group inside the text; with the array it can ask exact membership.",
    basis: "simulated",
    source: "The delimited-string shape and the substring fallback are the pairing the POC email thread described; this lab re-creates both with example group names.",
    real: "On the customer side the fix is at the token mapping: emit isMemberOf as a multi-valued claim so PingFederate serialises a JSON array. Not re-run here."
  },
  {
    id: "decoy",
    n: 2,
    title: "Why substring matching over-grants",
    summary: "The token carries MCPAccess-Atlan-Read-Extra, a decoy nobody granted. The substring policy grants it anyway; the array policy refuses it.",
    basis: "simulated",
    source: "The over-grant follows from how a contains-style check on a delimited string works; the door computes it, nothing here was measured on a tenant.",
    real: "A real policy engine's exact behaviour on a non-array claim is the customer's to verify in their own console; this lab only shows why the shape matters."
  },
  {
    id: "multi",
    n: 3,
    title: "Many groups, exact membership",
    summary: "The user holds all four MCPAccess groups. The array policy grants exactly the group asked for and stays silent on the others; the policy binds to the claim, never to a selected user.",
    basis: "simulated",
    source: "The group names follow the POC's MCPAccess-<tool>-<level> pattern, with example tools. The 'any user whose token carries the claim' rule is the guidance from the same thread.",
    real: "Policy authoring itself happens in the customer's console; this lab does not re-run it."
  }
];

// ---- Scenarios ----------------------------------------------------------------------------------------
// Each scenario: shape, groups, matchMode (how the policy reads the claim), the group the policy asks for.
export const SCENARIOS = [
  {
    id: "string-contains-hit",
    case: "shape",
    label: "String token, substring policy, group present",
    shape: STRING_SHAPE,
    groups: [ATLAN, DATABRICKS],
    matchMode: "substring",
    ask: ATLAN,
    expectNote: "grants — but only because the text happens to contain the group name"
  },
  {
    id: "string-contains-miss",
    case: "shape",
    label: "String token, substring policy, group absent",
    shape: STRING_SHAPE,
    groups: [DATABRICKS],
    matchMode: "substring",
    ask: ATLAN,
    expectNote: "refuses — the one case substring matching gets right"
  },
  {
    id: "array-exact-hit",
    case: "shape",
    label: "Array token, membership policy, group present",
    shape: ARRAY_SHAPE,
    groups: [ATLAN, DATABRICKS],
    matchMode: "array",
    ask: ATLAN,
    expectNote: "grants — exact membership in the array"
  },
  {
    id: "array-exact-miss",
    case: "shape",
    label: "Array token, membership policy, group absent",
    shape: ARRAY_SHAPE,
    groups: [DATABRICKS],
    matchMode: "array",
    ask: ATLAN,
    expectNote: "refuses — exact membership, not a text search"
  },
  {
    id: "string-asked-as-array",
    case: "shape",
    label: "String token, membership policy (shape mismatch)",
    shape: STRING_SHAPE,
    groups: [ATLAN],
    matchMode: "array",
    ask: ATLAN,
    expectNote: "refuses — the policy wants an array and the claim is a string, so exact membership can never be true"
  },
  {
    id: "array-asked-as-substring",
    case: "shape",
    label: "Array token, substring policy (accident)",
    shape: ARRAY_SHAPE,
    groups: [ATLAN],
    matchMode: "substring",
    ask: ATLAN,
    expectNote: "grants — by accident: the engine stringified the array and searched the text"
  },
  {
    id: "decoy-string",
    case: "decoy",
    label: "Decoy group, string token (over-grant)",
    shape: STRING_SHAPE,
    groups: [DECOY],
    matchMode: "substring",
    ask: ATLAN,
    expectNote: "grants MCPAccess-Atlan-Read from a token that never held it — the over-grant"
  },
  {
    id: "decoy-array",
    case: "decoy",
    label: "Decoy group, array token (refused)",
    shape: ARRAY_SHAPE,
    groups: [DECOY],
    matchMode: "array",
    ask: ATLAN,
    expectNote: "refuses — the array does not hold MCPAccess-Atlan-Read"
  },
  {
    id: "multi-all-groups",
    case: "multi",
    label: "All four groups, array token",
    shape: ARRAY_SHAPE,
    groups: TOOL_GROUPS,
    matchMode: "array",
    ask: ATLAN,
    expectNote: "grants Atlan-Read by membership; the other three groups are simply not asked for"
  },
  {
    id: "multi-empty",
    case: "multi",
    label: "No MCPAccess groups at all",
    shape: ARRAY_SHAPE,
    groups: [],
    matchMode: "array",
    ask: ATLAN,
    expectNote: "refuses — an empty array grants nothing"
  }
];

export const MOCK_NOTE = "Mock note: the tokens, the door and the policy are all this lab's own mocks with example group names. Nothing here is a claim about what a specific customer's tenant does.";

// What the Help dialog says. Plain, and as hedged as the rest of the lab (rule 2): what was measured, what is simulated, what is UNVERIFIED.
export const HELP_SECTIONS = [
  {
    heading: "What this lab is",
    body: [
      "A Tester-tier lab for the isMemberOf claim-shape use case: a PingFederate-issued access token can carry group entitlements as a delimited string or as a real JSON array, and the policy on an MCP gateway answers differently for each. You pick a scenario and press Simulate, or mint both shapes yourself in the panel.",
      "The runs are simulated. A mock token mint and a mock policy door run in this app's own process. Nothing leaves your machine."
    ]
  },
  {
    heading: "What was measured, and what was not",
    body: [
      "The two serialisations are what JSON guarantees and are shown live: a string value vs an array value. The decoy over-grant (substring matching matches MCPAccess-Atlan-Read-Extra to a policy asking MCPAccess-Atlan-Read) is computed here and reproducible.",
      "Nothing was re-run on a real tenant: which mapping emits which shape in a specific product version, and how a specific policy engine treats a non-array claim, are UNVERIFIED here and labelled as such on the page."
    ]
  },
  {
    heading: "The mock door is not a policy engine",
    body: "It evaluates two claim-reading modes (exact array membership, substring search) over example group names and compares values exactly. The tokens it issues are labelled mock and sign nothing real."
  },
  {
    heading: "How to use the page",
    body: [
      "Mint panel: pick the shape, pick the groups, mint — the decoded claims show the shape. Tour: pick a scenario, press Simulate. The diagram boxes can be dragged; Reset in the header restores them. Speed sets how fast the arrows walk.",
      "Below the tour: The fix is the five-step change list, and Is / Is not says what the use case is and is not. Present (Alt+P) shows the line to say for the scenario you picked; Talk track opens the full script."
    ]
  },
  {
    heading: "Mock and Real",
    body: "The lab runs in Mock. Real is not available in this lab and is disabled in the page, with the reason shown beside the toggle: reproducing the shapes on a real PingFederate is a token-mapping change in the customer's own tenant."
  }
];

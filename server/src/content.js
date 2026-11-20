// The "The fix" guide and the IS / IS NOT panel, as data. Labelling rules (rule 2): only what JSON itself guarantees is
// measured; anything about a specific product's console or a tenant is UNVERIFIED in this lab.
export const FIX = {
  title: "The fix: make the token carry a real array",
  lede: "The order of operations: the claim shape is decided at the token mapping, the policy then does exact membership, and the proof is a decoy that no longer matches. Nothing here was re-run on a tenant; the labels say what each step rests on.",
  steps: [
    {
      n: 1,
      title: "Find where isMemberOf gets its value",
      what: "In the OAuth grant / token mapping, the claim is currently populated from a text attribute or a bracketed mapping expression, so PingFederate serialises one delimited string (\"[A, B]\"). If it comes from the directory's native multi-valued group attribute, map that attribute directly with no delimiter and no brackets.",
      notes: [
        { label: "console text", text: "The delimited-string shape is what the POC thread observed in a decoded token; the exact mapping that produced it is tenant-specific." },
        { label: "UNVERIFIED", text: "Which attribute type the customer's directory holds (multi-valued vs text) was not checked here." }
      ]
    },
    {
      n: 2,
      title: "Emit isMemberOf as a multi-valued claim",
      what: "A multi-valued attribute mapped without a delimiter serialises as a JSON array: [\"A\", \"B\"]. If only a single text attribute exists, split on the delimiter in a token builder / mapping expression so the value leaves as a list, not a string.",
      notes: [
        { label: "UNVERIFIED", text: "The exact expression syntax differs by PF version and mapping type; verify in your own admin console." }
      ]
    },
    {
      n: 3,
      title: "Verify by decoding the token",
      what: "Decode an issued access token and check isMemberOf is a JSON array, not a bracketed string. This lab's Mint panel shows both shapes side by side so you know exactly what to look for.",
      notes: [
        { label: "measured", text: "The two serialisations themselves are what JSON guarantees: an array value vs a string value. Shown live in this lab's Mint panel." }
      ]
    },
    {
      n: 4,
      title: "Write the policy on the claim, not on a user",
      what: "The policy condition should select 'any user whose token carries the required claim' — never a selected user, or the policy binds to that one person. The condition asks exact membership of MCPAccess-Atlan-Read in the isMemberOf array.",
      notes: [
        { label: "console text", text: "'Choose any user whose token carries the required claim' is the guidance from the POC thread." }
      ]
    },
    {
      n: 5,
      title: "Prove it with a decoy",
      what: "Give a test user MCPAccess-Atlan-Read-Extra only. The substring policy grants MCPAccess-Atlan-Read anyway (case 2); the array policy refuses. The decoy is the proof that matching is exact.",
      notes: [
        { label: "measured", text: "In this lab the decoy over-grant reproduces (scenario decoy-string) and the array refusal reproduces (decoy-array). On a real tenant, run the same pair." }
      ]
    }
  ]
};

export const IS_IS_NOT = {
  title: "What this use case is, and is not",
  lede: "So the demo is never oversold: what the claim-shape change does, and what it does not.",
  is: [
    { label: "measured", text: "A claim-shape change at the token mapping: a delimited string becomes a JSON array, and exact membership becomes possible. The two shapes are shown live in this lab's Mint panel." },
    { label: "measured", text: "A security fix in this lab's own door: substring matching over a delimited string over-grants to decoy group names, reproducible in case 2 (scenario decoy-string)." },
    { label: "console text", text: "A POC-blocking issue: the policy could not be configured as intended while the token only carried a string." }
  ],
  isNot: [
    { label: "UNVERIFIED", text: "Not a statement about any specific product release or version: which mapping UI emits arrays was not checked here." },
    { label: "UNVERIFIED", text: "Not a claim that one policy engine resolves every string claim the same way: engines differ, and this lab's door is a mock of the two modes." },
    { label: "measured", text: "Not a replacement for the policy itself: this lab's door still needs a policy that asks exact membership; case 1's 'string asked as array' scenario (this lab's own run) shows the mismatch the other way." }
  ]
};

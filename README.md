# pf-array-claims-LAB

Tier: Tester

**PF Array Claims: the isMemberOf claim-shape use case — delimited string vs JSON array in a PingFederate-issued access token, and what a group-entitlement policy on an MCP gateway can do with each.**

The use case, from a real POC thread: a policy asking "does this token carry MCPAccess-Atlan-Read?" could not be configured as intended because the token's `isMemberOf` claim was one delimited string (`"[A, B, C]"`), not an array. This lab re-creates both shapes with mock tokens and example group names and shows, case by case, why the shape decides the answer: substring search over the string **over-grants** (a decoy group `MCPAccess-Atlan-Read-Extra` matches), exact membership over the array does not, and a policy written for arrays can never match a string claim at all.

## What the page walks

0. **Mint panel.** Pick the shape and the groups, mint: the decoded claims show `isMemberOf` as a delimited string or as a JSON array. This is the knob the fix turns — the token mapping at PingFederate.
1. **Case 1 — the shape decides.** The same policy, the same user, both shapes and both match modes: substring grants on a text hit, exact membership grants only on a real array element, a membership policy refuses a string token outright, and a substring policy "grants" on an array only by stringifying it (an accident, not a feature).
2. **Case 2 — the over-grant.** A token that never held `MCPAccess-Atlan-Read` (only the decoy `MCPAccess-Atlan-Read-Extra`): the substring policy grants it, the array policy refuses. The decoy pair is the proof that matching is exact.
3. **Case 3 — many groups, exact membership.** All four example groups on an array token, plus the empty-token refusal.

Below the tour:

- **The fix**: five steps (find the mapping, emit a multi-valued claim, verify by decoding, write the policy on the claim not on a user, prove with a decoy), every line labelled `measured` / `console text` / `UNVERIFIED`.
- **Is / Is not**: what the claim-shape change is and is not.

The diagram (ReactFlow, movable boxes, Simulate, Reset, speed control) is loaded from the diagram-studio/1 data vendored under `web/src/studio-data`, never hand-built.

Every run shows **What the mock policy door did (simulated)** (the family's shared trace panel, relabelled for this lab through its title and basis-note props): the request, the reply, and the decisions in between (token verified, claim shape, policy ask), each marked `checked` because this lab's mock door computed it. It is not Privilege and not a Cedar engine.

## Workspace and configuration

- Each browser tab gets its own `X-Workspace-Id` (default `default`), kept in `sessionStorage` (in memory if blocked), so one visitor's runs and Reset never touch another's.
- customer.config (rule 12): the optional `customer.config.json` is read by `npm start` / `npm run dev` only; the Docker image does not contain it (`.dockerignore`, read-only filesystem).

## Honesty

Everything on the page is **simulated** with example group names. The two JSON serialisations are what JSON guarantees (shown live); the over-grant is computed here. Nothing was re-run on a tenant; the fix on a real PingFederate is a token-mapping change, and which mapping UI emits which shape is UNVERIFIED here. Real mode is disabled with that reason.

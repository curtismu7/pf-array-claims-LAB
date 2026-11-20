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

Every run shows **What the policy door did** (the family's shared trace panel, relabelled per mode through its title and basis-note props): the request, the reply, and the decisions in between (token verified, claim shape, policy ask). A mock run marks every decision `checked` because the mock door computed it; a Real run titles the panel **What the real gateway did (live call)** and marks its decisions inferred/observed, because the gateway reports no per-check detail. The door is not Privilege and not a Cedar engine; a Real run's claim verdict stays this lab's own computation.

## Workspace and configuration

- Each browser tab gets its own `X-Workspace-Id` (default `default`), kept in `sessionStorage` (in memory if blocked), so one visitor's runs and Reset never touch another's.
- customer.config (rule 12): the optional `customer.config.json` is read by `npm start` / `npm run dev` only; the Docker image does not contain it (`.dockerignore`, read-only filesystem).

## Real mode: one live gateway call, your claims

Real (the header toggle) needs the gateway settings: `PAC_GW_URL` (gateway origin), `PAC_GW_APPS`
(door names) and `PAC_GW_KEY_<NAME>` (an agent access key) in `~/Development/.env` (or the file
`STANDALONE_ENV` names, or the lab's own `.env`). See `.env.example`.

**What a Real run does** (`POST /api/run-real`): you paste the **decoded claims** of a real token you
hold — never the token itself (the server refuses a bearer credential outright). The lab computes the
scenario's claim verdict over your claims and calls the live gateway's `tools/list` so the trace shows
the real wire (keys scrubbed, the family's shared hop). The claim verdict itself is always this lab's
computation, never a product guarantee.

## Honesty

The mock runs are **simulated** with example group names; the two JSON serialisations are what JSON
guarantees (shown live); the over-grant is computed here. Nothing about a real tenant was re-run: the
fix on a real PingFederate is a token-mapping change, and which mapping UI emits which shape is
UNVERIFIED here. Real adds the wire truth for the one call the lab makes; the verdict stays the lab's.

# Talk track: the isMemberOf claim shape

One-liner: "The same policy, the same user, two different answers — because the token's isMemberOf claim is a string in one and an array in the other."

## The walk

1. **The knob is at the token mapping.** Before any policy runs, PingFederate decides what shape isMemberOf takes: a delimited string when a text attribute or a bracketed expression feeds it, a JSON array when a multi-valued attribute is mapped directly.
2. **A string forces text search.** A policy asking "does the token carry MCPAccess-Atlan-Read?" can only look inside the text when the claim is a string — and text search matches MCPAccess-Atlan-Read-Extra just as well.
3. **An array gives exact membership.** With a real array the policy asks the question properly: the group is granted only when the array holds it, and the decoy is refused.
4. **The shape can also mismatch the other way.** A policy written for arrays can never match a string claim: case 1's fourth scenario shows the door refusing a token that actually held the group.
5. **The proof is the decoy.** Case 2: same policy, a token that never held the group. The string grants it (the over-grant), the array refuses. Run both, and the demo makes the point without naming any tenant.

## If asked

- **"Where exactly is the fix?"** In the token mapping at PingFederate: map the directory's multi-valued group attribute directly, with no delimiter and no brackets, so the claim serialises as a JSON array.
- **"Does this lab touch a real tenant?"** No. The tokens are HS256 fixtures, the door is this lab's own evaluator of two claim-reading modes, and the group names are examples.
- **"Why did the policy 'always fail' in the POC?"** Two ways: a policy that searches text silently over-grants, and a policy written for arrays can never match a string claim — the shape decides before the policy runs.
- **"Is substring matching always wrong?"** It is always inexact. It happens to answer correctly when the only groups present are the exact ones asked for — that is why the bug hides until a decoy name appears.
- **"How do I prove the fix on a real tenant?"** Decode an issued token and check isMemberOf is an array; then run the decoy pair: a user holding only MCPAccess-Atlan-Read-Extra must not get MCPAccess-Atlan-Read.

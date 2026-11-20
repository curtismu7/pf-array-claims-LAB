// Stories as data (rule 10): each case has one story text with {{cast.<name>}} tokens, and three vertical packs (banking, healthcare, retail)
// fill the cast. A token with no value in a pack is an error (a test and renderStory both refuse it), never a blank on the page.
// The stories are framing only: they add no claim about what was measured. Example names only; the tools stay CountTool, ListIndexTool and
// SearchIndexTool and the ids stay the lab's example ids.

export const CAST_KEYS = ["org", "agent", "approver", "sensitive", "record"];

export const PACKS = {
  banking: {
    label: "Banking",
    cast: { org: "Example Bank", agent: "payments assistant", approver: "treasury officer", sensitive: "a large wire-transfer search", record: "customer accounts" }
  },
  healthcare: {
    label: "Healthcare",
    cast: { org: "Example Health", agent: "scheduling assistant", approver: "clinic manager", sensitive: "a patient-record search", record: "patient records" }
  },
  retail: {
    label: "Retail",
    cast: { org: "Example Retail", agent: "stock assistant", approver: "store manager", sensitive: "a full customer-order search", record: "customer orders" }
  }
};
export const DEFAULT_PACK = "banking";

export const STORIES = {
  hold: "{{cast.org}} runs a {{cast.agent}}. When it tries {{cast.sensitive}} with nobody watching, the policy says a {{cast.approver}} must approve first, so the call waits instead of failing. In this lab SearchIndexTool stands in for that search, and the whole case is simulated.",
  scope: "At {{cast.org}} the {{cast.agent}} may reach {{cast.record}} only when its token carries the matching scope. Without the scope the call is refused and the reason names it. In this lab SearchIndexTool stands in for that tool, and the whole case is simulated.",
  actsub: "{{cast.org}} has two tools, and each tool's policy names which agent may call it. The {{cast.agent}} is let through on the tool that names it and refused on the tool that names a different value. In this lab CountTool and ListIndexTool stand in for those tools; this is the case with one measured run on a real tenant.",
  stepup: "At {{cast.org}} the held call waits for the {{cast.approver}} — and the approval itself is protected: the approver completes a step-up on their own device (a mock PingID push or code) before the approval records. A stolen agent session cannot approve as the human. In this lab the step-up gate is mock; the factor itself was measured on a real tenant (2026-11-18) and the composition with the hold is simulated."
};

const TOKEN = /\{\{cast\.([A-Za-z_]+)\}\}/g;
// Every token of a text, so a test (and renderStory) can refuse one the cast does not define.
export const tokensOf = (text) => [...String(text).matchAll(TOKEN)].map((m) => m[1]);

export function renderStory(text, cast) {
  return String(text).replace(TOKEN, (_, key) => {
    if (!Object.hasOwn(cast, key) || typeof cast[key] !== "string" || !cast[key]) throw new Error(`story token {{cast.${key}}} has no value in the pack`);
    return cast[key];
  });
}

// The stories for one pack, with the customer's organisation name (customer.config) in place of the pack's when it gave one.
export function storiesFor(packId, org) {
  if (!Object.hasOwn(PACKS, packId)) throw new Error(`unknown pack "${packId}"`);
  const cast = { ...PACKS[packId].cast, ...(org ? { org } : {}) };
  return Object.fromEntries(Object.entries(STORIES).map(([id, text]) => [id, renderStory(text, cast)]));
}

export const packList = () => Object.entries(PACKS).map(([id, p]) => ({ id, label: p.label }));

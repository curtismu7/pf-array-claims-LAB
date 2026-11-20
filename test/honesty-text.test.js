// Rule 2 (simulation honesty): nothing in this lab was measured on a tenant. The words a review must never see back,
// and the label rule: every claim is labelled measured / console text / UNVERIFIED / simulated, and "measured" here
// only ever covers what JSON itself guarantees or what this lab's own door computed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { CASES, SCENARIOS } from "../server/src/scenarios.js";
import { FIX, IS_IS_NOT } from "../server/src/content.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");
// Code comments are not shown to anyone; only strings and prose are checked.
const shown = (p) => (/\.jsx?$/.test(p) ? read(p).replace(/\/\*[\s\S]*?\*\//g, "").split("\n").filter((l) => !l.trim().startsWith("//")).join("\n") : read(p));
const FILES = [
  "README.md", "CLAUDE.md", "docs/talk-track.md", "docs/shelf-entry.json", "content-pack.json", "web/src/studio-data/pf-array-claims-flow.json",
  "server/src/scenarios.js", "server/src/content.js", "server/src/index.js",
  ...readdirSync(join(root, "web/src")).filter((f) => /\.jsx?$/.test(f)).map((f) => `web/src/${f}`)
];

// Phrases that claim a real measurement or a product guarantee this lab never made. (Lowercased substring checks;
// phrase-shaped, so a word like "verified" inside "unverified" does not trip it.)
const REFUSED = [
  "was measured on a real tenant",
  "measured on a real tenant",
  "measured on the real",
  "the real tenant showed",
  "the real run showed",
  "live-verified",
  "verified on a tenant",
  "verified live",
  "we verified",
  "guaranteed by pingfederate",
  "pingfederate serialises arrays when", // a product-behaviour guarantee the lab does not make
  "the customer's tenant showed",
  "a real pf showed",
  "it always grants", // absolute claim about a policy engine
  "never over-grants"
];

for (const f of FILES) {
  test(`honesty: ${f} claims no measurement this lab did not make`, () => {
    const text = shown(f).toLowerCase();
    for (const phrase of REFUSED) {
      assert.ok(!text.includes(phrase), `${f} contains the refused phrase "${phrase}"`);
    }
  });
}

// Every "measured" label in the fix and the IS / IS NOT panel must be a JSON-guarantee or a this-lab-reproducible claim.
test("honesty: 'measured' labels in the content cover only JSON guarantees or lab-reproducible runs", () => {
  const measured = [...FIX.steps.flatMap((s) => s.notes), ...IS_IS_NOT.is, ...IS_IS_NOT.isNot].filter((n) => n.label === "measured");
  assert.ok(measured.length >= 3, "the content carries its measured labels");
  for (const n of measured) {
    const t = n.text.toLowerCase();
    const okJson = t.includes("json") || t.includes("serialisation") || t.includes("this lab") || t.includes("this lab's");
    assert.ok(okJson, `a 'measured' note claims more than the lab can stand behind: "${n.text}"`);
  }
});

// The cases and scenarios say "simulated", never "measured".
test("honesty: cases and scenarios are labelled simulated", () => {
  for (const c of CASES) assert.equal(c.basis, "simulated", `case ${c.id} basis`);
  for (const s of SCENARIOS) assert.ok(!/measured/i.test(s.expectNote || ""), `scenario ${s.id} expectNote claims a measurement`);
});

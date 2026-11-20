// The Learning Hub pack (rule 6) and the shelf entry (rule 9): shape, cross-references and the lab's own identity.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const json = (p) => JSON.parse(readFileSync(join(root, p), "utf8"));
const pack = json("content-pack.json");
const shelf = json("docs/shelf-entry.json");
const TAGS = ["pingfederate", "oauth-tokens", "authorization-policy", "agent-identity", "simulated"];

test("content pack: schema, ids unique, cards point at real terms and stories, http(s) sources", () => {
  assert.equal(pack.schema, "demo-content-pack/1");
  assert.match(pack.id, /^[a-z][a-z0-9-]{1,40}$/);
  assert.match(pack.version, /^\d+\.\d+\.\d+$/);
  for (const list of [pack.glossary, pack.sources, pack.cards, pack.stories]) assert.equal(new Set(list.map((x) => x.id)).size, list.length);
  const terms = new Set(pack.glossary.map((t) => t.id));
  const stories = new Set(pack.stories.map((s) => s.id));
  for (const c of pack.cards) {
    assert.ok(["setup", "try-it", "concept", "reference"].includes(c.group), c.id);
    assert.match(c.action.href, /^\/(?!\/)/, c.id);
    for (const t of c.terms || []) assert.ok(terms.has(t), `${c.id}: term ${t}`);
    if (c.story) assert.ok(stories.has(c.story), `${c.id}: story ${c.story}`);
  }
  for (const s of pack.sources) assert.match(s.url, /^https?:\/\//);
  for (const s of pack.stories) assert.match(s.id, /^S\d\d$/);
});

test("content pack and shelf entry agree on the lab's identity (port 7828, provisional catalog id D140)", () => {
  assert.equal(shelf.id, "pf-array-claims-lab");
  assert.equal(shelf.name, "PF Array Claims");
  assert.equal(shelf.kind, "Tester");
  assert.ok(!("tier" in shelf), "the shelf's field is kind; tier is dropped by its registry");
  assert.equal(shelf.catalogId, "D140 provisional");
  assert.equal(pack.demo.catalog, shelf.catalogId);
  assert.equal(shelf.port, 7828);
  assert.equal(shelf.url, "http://localhost:7828");
  assert.equal(pack.demo.baseUrl, "http://127.0.0.1:7828");
  assert.equal(pack.demo.doctor, "/api/health");
  assert.equal(pack.demo.id, pack.id);
  assert.equal(pack.id, shelf.id);
  assert.deepEqual(pack.demo.tags, shelf.tags);
});

test("shelf entry: description <= 300, tags from the family list, portable composeFile, no ping product of its own", () => {
  assert.ok(shelf.description.length <= 300, String(shelf.description.length));
  for (const t of shelf.tags) assert.ok(TAGS.includes(t), t);
  assert.equal(shelf.composeFile, "docker-compose.yml");
  assert.deepEqual(shelf.pingProducts, []);
  assert.equal(shelf.contentPack, "content-pack.json");
});

test("the README says Tier: Tester, and the source lab's identity is not carried over", () => {
  const readme = readFileSync(join(root, "README.md"), "utf8");
  assert.match(readme, /^Tier: Tester$/m);
  const files = ["README.md", "CLAUDE.md", "package.json", "docker-compose.yml", "Dockerfile", "content-pack.json", "docs/shelf-entry.json", "docs/talk-track.md",
    "web/src/studio-data/pf-array-claims-flow.json", "web/app.css", "web/index.html", "web/src/App.jsx", "web/src/FlowSim.jsx", "web/src/Banner.jsx", "web/src/RunResult.jsx",
    "web/src/ScenarioPicker.jsx", "web/src/Guide.jsx", "server/src/index.js", "server/src/claims.js", "server/src/door.js", "server/src/scenarios.js", "server/src/content.js",
    "scripts/doctor.mjs", "scripts/reset.mjs", ".github/workflows/ci.yml"];
  // The source lab's own id, name, catalog id and port must not survive as this lab's identity.
  const SOURCE = /\bD135\b|\b7820\b|\b17820\b|cedar-in-privilege-lab|Cedar in Privilege/;
  for (const f of files) assert.ok(!SOURCE.test(readFileSync(join(root, f), "utf8")), `${f} still carries the source lab's identity`);
});

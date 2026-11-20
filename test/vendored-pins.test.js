// The vendored shared pieces match their pin files byte for byte (rules 22, 24): TopMenu, JsonPane and the shared dialogs. Change them in the canonical
// copy under AI-DEMO-Standalone/shared, re-vendor with cp, re-pin; never edit them here. (gateway-trace and verify-mark have their own pin tests.)
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sha = (p) => createHash("sha256").update(readFileSync(join(root, p))).digest("hex");
const pins = (file) => readFileSync(join(root, file), "utf8").split("\n").filter((l) => /^[0-9a-f]{64}\s/.test(l)).map((l) => l.split(/\s+/));

test("web/src/top-menu/* matches top-menu.sha256 and both files are pinned", () => {
  const dir = "web/src/top-menu";
  const p = pins(`${dir}/top-menu.sha256`);
  assert.deepEqual(p.map(([, f]) => f).sort(), ["TopMenu.jsx", "top-menu.css"]);
  for (const [hash, file] of p) {
    // The canonical pin names the files bare; vendored pins may carry them pathed (web/src/top-menu/...). Accept either, verify the basename.
    const local = file.replace(/^.*\//, "");
    assert.equal(sha(`${dir}/${local}`), hash, `${file} differs from top-menu.sha256 (hand-edited, or re-vendored without re-pinning)`);
  }
});

test("web/src/components/JsonPane.* matches its pin files", () => {
  const dir = "web/src/components";
  for (const [file, pinFile] of [["JsonPane.jsx", "JsonPane.sha256"], ["JsonPane.css", "JsonPane.css.sha256"]]) {
    const [hash, name] = readFileSync(join(root, dir, pinFile), "utf8").trim().split(/\s+/);
    assert.equal(name, file, pinFile);
    assert.equal(sha(`${dir}/${file}`), hash, `${file} differs from ${pinFile}`);
  }
});

test("the shared dialogs (floating-dialog, help-dialog, talk-track) and ShelfLink match their pin files, and every file in those folders is pinned", () => {
  const sets = [
    ["web/src/floating-dialog", "floating-dialog.sha256", ["FloatingDialog.jsx", "floating-dialog.css", "floating-dialog.test.jsx", "geometry.js", "useFloatingPanel.js"]],
    ["web/src/help-dialog", "help-dialog.sha256", ["HelpDialog.jsx"]],
    ["web/src/talk-track", "talk-track.sha256", ["TalkTrackDialog.jsx"]],
    ["web/src/components", "ShelfLink.sha256", ["ShelfLink.jsx"]]
  ];
  for (const [dir, pinFile, files] of sets) {
    const p = pins(`${dir}/${pinFile}`);
    assert.deepEqual(p.map(([, f]) => f).sort(), [...files].sort(), `${dir}/${pinFile} pins`);
    for (const [hash, file] of p) assert.equal(sha(`${dir}/${file}`), hash, `${dir}/${file} differs from ${pinFile} (hand-edited, or re-vendored without re-pinning)`);
  }
});

test("the shared TopMenu is the one the page imports, and the vendored stylesheet and attribution check are present", () => {
  const app = readFileSync(join(root, "web/src/App.jsx"), "utf8");
  assert.match(app, /import TopMenu from "\.\/top-menu\/TopMenu\.jsx"/);
  assert.match(app, /<TopMenu\b/);
  assert.ok(existsSync(join(root, "web/standalone-ui.css")));
  assert.ok(existsSync(join(root, "scripts/check-no-ai-attribution.sh")));
  assert.ok(existsSync(join(root, "test/kit/demo-kit-conformance.mjs")));
});

test("the diagram is the studio's data, vendored byte for byte, loaded by name, with no local copy left (rule 17)", () => {
  const dir = "web/src/studio-data";
  const p = pins(`${dir}/studio-data.sha256`);
  assert.deepEqual(p.map(([, f]) => f), ["pf-array-claims-flow.json"]);
  for (const [hash, file] of p) assert.equal(sha(`${dir}/${file}`), hash, `${file} differs from studio-data.sha256 (hand-edited, or re-vendored without re-pinning)`);
  // The studio exports a flow as JSON.stringify(flow, null, 2) plus a newline: anything else is not its export.
  const text = readFileSync(join(root, dir, "pf-array-claims-flow.json"), "utf8");
  const flow = JSON.parse(text);
  assert.equal(text, `${JSON.stringify(flow, null, 2)}\n`);
  assert.equal(flow.schema, "diagram-studio/1");
  assert.equal(flow.id, "pf-array-claims-flow");
  const ids = flow.nodes.map((n) => n.id);
  assert.deepEqual(ids, ["user", "pf", "door", "tool", "refused"]);
  for (const n of flow.nodes) assert.ok(flow.groups[n.group], `node ${n.id} has a group`);
  for (const e of flow.edges) assert.ok(ids.includes(e.source) && ids.includes(e.target), `${e.source} -> ${e.target}`);
  for (const s of flow.steps) for (const i of s.edges) assert.ok(Number.isInteger(i) && i >= 0 && i < flow.edges.length, `step edge ${i}`);
  assert.ok(!existsSync(join(root, "web/src/diagrams/pf-array-claims-flow.json")), "the lab's own local copy must stay deleted");
  assert.ok(!existsSync(join(root, "data/diagram.json")), "no hand-built local copy");
  assert.match(readFileSync(join(root, "web/src/diagram-data.js"), "utf8"), /from "\.\/studio-data\/pf-array-claims-flow\.json"/);
  assert.match(readFileSync(join(root, "web/src/FlowSim.jsx"), "utf8"), /getDiagram\("pf-array-claims-flow"\)/);
});

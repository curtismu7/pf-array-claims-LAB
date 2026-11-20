#!/usr/bin/env node
// Repo checks: forbidden identifiers, attribution lines, compose policies.
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";

const root = new URL("..", import.meta.url).pathname;
const failures = [];

// The forbidden identifiers are assembled from parts so this file does not itself contain them.
const j = (...p) => p.join("");
// Hostname-level check: the family lab-proxy domain (local.<domain> or <lab>.local.<domain>) is the only host of that domain a lab may name;
// any other host of it fails.
const DOMAIN = j("ping-", "devops");
const FORBIDDEN_HOST_RE = new RegExp(`(?:[\\w.-]+\\.)?${DOMAIN}\\.com(?::\\d+)?`, "g");
const ALLOWED_PROXY_HOSTS = [new RegExp(`^local\\.${DOMAIN}\\.com(?::\\d+)?$`), new RegExp(`^[\\w-]+\\.local\\.${DOMAIN}\\.com(?::\\d+)?$`)];
function forbiddenHostHits(text) {
  const hits = [];
  for (const m of String(text).matchAll(FORBIDDEN_HOST_RE)) {
    if (!ALLOWED_PROXY_HOSTS.some((re) => re.test(m[0]))) hits.push(m[0]);
  }
  return hits;
}
const FORBIDDEN = [
  /pingone\.com(?!\.invalid)/,
  new RegExp(j("proc", "yon"), "i"),
  new RegExp(j("c", "muir"), "i"),
  new RegExp(j("pf-", "route-", "c", "-test")),
  new RegExp(j("mcp", "gw"), "i"),
  new RegExp(j("curtis", "mu7")),
  new RegExp(j("ping-", "sandbox")),
  /ai[-_]?demo2/i,
  new RegExp(j("Co-Authored", "-By")),
  new RegExp(j("Generated ", "with"))
];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === ".git" || name === "node_modules" || name === "dist" || name.startsWith(".")) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

// The vendored family stylesheet is canonical and shared; its comments mention
// other projects by design. Skip it for the cross-project-identifier scan but
// keep its sha pinned against drift (the vendored-sha check below).
// The vendored conformance gate and the family attribution checker quote the
// patterns they enforce (org names, attribution lines); skip them the same way.
const VENDORED_ALLOWED = new Set(["standalone-ui.css", "demo-kit-conformance.mjs", "check-no-ai-attribution.sh", "check-ui-standard.sh"]);
// The vendored floating-dialog files name the project they were ported from in their comments. They are byte-pinned (checked below), so they are
// skipped here the same way.
const VENDORED_DIRS = ["/web/src/floating-dialog/"];

let files = 0;
for (const file of walk(root)) {
  if (!/\.(js|mjs|jsx|ts|json|md|yml|yaml|html|css|sh|example)$/.test(file)) continue;
  files++;
  // The vendored family stylesheet is canonical and shared; its comments name
  // other projects by design. Drift is caught separately by check-css/vendored sha.
  const text = readFileSync(file, "utf8");
  if (VENDORED_ALLOWED.has(file.split("/").pop()) || file.endsWith("repo-checks.mjs") || VENDORED_DIRS.some((d) => file.includes(d))) continue;
  const hostHits = forbiddenHostHits(text);
  if (hostHits.length) failures.push(`${file}: non-proxy host(s) of the family domain: ${[...new Set(hostHits)].join(", ")}`);
  for (const re of FORBIDDEN) {
    if (re.test(text)) failures.push(`${file}: matches ${re}`);
  }
}

console.log(`repo-checks: scanned ${files} files`);

// Studio data (rule 17): the diagram is the studio's own flow, vendored byte for byte; its file must equal the hash pinned in
// web/src/studio-data/studio-data.sha256, and the lab's old local copy must not come back.
{
  const dir = join(root, "web", "src", "studio-data");
  const pinPath = join(dir, "studio-data.sha256");
  const pins = existsSync(pinPath) ? readFileSync(pinPath, "utf8").split("\n").filter((l) => /^[0-9a-f]{64}\s/.test(l)).map((l) => l.split(/\s+/)) : [];
  if (pins.length !== 1 || pins[0][1] !== "pf-array-claims-flow.json") failures.push("web/src/studio-data/studio-data.sha256 must pin exactly pf-array-claims-flow.json");
  else if (createHash("sha256").update(readFileSync(join(dir, pins[0][1]))).digest("hex") !== pins[0][0]) failures.push("web/src/studio-data/pf-array-claims-flow.json differs from its pin");
  else console.log("repo-checks: vendored studio data matches its pin");
  if (existsSync(join(root, "web", "src", "diagrams", "pf-array-claims-flow.json"))) failures.push("web/src/diagrams/pf-array-claims-flow.json: the lab-local diagram copy must stay deleted (rule 17)");
  if (existsSync(join(root, "data", "diagram.json"))) failures.push("data/diagram.json: a hand-built local diagram copy must not exist (rule 17)");
}

// Vendored stylesheet: must equal the hash pinned in scripts/standalone-ui.sha256 (so CI, which has no family checkout, catches a
// hand edit), and must equal the family canonical when that checkout exists (re-vendor with cp, then re-pin).
const vendored = join(root, "web", "standalone-ui.css");
const pinFile = join(root, "scripts", "standalone-ui.sha256");
const canonical = join(process.env.HOME || "", "Development", "AI-DEMO-Standalone", "shared", "standalone-ui.css");
const sha = (f) => createHash("sha256").update(readFileSync(f)).digest("hex");
if (existsSync(vendored)) {
  const v = sha(vendored);
  const [pin, pinName] = existsSync(pinFile) ? readFileSync(pinFile, "utf8").trim().split(/\s+/) : [];
  if (!pin || pinName !== "standalone-ui.css") failures.push("scripts/standalone-ui.sha256 is missing or malformed");
  else if (v !== pin) failures.push(`web/standalone-ui.css differs from its pin in scripts/standalone-ui.sha256 (${v.slice(0, 8)} vs ${pin.slice(0, 8)})`);
  else console.log("repo-checks: vendored standalone-ui.css matches its pin");
  if (existsSync(canonical)) {
    const c = sha(canonical);
    if (v !== c) failures.push(`web/standalone-ui.css drifts from the family canonical (${v.slice(0, 8)} vs ${c.slice(0, 8)})`);
    else console.log("repo-checks: vendored standalone-ui.css matches canonical");
  }
}

// Vendored shared components (the shared services catalogue): every file must equal the hash in its pin file (CI has no family checkout; a
// local checkout can lag the canonical, so the pin is what is enforced). Re-vendor with cp from the canonical, then re-pin; never edit a copy.
const VENDORED = [
  { dir: "web/src/floating-dialog", pin: "floating-dialog.sha256" },
  { dir: "web/src/help-dialog", pin: "help-dialog.sha256" },
  { dir: "web/src/talk-track", pin: "talk-track.sha256" },
  { dir: "web/src/components", pin: "ShelfLink.sha256", only: ["ShelfLink.jsx"] }
];
for (const { dir, pin, only } of VENDORED) {
  const pinPath = join(root, dir, pin);
  if (!existsSync(pinPath)) { failures.push(`${dir}/${pin} is missing`); continue; }
  const pins = readFileSync(pinPath, "utf8").split("\n").filter((l) => /^[0-9a-f]{64}\s/.test(l)).map((l) => l.split(/\s+/));
  if (!pins.length || (only && pins.map(([, f]) => f).join() !== only.join())) failures.push(`${dir}/${pin} does not pin the expected files`);
  for (const [hash, file] of pins) {
    const f = join(root, dir, file);
    if (!existsSync(f)) { failures.push(`${dir}/${file} is pinned but missing`); continue; }
    if (sha(f) !== hash) failures.push(`${dir}/${file} differs from its pin ${pin}`);
  }
}
console.log("repo-checks: vendored shared components match their pins");

if (failures.length) {
  for (const f of failures) console.error(`FAIL ${f}`);
  process.exit(1);
}
console.log(`repo-checks: PASS (0 forbidden-identifier hits)`);

// R8, ATTR, HI-6, HI-7: the repo's CI, vendored gate and attribution script, compose host list and ignore files.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, rmSync, cpSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { defaultAllowedHosts } from "../server/src/guards.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");
const sha = (p) => createHash("sha256").update(readFileSync(join(root, p))).digest("hex");
const pinned = (pinFile, file) => {
  const [hash, name] = read(pinFile).trim().split(/\s+/);
  assert.equal(name, file, `${pinFile} names ${file}`);
  return hash;
};
const j = (...p) => p.join("");

// Split the workflow into its jobs (two-space indented keys under `jobs:`).
function jobs() {
  const text = read(".github/workflows/ci.yml");
  const body = text.slice(text.indexOf("\njobs:") + 6);
  const out = {};
  let name = null;
  for (const line of body.split("\n")) {
    const m = /^ {2}([a-z][\w-]*):\s*$/.exec(line);
    if (m) { name = m[1]; out[name] = ""; } else if (name) out[name] += `${line}\n`;
  }
  return out;
}

test("R8 CI: the conformance job runs the gate and can FAIL (no `|| echo`, no continue-on-error)", () => {
  const ci = read(".github/workflows/ci.yml");
  const conf = jobs().conformance;
  assert.match(conf, /node test\/kit\/demo-kit-conformance\.mjs \. --new --tier=Tester/);
  assert.ok(!/\|\|/.test(conf), "no shell fallback after the gate");
  assert.ok(!/continue-on-error/.test(ci));
  assert.ok(!/::warning::/.test(ci));
});

test("R8 CI: the history scans see the full history (fetch-depth 0) and the tree; least-privilege token", () => {
  const all = jobs();
  const ci = read(".github/workflows/ci.yml");
  assert.match(ci, /^permissions:\s*\n\s+contents: read/m);
  for (const name of ["forbidden-strings", "gitleaks"]) assert.match(all[name], /fetch-depth: 0/, name);
  assert.match(all["forbidden-strings"], /git log -p --all/);
  assert.match(all["forbidden-strings"], /git grep/, "the tree is scanned as well as the history");
  assert.match(all["forbidden-strings"], /check-no-ai-attribution\.sh/, "the attribution check runs where the history is complete");
  assert.ok(!/check-no-ai-attribution/.test(all.test), "not in the shallow test job");
  assert.match(all.test, /node-version: 26/);
  assert.match(ci, /actions\/checkout@v5/);
});

test("R8 the vendored conformance gate is the current demo-kit-base copy (pinned) and includes rules 22 and 23", () => {
  assert.equal(sha("test/kit/demo-kit-conformance.mjs"), pinned("test/kit/demo-kit-conformance.sha256", "demo-kit-conformance.mjs"));
  const kit = read("test/kit/demo-kit-conformance.mjs");
  assert.match(kit, /rule 22/);
  assert.match(kit, /rule 23/);
});

test("ATTR the shipped attribution script is the AI-DEMO-Standalone shared copy (pinned), strict about names, no dead hash list", () => {
  assert.equal(sha("scripts/check-no-ai-attribution.sh"), pinned("scripts/check-no-ai-attribution.sha256", "check-no-ai-attribution.sh"));
  const script = read("scripts/check-no-ai-attribution.sh");
  assert.ok(!/known_old/.test(script), "no dead list of old commit hashes");
  assert.match(script, new RegExp(`\\(${j("curtis", "mu7")}\\|Curtis Muir\\)`), "only the owner's own name passes on the owner's noreply address");
});

// Run the shipped script against throwaway repos: a clean one passes, an AI co-author trailer and a credit line fail.
function scratchRepo(message) {
  const dir = mkdtempSync(join(tmpdir(), "attr-"));
  // -c core.hooksPath=: a developer's global commit-msg hook (the owner's attribution guard) must not
  // reject the scratch repo's own commits; the script under test does the rejecting.
  const git = (...args) => execFileSync("git", ["-c", "user.name=T", "-c", "user.email=t@example.invalid", "-c", "core.hooksPath=/dev/null", ...args], { cwd: dir, stdio: "pipe" });
  git("init", "-q");
  mkdirSync(join(dir, "scripts"));
  cpSync(join(root, "scripts/check-no-ai-attribution.sh"), join(dir, "scripts/check-no-ai-attribution.sh"));
  writeFileSync(join(dir, "a.txt"), "hello\n");
  git("add", "-A");
  git("commit", "-q", "-m", message);
  return dir;
}
const attribution = (dir) => spawnSync("bash", ["scripts/check-no-ai-attribution.sh"], { cwd: dir, encoding: "utf8" });

test("ATTR the shipped script passes a clean history and fails a trailer and a credit line", () => {
  const cases = [
    ["a clean message", "Add the lab", 0],
    ["an AI co-author trailer", `Add the lab\n\n${j("Co-Authored", "-By")}: Some Assistant <noreply@assistant.example>`, 1],
    ["a trailer naming an AI on the owner's noreply address", `Add the lab\n\n${j("Co-Authored", "-By")}: Some Assistant <49688644+${j("curtis", "mu7")}@users.noreply.github.com>`, 1],
    ["a credit line", `Add the lab\n\n${j("Generated ", "with")} [${j("Claude", " Code")}](https://example.invalid)`, 1]
  ];
  for (const [name, message, code] of cases) {
    const dir = scratchRepo(message);
    try { assert.equal(attribution(dir).status, code, name); } finally { rmSync(dir, { recursive: true, force: true }); }
  }
});

test("ATTR the shipped script fails a tracked file that carries the credit", () => {
  const dir = scratchRepo("Add the lab");
  try {
    writeFileSync(join(dir, "notes.md"), `${j("Generated ", "with")} [${j("Claude", " Code")}](https://example.invalid)\n`);
    execFileSync("git", ["add", "-A"], { cwd: dir });
    assert.equal(attribution(dir).status, 1);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("HI-6 + SWAP compose: the allowed hosts follow HOST_PORT and carry the lab-proxy names, in step with the server's default list", () => {
  const compose = read("docker-compose.yml");
  const line = /LAB_ALLOWED_HOSTS=(\S+)/.exec(compose)?.[1];
  assert.ok(line, "compose sets LAB_ALLOWED_HOSTS");
  const entries = line.split(",");
  assert.ok(entries.includes("localhost:${HOST_PORT:-7828}") && entries.includes("127.0.0.1:${HOST_PORT:-7828}"), "the published port, whatever HOST_PORT is");
  const resolved = entries.map((e) => e.replaceAll("${HOST_PORT:-7828}", "7828"));
  assert.deepEqual(new Set(resolved), new Set(defaultAllowedHosts(7828)));
  for (const need of ["pf-array-claims-lab.local.ping-devops.com:7828", "pf-array-claims-lab:7828", "pf-array-claims-lab.local.ping-devops.com:8443", "local.ping-devops.com:8443"]) {
    assert.ok(entries.includes(need), need);
  }
  assert.match(compose, /container_name: pf-array-claims-lab\b/, "the container name is the proxy's upstream name");
});

test("HI-7 .gitignore and .dockerignore keep every .env.* out, and only .env.example in", () => {
  for (const f of [".gitignore", ".dockerignore"]) {
    const lines = read(f).split("\n").map((l) => l.trim());
    assert.ok(lines.includes(".env"), `${f}: .env`);
    assert.ok(lines.includes(".env.*"), `${f}: .env.*`);
    assert.ok(lines.includes("!.env.example") || f === ".dockerignore", `${f}: keeps .env.example`);
  }
  assert.ok(read(".gitignore").split("\n").includes(".data"), ".data is ignored");
});

test("HYG safety.js is reduced to what the lab uses and repo-checks scans it like any other file", () => {
  const safety = read("server/src/safety.js");
  assert.ok(!/GCLAB_BIND|5150|PORT_MIN|resolvePort/.test(safety), "no other lab's port range or bind variable");
  assert.match(safety, /export function isLoopbackHost/);
  assert.ok(!/"safety\.js"/.test(read("scripts/repo-checks.mjs")), "not whitelisted by name");
  const fragment = ["pf", "route"].join("-") + "-"; // built from parts: this test file must not contain the fragment itself
  assert.ok(!read("scripts/repo-checks.mjs").includes(fragment), "no literal forbidden fragment in the checker");
});

test("HYG the family stylesheet pin is checked without the canonical checkout", () => {
  const hash = pinned("scripts/standalone-ui.sha256", "standalone-ui.css");
  assert.equal(createHash("sha256").update(readFileSync(join(root, "web/standalone-ui.css"))).digest("hex"), hash);
  assert.match(read("scripts/repo-checks.mjs"), /standalone-ui\.sha256/);
});

// F03, F04, F08, F11: what the docs must say about the workspace id, the studio diagram, the vendored trace panel's wording and customer.config.
test("README and CLAUDE.md say how the workspace id works, where the diagram comes from, that customer.config is npm-start only, and that the trace panel's wording is generic", () => {
  const readme = read("README.md");
  const claude = read("CLAUDE.md");
  for (const doc of [readme, claude]) {
    assert.match(doc, /X-Workspace-Id/);
    assert.match(doc, /`default`/);
    assert.match(doc, /sessionStorage/);
    assert.match(doc, /customer\.config\.json/);
    assert.match(doc, /npm start/);
    assert.match(doc, /studio-data/);
    assert.match(claude, /pf-array-claims-flow/);
    assert.doesNotMatch(doc, /partly met|lab-local `diagram-studio\/1`/);
  }
  assert.match(claude, /bad_workspace/);
  assert.match(readme, /mock policy door/i);
  assert.match(readme, /Docker image does not contain it/);
  assert.match(readme, /What the mock policy door did/i);
  assert.match(readme, /relabelled/i);
});

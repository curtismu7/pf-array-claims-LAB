// R9: docs/shelf-entry.json must pass the shelf registry's validator. The rules below restate demo-shelf-LAB server/src/registry.js
// validateDemos for the fields this entry uses (id pattern, name and description, kind, catalogId, origin url, healthPath, composeFile,
// tags, pingProducts), so the test runs anywhere. The entry is checked with the same dropped-unknown-key logic the shelf applies.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const entry = JSON.parse(readFileSync(join(root, "docs/shelf-entry.json"), "utf8"));

const ID = /^[a-z0-9][a-z0-9-]{1,40}$/;
const TAG_ID = /^[a-z0-9][a-z0-9-]{0,40}$/;
const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
const SHELL_CHARS = /[;&|$`<>\\"'*?(){}!#\n\r\t\0]/;
const FIELDS = ["id", "addedAt", "name", "catalogId", "alsoCatalogIds", "kind", "description", "url", "where", "mockUrl", "healthPath", "openPath", "composeFile", "composeOverlays", "notes", "tags", "repo", "pingProducts"];
const KNOWN_PRODUCTS = new Set(["pingfederate", "pinggateway", "privilege-gateway", "pingone", "pingone-privilege"]);

function problems(d) {
  const errors = [];
  if (typeof d.id !== "string" || !ID.test(d.id)) errors.push(`id must match ${ID}`);
  for (const f of ["name", "description"]) if (typeof d[f] !== "string" || !d[f].trim() || d[f].length > 300) errors.push(`${f} must be a non-empty string up to 300 characters`);
  for (const f of ["catalogId", "kind"]) if (d[f] !== undefined && (typeof d[f] !== "string" || d[f].length > 40)) errors.push(`${f} must be a short string`);
  try {
    const u = new URL(d.url);
    if (u.protocol !== "http:" && u.protocol !== "https:") errors.push("url must be http or https");
    else if (u.username || u.password || u.search || u.hash || (u.pathname !== "/" && u.pathname !== "")) errors.push("url must be an origin only");
    else if (!LOOPBACK.has(u.hostname.toLowerCase())) errors.push("url host is not loopback");
  } catch { errors.push("url is not a valid URL"); }
  const hp = d.healthPath === undefined ? "/api/health" : d.healthPath;
  if (typeof hp !== "string" || !/^\/[A-Za-z0-9._~\-/]*$/.test(hp) || hp.startsWith("//") || hp.includes("..")) errors.push("healthPath must be a plain path");
  if (d.composeFile !== undefined) {
    const p = d.composeFile;
    if (typeof p !== "string" || !p) errors.push("composeFile must be a path");
    else if (SHELL_CHARS.test(p) || p.split("/").includes("..") || !/\.ya?ml$/.test(p) || p.startsWith("/")) errors.push("composeFile must be a plain relative .yml path");
  }
  if (d.tags !== undefined && (!Array.isArray(d.tags) || d.tags.length > 20 || d.tags.some((t) => typeof t !== "string" || !TAG_ID.test(t)))) errors.push("tags must be tag ids");
  if (d.pingProducts !== undefined && (!Array.isArray(d.pingProducts) || d.pingProducts.length > 5 || d.pingProducts.some((p) => !KNOWN_PRODUCTS.has(p)))) errors.push("pingProducts must be known product names");
  return errors;
}

test("R9 the shelf entry passes the shelf registry's own rules", () => {
  assert.deepEqual(problems(entry), []);
  assert.equal(entry.id, "pf-array-claims-lab");
  assert.equal(entry.kind, "Tester");
  assert.equal(entry.healthPath, "/api/health");
});

test("R9 the restated validator does refuse what the old entry had: an uppercase id", () => {
  assert.match(problems({ ...entry, id: "pf-array-claims-LAB" }).join(), /id must match/);
  assert.match(problems({ ...entry, description: "x".repeat(301) }).join(), /description/);
});

test("R9 every key in the entry is one the registry keeps or one this lab documents, and tier is gone", () => {
  const LAB_ONLY = new Set(["port", "contentPack"]);
  for (const k of Object.keys(entry)) assert.ok(FIELDS.includes(k) || LAB_ONLY.has(k), `unknown key ${k}`);
  assert.ok(!("tier" in entry));
});

test("the shelf description says what is simulated and that nothing was re-run on a tenant", () => {
  assert.ok(!/different agent refused/i.test(entry.description), entry.description);
  assert.match(entry.description, /simulated, example names/i);
  assert.match(entry.description, /not re-run here/i);
  assert.match(entry.description, /not re-run here/i);
});

test("the shelf entry names Tester, the catalog id D140 and port 7828, with tags only from the family list", () => {
  assert.equal(entry.kind, "Tester");
  assert.equal(entry.catalogId, "D140");
  assert.equal(entry.port, 7828);
  assert.equal(entry.url, "http://localhost:7828");
  for (const t of entry.tags) assert.ok(["pingfederate", "oauth-tokens", "authorization-policy", "agent-identity", "simulated"].includes(t), t);
});

// GET /api/health, contract demo-health/1 (demo-shelf-LAB docs/health-contract.md). Public, GET only, no counts, no per-check detail.
// The state comes from a cheap in-process check of the mock door, refreshed in the background every 60 s; a request never runs it.
// Mock needs no setup, so a healthy install is `ready` and `offline` (this lab never calls out).
import express from "express";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const { version } = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "..", "package.json"), "utf8"));
export const DEMO = { id: "pf-array-claims-lab", name: "PF Array Claims", version };

export function createHealth({ check, intervalMs = 60_000, now = () => new Date() }) {
  let last = { state: "unknown", at: null };
  function refresh() {
    try { last = { state: check() ? "ready" : "broken", at: now().toISOString() }; } catch { last = { state: "unknown", at: now().toISOString() }; }
  }
  refresh();
  const timer = setInterval(refresh, intervalMs);
  timer.unref();
  const router = express.Router();
  router.get("/", (_req, res) => {
    res.set("Cache-Control", "no-store");
    res.json({ schema: "demo-health/1", at: last.at || now().toISOString(), state: last.state, runtime: "offline", demo: DEMO });
  });
  router.all("/", (_req, res) => res.set("Allow", "GET").status(405).json({ error: "method_not_allowed", message: "GET only" }));
  return { router, refresh, stop: () => clearInterval(timer) };
}

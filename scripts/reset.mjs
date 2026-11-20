#!/usr/bin/env node
// Reset: clear the recorded runs on a server that is already running on PORT.
const PORT = Number(process.env.PORT || 7828);
const base = `http://127.0.0.1:${PORT}`;
try {
  const r = await fetch(`${base}/api/reset`, { method: "POST", headers: { "content-type": "application/json", origin: base }, body: "{}" });
  if (r.ok) {
    console.log(`reset: cleared runs on ${base}`);
    process.exit(0);
  }
} catch {}
console.log(`reset: no running server on ${base}; nothing to clear`);
process.exit(0);

import { useEffect, useState } from "react";

// What the page says when its own server cannot be reached (rule 23): a fetch that never got an answer is a status 0, never a throw.
export const UNREACHABLE = { error: "network", message: "the lab server is not reachable" };

// The text for any failed call: the server's own message when it sent one, else the HTTP status.
export function failureText(status, body) {
  if (status === 0) return (body && body.message) || UNREACHABLE.message;
  if (body && typeof body.message === "string" && body.message) return body.message;
  return `the request failed (HTTP ${status})`;
}

// Rule 13: the workspace id. One per browser tab, kept in sessionStorage (when the browser blocks it, in memory for this page load), sent
// as X-Workspace-Id on every request so the server keeps this visitor's runs apart from everyone else's. It is never shown on the page.
const WORKSPACE_KEY = "pf-array-claims-workspace";
const WORKSPACE_ID = /^[A-Za-z0-9._-]{1,64}$/;
let memoryWorkspace = null;
export function workspaceId() {
  try {
    const stored = sessionStorage.getItem(WORKSPACE_KEY);
    if (stored && WORKSPACE_ID.test(stored)) return stored;
  } catch { /* storage blocked: fall through to the in-memory id */ }
  if (!memoryWorkspace) memoryWorkspace = `w-${hex(8)}`;
  try { sessionStorage.setItem(WORKSPACE_KEY, memoryWorkspace); } catch { /* none */ }
  return memoryWorkspace;
}
export const workspaceHeaders = () => ({ "X-Workspace-Id": workspaceId() });

export function useApi(path, deps = []) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    let live = true;
    setError(null);
    fetch(path, { headers: workspaceHeaders() })
      .then(async (r) => {
        if (r.ok) return r.json();
        const body = await r.json().catch(() => ({}));
        throw new Error(failureText(r.status, body));
      })
      .then((d) => live && (setData(d), setError(null)))
      .catch((e) => live && setError(e instanceof TypeError ? UNREACHABLE.message : String((e && e.message) || e)));
    return () => {
      live = false;
    };
  }, deps);
  return { data, error };
}

// W3C trace context (rule 14): a new trace for each request the page makes; the server continues it.
const hex = (n) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => b.toString(16).padStart(2, "0")).join("");
export const newTraceparent = () => `00-${hex(16)}-${hex(8)}-01`;

// Never throws: an unreachable server or a body that is not JSON (an HTML error page) comes back as a status and a structured body.
export async function postJson(path, body) {
  try {
    const r = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json", traceparent: newTraceparent(), ...workspaceHeaders() },
      body: JSON.stringify(body || {})
    });
    const d = await r.json().catch(() => ({}));
    return { status: r.status, body: d };
  } catch {
    return { status: 0, body: UNREACHABLE };
  }
}

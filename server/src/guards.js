// Host and same-origin guards for the lab's API.
//
// Host: strict. A request is served only when its Host header is on the allowed list (exact host:port, case-insensitive), or is a
// loopback name on the port this server is actually listening on. No other 127.0.0.1 port, no other localhost port (DNS-rebinding defence).
// Writes: same-origin only. Origin must equal Host, or (behind the shared lab-proxy) the proxy's own origin, which is believed only when
// the Host is a non-loopback entry of the allowed list and X-Forwarded-Host is itself on the list. Cross-site fetch metadata is refused.
// Every refusal is a structured JSON error { error, message } (rule 23).

export const LAB_NAME = "pf-array-claims-lab";
// The family lab-proxy names (shared/lab-proxy/nginx.conf sets Host to <lab>.local.<domain>:<port> and X-Forwarded-Host to the browser's
// host, local.<domain>:8443). Same pattern as pf-privilege-obo-LAB's compose file.
const PROXY_DOMAIN = "local.ping-devops.com";

export function defaultAllowedHosts(port) {
  return [
    `localhost:${port}`,
    `127.0.0.1:${port}`,
    `${LAB_NAME}.${PROXY_DOMAIN}:${port}`,
    `${LAB_NAME}:${port}`,
    `${LAB_NAME}.${PROXY_DOMAIN}:8443`,
    `${PROXY_DOMAIN}:8443`
  ];
}

export function parseAllowedHosts(value, port) {
  const list = value === undefined || String(value).trim() === ""
    ? defaultAllowedHosts(port)
    : String(value).split(",").map((s) => s.trim()).filter(Boolean);
  return new Set(list.map((h) => h.toLowerCase()));
}

const LOOPBACK_HOST = /^(localhost|127\.0\.0\.1|\[::1\]):(\d+)$/;
const isLoopbackHostHeader = (host) => LOOPBACK_HOST.test(host);
const hostOf = (req) => String(req.headers.host || "").trim().toLowerCase();

function refuse(res, status, error, message) {
  return res.status(status).json({ error, message });
}

export function hostGuard(allowed) {
  return (req, res, next) => {
    const host = hostOf(req);
    if (allowed.has(host)) return next();
    const m = LOOPBACK_HOST.exec(host);
    if (m && Number(m[2]) === req.socket.localPort) return next();
    return refuse(res, 403, "host_not_allowed", "the Host header is not on this lab's allowed list (LAB_ALLOWED_HOSTS)");
  };
}

const READ = new Set(["GET", "HEAD", "OPTIONS"]);

function viaLabProxy(req, origin, allowed) {
  const host = hostOf(req);
  if (!allowed.has(host) || isLoopbackHostHeader(host)) return false;
  const xfh = String(req.headers["x-forwarded-host"] || "").split(",")[0].trim().toLowerCase();
  const xfp = String(req.headers["x-forwarded-proto"] || "https").split(",")[0].trim().toLowerCase();
  return xfh !== "" && allowed.has(xfh) && (xfp === "https" || xfp === "http") && origin === `${xfp}://${xfh}`;
}

export function writeGuard(allowed) {
  return (req, res, next) => {
    if (READ.has(req.method)) return next();
    const site = req.headers["sec-fetch-site"];
    if (site && site !== "same-origin" && site !== "none") return refuse(res, 403, "cross_origin", "writes must be same-origin");
    const origin = req.headers.origin;
    if (origin !== undefined) {
      let ok = false;
      try { ok = new URL(origin).host.toLowerCase() === hostOf(req) || viaLabProxy(req, String(origin).toLowerCase(), allowed); } catch { /* not a URL */ }
      if (!ok) return refuse(res, 403, "cross_origin", "writes must be same-origin");
    }
    return next();
  };
}

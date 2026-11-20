// Rule 13 (Demo tier): a workspace id, default "default", taken from the X-Workspace-Id request header. It keys the recorded runs (each
// run record carries its own traces), so one visitor's runs and Reset never touch another's. Review finding F03.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildServer, readState } from "../server/src/index.js";

async function withServer(fn) {
  const saved = process.env.LAB_ALLOWED_HOSTS;
  process.env.LAB_ALLOWED_HOSTS = "localhost:7828,127.0.0.1:7828";
  const srv = buildServer().listen(0, "127.0.0.1");
  await new Promise((r) => srv.on("listening", r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  // ws: undefined = send no X-Workspace-Id header; any string (even "") is sent as given.
  const api = async (method, path, { ws, body } = {}) => {
    const res = await fetch(base + path, {
      method,
      headers: { ...(method === "GET" ? {} : { "content-type": "application/json", origin: base }), ...(ws === undefined ? {} : { "x-workspace-id": ws }) },
      body: method === "GET" ? undefined : JSON.stringify(body || {})
    });
    return { status: res.status, body: await res.json() };
  };
  try { await fn(api); } finally {
    srv.close();
    if (saved === undefined) delete process.env.LAB_ALLOWED_HOSTS; else process.env.LAB_ALLOWED_HOSTS = saved;
  }
}

const runOn = (api, ws, scenario = "decoy-string") => api("POST", "/api/run", { ws, body: { scenario } });
const runsOf = async (api, ws) => (await api("GET", "/api/runs", { ws })).body.runs;

test("with no X-Workspace-Id the workspace is 'default', and 'default' sent explicitly is the same workspace", async () => {
  await withServer(async (api) => {
    await api("POST", "/api/reset");
    await runOn(api, undefined);
    assert.equal((await runsOf(api, undefined)).length, 1);
    assert.equal((await runsOf(api, "default")).length, 1);
    assert.equal(readState().runs.length, 1);
    assert.equal((await runsOf(api, "somebody-else")).length, 0);
    await api("POST", "/api/reset");
  });
});

test("two workspaces never see each other's runs, and Reset in one leaves the other untouched", async () => {
  await withServer(async (api) => {
    await api("POST", "/api/reset");
    const a = (await runOn(api, "visitor-a")).body;
    await runOn(api, "visitor-b");
    await runOn(api, "visitor-b", "decoy-array");
    await runOn(api, undefined);
    assert.deepEqual((await runsOf(api, "visitor-a")).map((r) => r.id), [a.id]);
    assert.equal((await runsOf(api, "visitor-b")).length, 2);
    assert.equal((await runsOf(api, undefined)).length, 1);

    assert.deepEqual((await api("POST", "/api/reset", { ws: "visitor-a" })).body, { ok: true });
    assert.equal((await runsOf(api, "visitor-a")).length, 0);
    assert.equal((await runsOf(api, "visitor-b")).length, 2, "visitor-b's runs survive visitor-a's Reset");
    assert.equal((await runsOf(api, undefined)).length, 1, "the default workspace survives visitor-a's Reset");

    await api("POST", "/api/reset");
    assert.equal((await runsOf(api, "visitor-b")).length, 2, "the default workspace's Reset does not clear visitor-b");
    assert.equal((await runsOf(api, undefined)).length, 0);
    await api("POST", "/api/reset", { ws: "visitor-b" });
  });
});

test("a workspace id is short and [A-Za-z0-9._-] only: anything else is a 400 in the lab's JSON error shape and records nothing", async () => {
  await withServer(async (api) => {
    await api("POST", "/api/reset");
    for (const bad of ["", " ", "a b", "a/b", "../x", "a,b", "a;b", "<script>", "é", "a".repeat(65)]) {
      for (const [method, path] of [["POST", "/api/run"], ["GET", "/api/runs"], ["POST", "/api/reset"], ["GET", "/api/catalog"], ["GET", "/api/info"]]) {
        const r = await api(method, path, { ws: bad, body: { scenario: "actsub-1-baseline" } });
        assert.equal(r.status, 400, `${method} ${path} with ${JSON.stringify(bad).slice(0, 30)}`);
        assert.equal(r.body.error, "bad_workspace");
        assert.match(r.body.message, /X-Workspace-Id/);
        assert.deepEqual(Object.keys(r.body).sort(), ["error", "message"]);
      }
    }
    assert.equal((await runsOf(api, undefined)).length, 0, "a refused run recorded nothing");
    for (const good of ["a", "A-b_c.1", "w-0123456789abcdef", "a".repeat(64), "__proto__", "constructor", "default"]) {
      const r = await runOn(api, good);
      assert.equal(r.status, 200, good);
      assert.equal((await runsOf(api, good)).length, 1, good);
    }
    // "__proto__" is an ordinary workspace name: it did not leak into any other workspace.
    assert.equal((await runsOf(api, "x")).length, 0);
    await api("POST", "/api/reset");
  });
});

test("the workspace store is bounded: the least recently used workspace is dropped past 100, and a read never creates one", async () => {
  await withServer(async (api) => {
    await runOn(api, "ws-oldest");
    for (let i = 0; i < 100; i += 1) await runOn(api, `ws-fill-${i}`);
    assert.equal((await runsOf(api, "ws-oldest")).length, 0, "the oldest workspace was dropped");
    assert.equal((await runsOf(api, "ws-fill-99")).length, 1);
    assert.equal((await runsOf(api, "ws-fill-0")).length, 1);
    for (let i = 0; i < 150; i += 1) await runsOf(api, `read-only-${i}`);
    assert.equal((await runsOf(api, "ws-fill-0")).length, 1, "reading unknown workspaces evicts nothing");
    for (let i = 0; i < 100; i += 1) await api("POST", "/api/reset", { ws: `ws-fill-${i}` });
  });
});

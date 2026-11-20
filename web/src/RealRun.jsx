import React, { useEffect, useState } from "react";
import Json from "./components/JsonPane.jsx";
import { postJson, failureText } from "./api.js";
import RunResult from "./RunResult.jsx";
import LabTrace from "./LabTrace.jsx";

// The Real run panel (rule 19 + rule 2): in Real mode the caller pastes the DECODED CLAIMS of a token they hold —
// never the token itself, the lab refuses a bearer credential outright. The lab computes the scenario's claim
// verdict over those claims and calls the live gateway's tools/list so the trace carries the wire truth.
export default function RealRun({ source, info, scenarios, activeScenario, onSelect }) {
  const [claimsText, setClaimsText] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [setup, setSetup] = useState(null);
  const real = source === "real" && info?.realAvailable !== false;

  useEffect(() => {
    if (!real) { setSetup(null); return undefined; }
    let live = true;
    fetch("/api/real-setup", { headers: { accept: "application/json" } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => live && setSetup(d))
      .catch(() => live && setSetup(null));
    return () => { live = false; };
  }, [real, source]);

  if (source !== "real") return null;

  const parse = () => {
    setError(null);
    try {
      const v = JSON.parse(claimsText);
      if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error("the pasted claims must be one JSON object (the decoded payload)");
      return v;
    } catch (e) {
      setError(`The claims are not valid: ${e.message}`);
      return null;
    }
  };

  const run = async () => {
    const claims = parse();
    if (!claims) return;
    setBusy(true);
    setResult(null);
    try {
      const res = await postJson("/api/run-real", {
        scenario: activeScenario?.id || scenarios[0]?.id,
        claims,
        ...(setup?.apps?.length ? {} : {}),
      });
      if (res.status !== 200) throw new Error(failureText(res.status, res.body));
      setResult(res.body);
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setBusy(false);
    }
  };

  const exchanges = result?.exchanges || [];

  return (
    <section className="card" data-testid="real-run" id="real">
      <h2><span className="step-num" aria-hidden="true">R</span>Real run: the live gateway, your token&apos;s claims</h2>
      <p className="hint">
        Paste the <strong>decoded payload</strong> of a real token you hold (decode it anywhere, or in the family&apos;s token
        workbench) — never the token itself; the server refuses a bearer credential. Pick the scenario whose shape and match
        mode you want to test, and the lab evaluates the claim over your real claims and calls the live gateway&apos;s
        <code> tools/list</code> for the wire trace.
      </p>
      {setup && (
        <p className="hint" data-testid="real-setup">
          Gateway: <code>{setup.gateway}</code> · doors: {setup.apps.join(", ")} · callers: {setup.callers.map((c) => c.label).join(", ")}
          {setup.version ? <> · {setup.version}</> : null}
        </p>
      )}
      <div className="flow-controls">
        <select aria-label="Scenario" data-testid="real-scenario" value={activeScenario?.id || scenarios[0]?.id || ""} onChange={(e) => onSelect(scenarios.find((s) => s.id === e.target.value))}>
          {scenarios.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
      </div>
      <textarea
        data-testid="real-claims"
        rows={8}
        placeholder='{"iss": "https://...", "sub": "...", "isMemberOf": ["MCPAccess-Atlan-Read"], ...}'
        value={claimsText}
        onChange={(e) => setClaimsText(e.target.value)}
        spellCheck={false}
      />
      <div className="flow-controls">
        <button type="button" className="primary" onClick={run} disabled={busy || !claimsText.trim()} data-testid="real-run-btn">
          {busy ? "Calling the gateway…" : "Run real"}
        </button>
        <button type="button" onClick={() => { setResult(null); setError(null); setClaimsText(""); }} disabled={busy}>Clear</button>
      </div>
      {error && <div className="error-pane" role="alert" data-testid="real-error"><span>{error}</span></div>}
      {result && (
        <div data-testid="real-result">
          <RunResult result={result} />
          <Json value={result.token?.claims} label="The claims you supplied" testId="real-claims-view" hot={["isMemberOf", "sub", "iss", "aud"]} />
        </div>
      )}
      <LabTrace exchanges={exchanges} />
    </section>
  );
}

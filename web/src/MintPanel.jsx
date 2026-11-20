import React, { useState } from "react";
import Json from "./components/JsonPane.jsx";
import { CopyButton } from "./copyButton.jsx";
import { postJson } from "./api.js";

// Mint panel (rule 4: tokens shown raw, labelled mock): the same user, both shapes, side by side.
// The server mints; this page only picks the shape and the groups and displays the result.
export default function MintPanel({ shapes, groups }) {
  const [shape, setShape] = useState("array");
  const [picked, setPicked] = useState(() => new Set());
  const [minted, setMinted] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const toggle = (g) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(g)) next.delete(g); else next.add(g);
      return next;
    });
  };

  const mint = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await postJson("/api/mint", { shape, groups: [...picked] });
      if (r.status !== 200) throw new Error((r.body && r.body.message) || `HTTP ${r.status}`);
      setMinted(r.body);
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setBusy(false);
    }
  };

  const shapeInfo = shapes.find((s) => s.id === shape);

  return (
    <section className="card" data-testid="mint-panel" id="mint">
      <h2><span className="step-num" aria-hidden="true">0</span>Mint the token: pick the shape, pick the groups</h2>
      <p className="hint">
        The same user, the same groups, two claim shapes. This is the knob the fix turns: the token mapping at PingFederate decides which
        shape <code>isMemberOf</code> takes, before any policy ever sees it.
      </p>
      <div className="flow-controls" role="radiogroup" aria-label="Claim shape">
        {shapes.map((s) => (
          <label key={s.id} className="hint">
            <input type="radio" name="claim-shape" value={s.id} checked={shape === s.id}
              onChange={() => setShape(s.id)} data-testid={`shape-${s.id}`} /> {s.label}
          </label>
        ))}
      </div>
      {shapeInfo && <p className="hint" data-testid="shape-what">{shapeInfo.what}</p>}
      <div className="group-grid" data-testid="group-grid">
        {groups.map((g) => (
          <label key={g} className={`group-chip${picked.has(g) ? " picked" : ""}`}>
            <input type="checkbox" checked={picked.has(g)} onChange={() => toggle(g)} data-testid={`group-${g}`} /> {g}
          </label>
        ))}
      </div>
      <div className="flow-controls">
        <button type="button" className="primary" onClick={mint} disabled={busy} data-testid="mint-run">Mint token</button>
        <button type="button" onClick={() => { setMinted(null); setError(null); }} disabled={busy} data-testid="mint-clear">Clear</button>
        <span className="hint">{picked.size} group(s) selected</span>
      </div>
      {error && <div className="error-pane" role="alert" data-testid="mint-error"><span>{error}</span></div>}
      {minted && (
        <div data-testid="mint-result">
          <p className="hint">
            <span className="chip basis-unmeasured">mock-issued</span> HS256 fixture key, signs nothing real.{" "}
            <CopyButton text={minted.token} label="Copy token" />
          </p>
          <Json value={minted.token} label="Mock token" testId="mint-token" />
          <Json value={minted.claims} label="Decoded claims (mock)" testId="mint-claims" hot={["isMemberOf", "sub", "aud", "iss"]} />
        </div>
      )}
    </section>
  );
}

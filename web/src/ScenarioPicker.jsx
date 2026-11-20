import React from "react";

const BASIS = { simulated: { cls: "basis-unmeasured", text: "simulated, not measured" } };

// Three cases, each a few scenarios. Every button runs one scenario against the mock door.
export default function ScenarioPicker({ cases, scenarios, active, onSelect }) {
  const button = (s) => (
    <button
      key={s.id}
      type="button"
      className="scenario-btn"
      aria-pressed={Boolean(active && active.id === s.id)}
      onClick={() => onSelect(s)}
    >
      {s.label}
    </button>
  );
  const basis = active ? BASIS.simulated : null;
  return (
    <section className="card" data-testid="scenario-picker">
      <h2>The tour: three cases</h2>
      <p className="hint">Pick a scenario in a case, then press Simulate. Every case is simulated here; nothing was measured on a tenant.</p>
      {(cases || []).map((c) => (
        <div key={c.id} className="case" data-testid={`case-${c.id}`}>
          <h3>
            {c.n}. {c.title}{" "}
            <span className="chip basis-unmeasured" data-testid={`case-basis-${c.id}`}>simulated here</span>
          </h3>
          <p>{c.summary}</p>
          <p className="hint" data-testid={`case-source-${c.id}`}>{c.source}</p>
          <p className="hint" data-testid={`case-real-${c.id}`}>{c.real}</p>
          <div className="scenario-list" data-testid={`scenarios-${c.id}`}>{scenarios.filter((s) => s.case === c.id).map(button)}</div>
        </div>
      ))}
      {active && (
        <div className="scenario-about" data-testid="scenario-about">
          <p><strong>{active.label}</strong></p>
          <p className="hint">
            Token shape: <code>{active.shape === "string" ? "delimited string" : "JSON array"}</code> · Policy match mode: <code>{active.matchMode}</code> · Asks for: <code>{active.ask}</code>.
            Expected: {active.expectNote}.
          </p>
          <p className="hint"><span className={`chip ${basis.cls}`}>{basis.text}</span></p>
        </div>
      )}
    </section>
  );
}

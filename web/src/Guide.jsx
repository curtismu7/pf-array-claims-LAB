import React from "react";

const LABEL_CLASS = { measured: "label-measured", "console text": "label-console", UNVERIFIED: "label-unverified" };

// A statement's label chip: measured, console text or UNVERIFIED, so a reader never takes a console line for a result.
export function Labelled({ item, testId }) {
  return (
    <span className="note-line" data-testid={testId}>
      <span className={`chip ${LABEL_CLASS[item.label] || ""}`} data-testid="label">{item.label}</span>
      <span>{item.text}</span>
    </span>
  );
}

// "The fix": what changes where, for first-time users. Everything here is UNVERIFIED in this lab (nothing was re-run
// on a tenant) except the shape facts, which are what JSON itself guarantees.
export function SetupGuide({ guide }) {
  if (!guide) return null;
  return (
    <section className="card" data-testid="setup-guide" id="setup">
      <h2>{guide.title}</h2>
      <p className="hint">{guide.lede}</p>
      <ol className="guide-steps">
        {guide.steps.map((s) => (
          <li key={s.n} data-testid={`guide-step-${s.n}`}>
            <strong>{s.title}</strong>
            <p>{s.what}</p>
            {s.notes.map((n) => <Labelled key={n.text} item={n} />)}
          </li>
        ))}
      </ol>
    </section>
  );
}

// The IS / IS NOT panel for the whole use case.
export function IsIsNot({ panel }) {
  if (!panel) return null;
  return (
    <section className="card" data-testid="is-is-not" id="is">
      <h2>{panel.title}</h2>
      <p className="hint">{panel.lede}</p>
      <div className="is-cols">
        <div>
          <h3>This use case IS</h3>
          <ul className="is-list" data-testid="is-list">{panel.is.map((i) => <li key={i.text}><Labelled item={i} /></li>)}</ul>
        </div>
        <div>
          <h3>This use case IS NOT</h3>
          <ul className="is-list" data-testid="is-not-list">{panel.isNot.map((i) => <li key={i.text}><Labelled item={i} /></li>)}</ul>
        </div>
      </div>
    </section>
  );
}

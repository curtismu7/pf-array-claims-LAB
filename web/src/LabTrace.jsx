import React from "react";
import GatewayTrace from "./gateway-trace/GatewayTrace";

// The family's trace panel (vendored, byte-pinned) with this lab's honest labels. The panel's own title and
// basisNote props carry the truth for whichever mode produced the exchange: a mock trace says the mock door
// computed it; a real trace says the live gateway answered and the decisions are read from the outcome.
export const TRACE_TITLE = "What the policy door did (mode: mock — simulated)";
export const TRACE_TITLE_REAL = "What the real gateway did (live call)";
export const TRACE_BASIS =
  "Simulated: this lab's in-process mock policy door computed every request, reply and decision below. It is not Privilege and not a Cedar engine.";
export const TRACE_BASIS_REAL =
  "Live: one real call to the gateway shown in the request below. The gateway reports no per-check detail, so each decision is read from the status or the response (marked inferred/observed, never checked). The claim verdict beside it is still this lab's own computation over the pasted claims.";

// Only the refusal is an alert here, so the panel is told to mark `error` alone.
export const TRACE_HOT = ["error"];

export default function LabTrace({ exchanges }) {
  const none = !exchanges || exchanges.length === 0;
  const real = exchanges && exchanges.some((e) => e.trace?.source === "real");
  const title = real ? TRACE_TITLE_REAL : TRACE_TITLE;
  const basis = real ? TRACE_BASIS_REAL : TRACE_BASIS;
  return (
    <div className="lab-trace">
      {none ? (
        <section className="gw-trace" data-testid="gateway-trace" aria-label={title}>
          <h2>{title}</h2>
          <p className="gw-muted" data-testid="gateway-trace-basis">{basis}</p>
          <p className="gw-muted" data-testid="gateway-trace-empty">
            Pick a scenario above: each request, each response and each decision appears here.
          </p>
        </section>
      ) : (
        <GatewayTrace source={real ? "real" : "mock"} title={title} basisNote={basis} hot={TRACE_HOT} exchanges={exchanges} />
      )}
    </div>
  );
}

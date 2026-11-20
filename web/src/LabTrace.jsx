import React from "react";
import GatewayTrace from "./gateway-trace/GatewayTrace";

// The family's trace panel (vendored, byte-pinned) with this lab's honest labels. Its defaults say "What Privilege did" and "Real mode shows
// the actual gateway", which would be wrong over a mock whose Real mode is not in the page, so the panel's own title and basisNote props carry
// the truth. Its fixed lead sentence ("... sent to the Privilege gateway ...") cannot be changed without editing the pinned file; app.css
// hides it inside .lab-trace, and the basis note below says what the panel is.
export const TRACE_TITLE = "What the mock policy door did (simulated)";
export const TRACE_BASIS =
  "Simulated: this lab's in-process mock policy door computed every request, reply and decision below. It is not Privilege and not a Cedar engine. " +
  "Real is not available in this lab; reproducing the shapes on a real PingFederate is a token-mapping change in the customer's own tenant.";

// Only the refusal is an alert here, so the panel is told to mark `error` alone.
export const TRACE_HOT = ["error"];

export default function LabTrace({ exchanges }) {
  const none = !exchanges || exchanges.length === 0;
  return (
    <div className="lab-trace">
      {none ? (
        <section className="gw-trace" data-testid="gateway-trace" aria-label={TRACE_TITLE}>
          <h2>{TRACE_TITLE}</h2>
          <p className="gw-muted" data-testid="gateway-trace-basis">{TRACE_BASIS}</p>
          <p className="gw-muted" data-testid="gateway-trace-empty">
            Pick a scenario above: each request, each response and each decision appears here.
          </p>
        </section>
      ) : (
        <GatewayTrace source="mock" title={TRACE_TITLE} basisNote={TRACE_BASIS} hot={TRACE_HOT} exchanges={exchanges} />
      )}
    </div>
  );
}

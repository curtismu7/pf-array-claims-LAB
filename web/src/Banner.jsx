import React from "react";

// Simulation banner: required first on every page (rule 2), also in presenter mode.
export default function SimulationBanner({ source }) {
  return (
    <div className="banner" role="note" data-testid="sim-banner">
      <strong>Simulation</strong> — the mock runs on this page are simulated: a mock PingFederate token mint and a mock policy door run in-process
      (mode: {source || "mock"}). The door is an evaluator of TWO claim-reading modes (exact array membership, substring search) over example group
      names; it is not Privilege, not a Cedar engine, and it decides nothing real. In Real mode the one live element is the gateway's tools/list
      (the wire trace); the claim verdict is still this lab's computation over the claims you paste. Nothing leaves this machine except that one call.
    </div>
  );
}

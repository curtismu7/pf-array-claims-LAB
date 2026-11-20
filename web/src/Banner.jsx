import React from "react";

// Simulation banner: required first on every page (rule 2), also in presenter mode.
export default function SimulationBanner({ source }) {
  return (
    <div className="banner" role="note" data-testid="sim-banner">
      <strong>Simulation</strong> — the runs on this page are simulated. A mock PingFederate token mint and a mock policy door run in-process
      (mode: {source || "mock"}). The door is an evaluator of TWO claim-reading modes (exact array membership, substring search) over example group
      names; it is not Privilege, not a Cedar engine, and it decides nothing real. Nothing leaves this machine.
    </div>
  );
}

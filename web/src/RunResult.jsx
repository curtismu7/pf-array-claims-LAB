import React from "react";
import Json from "./components/JsonPane.jsx";
import { CopyButton } from "./copyButton.jsx";

const VERDICT_LABEL = { allowed: "ALLOWED", refused: "REFUSED" };

export default function RunResult({ result }) {
  if (!result) return null;
  return (
    <div className="run-result" data-testid="run-result">
      <h3>{result.label} <span className="chip">simulated run</span></h3>
      <div className="call-list" data-testid="call-list">
        <div className={`call ${result.verdict}`} data-testid={`call-0`}>
          <strong>Policy door</strong> <span className="hint">tools/list</span>{" "}
          <span className={`chip verdict-${result.verdict}`} data-testid="verdict-0">{VERDICT_LABEL[result.verdict] || result.verdict.toUpperCase()}</span>{" "}
          <span className="hint">HTTP {result.http}</span>
          <p className="run-reason" data-testid="reason-0">{result.outcome.reason}</p>
          {result.outcome.exact === false && result.verdict === "allowed" && (
            <p className="run-reason warn" data-testid="overgrant-warning">
              Over-grant: this grant came from text search, not exact membership. A group name the token never held can match the same way.
            </p>
          )}
        </div>
      </div>
      {result.token && (
        <details open>
          <summary>Mock token and its claims</summary>
          <p className="hint" data-testid="mock-token-label">
            <span className="chip basis-unmeasured">mock-issued</span> Issued by this lab&apos;s in-process PingFederate stand-in (HS256 fixture
            key); it signs nothing real. <CopyButton text={result.token.token} />
          </p>
          <Json value={result.token.token} label="Mock token" testId="mock-token" />
          <Json value={result.token.claims} label="Token claims (mock)" testId="token-claims" hot={["isMemberOf", "sub", "aud", "iss", "mock"]} />
        </details>
      )}
      {result.traceparent && (
        <p className="hint" data-testid="run-traceparent">W3C traceparent of this run: <code>{result.traceparent}</code> (the page sent one; the server continued its trace)</p>
      )}
    </div>
  );
}

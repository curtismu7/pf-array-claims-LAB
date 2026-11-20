import React, { useState } from "react";

// The copy button, shared by MintPanel and RunResult. (Extracted from RunResult so both import one copy.)
export function CopyButton({ text, label = "Copy" }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setDone(true);
      setTimeout(() => setDone(false), 1500);
    } catch { /* no clipboard: the text is selectable */ }
  };
  return <button type="button" className="copy-btn" onClick={copy}>{done ? "Copied" : label}</button>;
}

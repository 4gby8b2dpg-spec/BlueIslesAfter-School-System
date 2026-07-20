"use client";

import { useState } from "react";

// Read-only URL with a copy button — used for calendar feed links, which are
// meant to be pasted into Google/Outlook/Apple Calendar rather than clicked.
export function CopyField({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // clipboard blocked (insecure context / permissions) — the field is
      // still selectable, so the user can copy manually.
    }
  }

  return (
    <div className="copy-field">
      <input readOnly value={value} aria-label={label ?? "Feed URL"} onFocus={(e) => e.target.select()} />
      <button type="button" className="mini-btn" onClick={copy}>
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

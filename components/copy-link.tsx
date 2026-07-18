"use client";

import { useState } from "react";

export function CopyLink({ path }: { path: string }) {
  // origin is only known on the client; fall back to the bare path during SSR.
  const url = typeof window === "undefined" ? path : `${window.location.origin}${path}`;
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <div className="copy-link">
      <input readOnly value={url} suppressHydrationWarning onFocus={(e) => e.currentTarget.select()} />
      <button type="button" className="btn-primary" onClick={copy}>
        {copied ? "Copied ✓" : "Copy"}
      </button>
    </div>
  );
}

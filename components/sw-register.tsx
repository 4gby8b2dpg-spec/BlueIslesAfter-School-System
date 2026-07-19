"use client";

import { useEffect } from "react";

// Registers the kiosk service worker so the page can open offline from a cold
// start. Mounted on the kiosk route; once registered the SW controls the origin.
export function SwRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // registration failing (e.g. unsupported context) is non-fatal — the
      // in-page localStorage queue still handles reconnects while open.
    });
  }, []);
  return null;
}

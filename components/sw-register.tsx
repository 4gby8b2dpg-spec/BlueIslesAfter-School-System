"use client";

import { useEffect } from "react";

// Registers the kiosk service worker so the page can open offline from a cold
// start. Mounted on the kiosk route; once registered the SW controls the origin.
export function SwRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    void (async () => {
      try {
        // Earlier releases registered this worker for the whole origin. Remove
        // that broad registration before installing the kiosk-only scope.
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(
          registrations
            .filter((registration) => new URL(registration.scope).pathname === "/")
            .map((registration) => registration.unregister()),
        );
        await navigator.serviceWorker.register("/sw.js", { scope: "/kiosk/" });
      } catch {
        // The in-page localStorage queue still handles reconnects while open.
      }
    })();
  }, []);
  return null;
}

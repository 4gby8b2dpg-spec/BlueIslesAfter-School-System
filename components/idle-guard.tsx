"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

// Signs the person out after an hour with no clicks, typing, or scrolling.
// The server also checks this on every app page (lib/supabase/middleware.ts),
// so a tab left open and then reloaded is caught too.
const IDLE_MS = 60 * 60 * 1000;
const WARN_MS = 55 * 60 * 1000;
const CHECK_MS = 15 * 1000;
const EVENTS = ["mousedown", "keydown", "scroll", "touchstart"] as const;

export function IdleGuard() {
  const lastActive = useRef(0);
  const [warning, setWarning] = useState(false);

  useEffect(() => {
    lastActive.current = Date.now();
    const onActivity = () => {
      lastActive.current = Date.now();
      setWarning(false);
    };
    EVENTS.forEach((ev) => window.addEventListener(ev, onActivity, { passive: true }));

    const timer = window.setInterval(async () => {
      const idle = Date.now() - lastActive.current;
      if (idle >= IDLE_MS) {
        window.clearInterval(timer);
        await createClient().auth.signOut({ scope: "local" });
        window.location.replace("/login?reason=idle");
        return;
      }
      setWarning(idle >= WARN_MS);
    }, CHECK_MS);

    return () => {
      window.clearInterval(timer);
      EVENTS.forEach((ev) => window.removeEventListener(ev, onActivity));
    };
  }, []);

  if (!warning) return null;
  return (
    <div
      role="alert"
      style={{
        position: "fixed",
        bottom: 16,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 1000,
        background: "#fff7ed",
        border: "1px solid #f6b25a",
        borderRadius: 12,
        padding: "12px 16px",
        display: "flex",
        gap: 12,
        alignItems: "center",
        boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
        maxWidth: "calc(100vw - 32px)",
        fontSize: 14,
      }}
    >
      <span>You&rsquo;ll be signed out in a few minutes due to inactivity.</span>
      <button
        type="button"
        onClick={() => {
          lastActive.current = Date.now();
          setWarning(false);
        }}
        style={{ font: "inherit", fontWeight: 600, padding: "6px 12px", borderRadius: 999, border: "1px solid #dfe7e5", background: "#fff", cursor: "pointer" }}
      >
        Stay signed in
      </button>
    </div>
  );
}

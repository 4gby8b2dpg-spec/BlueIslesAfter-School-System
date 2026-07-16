"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import "./login.css";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
      setBusy(false);
      return;
    }
    // Honor ?next=… if present (set by the middleware redirect), else dashboard.
    const next =
      new URLSearchParams(window.location.search).get("next") || "/dashboard";
    // Full navigation so the server re-reads the fresh auth cookie.
    router.push(next);
    router.refresh();
  }

  return (
    <main className="login-wrap">
      <form className="login-card" onSubmit={onSubmit}>
        <div className="login-brand">
          <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden="true">
            <path
              d="M16 3c-1.4 3.6-4 6-7.6 7.4C12 11.8 14.6 14.4 16 18c1.4-3.6 4-6.2 7.6-7.6C20 9 17.4 6.6 16 3Z"
              fill="#0D9488"
            />
            <circle cx="24" cy="22" r="3" fill="#D97706" />
          </svg>
          BlueIsles
        </div>
        <h1>Sign in</h1>
        <p className="login-sub">Welcome back. Enter your details to continue.</p>

        <label className="login-field">
          <span>Email</span>
          <input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@organization.org"
          />
        </label>

        <label className="login-field">
          <span>Password</span>
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
        </label>

        {error && (
          <p className="login-error" role="alert">
            {error}
          </p>
        )}

        <button className="login-btn" type="submit" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>

        <p className="login-note">
          Accounts are created by your organization&rsquo;s admin. Contact them if
          you need access.
        </p>
      </form>
    </main>
  );
}

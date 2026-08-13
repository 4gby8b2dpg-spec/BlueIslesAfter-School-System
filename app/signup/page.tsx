"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import "../login/login.css";

export default function SignupPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [checkEmail, setCheckEmail] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const supabase = createClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) {
      setError(error.message);
      setBusy(false);
      return;
    }
    if (!data.session) {
      // Email confirmation is required by this project — no session yet.
      setCheckEmail(true);
      setBusy(false);
      return;
    }
    // Full navigation so the server re-reads the fresh auth cookie.
    router.push("/no-org");
    router.refresh();
  }

  if (checkEmail) {
    return (
      <main className="login-wrap">
        <div className="login-card">
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
          <h1>Check your email</h1>
          <p className="login-sub">
            We sent a confirmation link to <strong>{email}</strong>. Click it to finish
            creating your account, then come back here to sign in.
          </p>
          <Link href="/login" className="login-btn" style={{ textAlign: "center", textDecoration: "none" }}>
            Back to sign in
          </Link>
        </div>
      </main>
    );
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
        <h1>Create your organization</h1>
        <p className="login-sub">
          Start with your own account — you&rsquo;ll name your organization on the next step.
        </p>

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
            autoComplete="new-password"
            required
            minLength={6}
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
          {busy ? "Creating account…" : "Continue"}
        </button>

        <p className="login-note">
          Already have an account? <Link href="/login">Sign in</Link>
        </p>
      </form>
    </main>
  );
}

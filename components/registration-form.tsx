"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export type RegProgram = {
  id: string;
  name: string;
  category: string | null;
  grade_min: string | null;
  grade_max: string | null;
};

function gradeRange(p: RegProgram) {
  if (p.grade_min && p.grade_max) return ` (Gr ${p.grade_min}–${p.grade_max})`;
  if (p.grade_min) return ` (Gr ${p.grade_min}+)`;
  return "";
}

export function RegistrationForm({
  token,
  programs,
}: {
  token: string;
  programs: RegProgram[];
}) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);

    // Honeypot — real people leave this hidden field empty. Bots fill it.
    if (String(fd.get("website") ?? "").trim() !== "") {
      setDone(true); // silently accept-and-drop
      return;
    }

    const payload = {
      child_first: String(fd.get("child_first") ?? "").trim(),
      child_last: String(fd.get("child_last") ?? "").trim(),
      child_dob: String(fd.get("child_dob") ?? ""),
      child_grade: String(fd.get("child_grade") ?? "").trim(),
      child_school: String(fd.get("child_school") ?? "").trim(),
      guardian_first: String(fd.get("guardian_first") ?? "").trim(),
      guardian_last: String(fd.get("guardian_last") ?? "").trim(),
      guardian_phone: String(fd.get("guardian_phone") ?? "").trim(),
      guardian_email: String(fd.get("guardian_email") ?? "").trim(),
      guardian_relationship: String(fd.get("guardian_relationship") ?? "").trim(),
      program_id: String(fd.get("program_id") ?? ""),
      photo_consent: fd.get("photo_consent") === "on",
      note: String(fd.get("note") ?? "").trim(),
    };

    if (!payload.child_first || !payload.child_last) {
      setError("Please enter your child's first and last name.");
      return;
    }
    if (!payload.guardian_last || !payload.guardian_phone) {
      setError("Please enter a parent/guardian name and phone number.");
      return;
    }

    setBusy(true);
    const supabase = createClient();
    const { data, error: rpcErr } = await supabase.rpc("submit_registration", {
      p_token: token,
      p_payload: payload,
    });
    setBusy(false);

    const res = data as { ok: boolean; error?: string } | null;
    if (rpcErr || !res?.ok) {
      setError(res?.error ?? "Could not submit right now. Please try again.");
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <div className="rg-done">
        <div className="rg-check" aria-hidden="true">
          ✓
        </div>
        <h2>Request received</h2>
        <p>Thanks! Our team will review your registration and be in touch to confirm a place.</p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="rg-form">
      <fieldset className="rg-fieldset">
        <legend>Child</legend>
        <div className="rg-grid">
          <label className="rg-field">
            <span>First name *</span>
            <input name="child_first" required autoComplete="off" />
          </label>
          <label className="rg-field">
            <span>Last name *</span>
            <input name="child_last" required autoComplete="off" />
          </label>
          <label className="rg-field">
            <span>Date of birth</span>
            <input name="child_dob" type="date" />
          </label>
          <label className="rg-field">
            <span>Grade</span>
            <input name="child_grade" placeholder="e.g. 4" />
          </label>
          <label className="rg-field rg-wide">
            <span>School</span>
            <input name="child_school" />
          </label>
        </div>
      </fieldset>

      <fieldset className="rg-fieldset">
        <legend>Parent / guardian</legend>
        <div className="rg-grid">
          <label className="rg-field">
            <span>First name</span>
            <input name="guardian_first" />
          </label>
          <label className="rg-field">
            <span>Last name *</span>
            <input name="guardian_last" required />
          </label>
          <label className="rg-field">
            <span>Phone *</span>
            <input name="guardian_phone" type="tel" required />
          </label>
          <label className="rg-field">
            <span>Email</span>
            <input name="guardian_email" type="email" />
          </label>
          <label className="rg-field">
            <span>Relationship to child</span>
            <input name="guardian_relationship" placeholder="e.g. Mother, Father, Guardian" />
          </label>
        </div>
      </fieldset>

      <fieldset className="rg-fieldset">
        <legend>Program</legend>
        {programs.length === 0 ? (
          <p className="rg-note">
            There are no programs open for registration right now. Please check back later.
          </p>
        ) : (
          <label className="rg-field rg-wide">
            <span>Choose a program *</span>
            <select name="program_id" required defaultValue="">
              <option value="" disabled>
                Select a program…
              </option>
              {programs.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {gradeRange(p)}
                  {p.category ? ` — ${p.category}` : ""}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="rg-field rg-wide">
          <span>Anything we should know? (optional)</span>
          <textarea name="note" rows={3} />
        </label>
        <label className="rg-check-row">
          <input name="photo_consent" type="checkbox" />
          <span>I consent to my child being photographed for program activities.</span>
        </label>
      </fieldset>

      {/* honeypot: visually hidden, off-screen, not announced */}
      <div className="rg-hp" aria-hidden="true">
        <label>
          Website
          <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      {error && (
        <p className="rg-error" role="alert">
          {error}
        </p>
      )}
      <button className="rg-submit" type="submit" disabled={busy || programs.length === 0}>
        {busy ? "Submitting…" : "Submit registration"}
      </button>
    </form>
  );
}

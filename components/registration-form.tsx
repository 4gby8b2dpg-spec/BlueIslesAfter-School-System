"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export type RegProgram = {
  id: string;
  name: string;
  category: string | null;
  grade_min: string | null;
  grade_max: string | null;
  site: string | null;
  // ISO weekday numbers (1=Mon..7=Sun) the program meets on, derived from its
  // scheduled upcoming sessions. Empty/missing = schedule not populated yet.
  days?: number[];
  start_time?: string | null;
  end_time?: string | null;
};

function gradeRange(p: RegProgram) {
  if (p.grade_min && p.grade_max) return `Gr ${p.grade_min}–${p.grade_max}`;
  if (p.grade_min) return `Gr ${p.grade_min}+`;
  return "";
}

function timeRange(p: RegProgram) {
  if (p.start_time && p.end_time) return `${p.start_time}–${p.end_time}`;
  return "";
}

const DAY_NAMES: Record<number, string> = {
  1: "Monday",
  2: "Tuesday",
  3: "Wednesday",
  4: "Thursday",
  5: "Friday",
  6: "Saturday",
  7: "Sunday",
};

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

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

  // Date of birth as three dropdowns — a native date input makes parents
  // spin back through decades to reach the birth year.
  const [dobDay, setDobDay] = useState("");
  const [dobMonth, setDobMonth] = useState("");
  const [dobYear, setDobYear] = useState("");
  const thisYear = new Date().getFullYear();
  const years = Array.from({ length: 25 }, (_, i) => thisYear - i);

  const [selected, setSelected] = useState<string[]>([]);

  const scheduled = useMemo(() => programs.filter((p) => (p.days?.length ?? 0) > 0), [programs]);
  const unscheduled = useMemo(() => programs.filter((p) => !(p.days?.length ?? 0)), [programs]);
  const visibleDays = useMemo(
    () => [1, 2, 3, 4, 5, 6, 7].filter((d) => scheduled.some((p) => p.days?.includes(d))),
    [scheduled],
  );
  const multiSite = useMemo(
    () => new Set(programs.map((p) => p.site).filter(Boolean)).size > 1,
    [programs],
  );

  // Which selected program owns each weekday — the one-per-day rule.
  const dayOwner = useMemo(() => {
    const owner = new Map<number, string>();
    for (const id of selected) {
      const p = scheduled.find((x) => x.id === id);
      for (const d of p?.days ?? []) owner.set(d, id);
    }
    return owner;
  }, [selected, scheduled]);

  const isBlocked = (p: RegProgram) =>
    !selected.includes(p.id) &&
    (p.days ?? []).some((d) => dayOwner.has(d) && dayOwner.get(d) !== p.id);

  function toggle(id: string) {
    setError(null);
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);

    // Honeypot — real people leave this hidden field empty. Bots fill it.
    if (String(fd.get("website") ?? "").trim() !== "") {
      setDone(true); // silently accept-and-drop
      return;
    }

    let childDob = "";
    if (dobDay || dobMonth || dobYear) {
      if (!dobDay || !dobMonth || !dobYear) {
        setError("Please complete all three date-of-birth fields, or leave them all empty.");
        return;
      }
      childDob = `${dobYear}-${dobMonth.padStart(2, "0")}-${dobDay.padStart(2, "0")}`;
      const parsed = new Date(`${childDob}T00:00:00`);
      if (parsed.getMonth() + 1 !== Number(dobMonth) || parsed.getDate() !== Number(dobDay)) {
        setError("That date of birth doesn't exist — please check the day and month.");
        return;
      }
    }

    const payload = {
      child_first: String(fd.get("child_first") ?? "").trim(),
      child_last: String(fd.get("child_last") ?? "").trim(),
      child_dob: childDob,
      child_grade: String(fd.get("child_grade") ?? "").trim(),
      child_school: String(fd.get("child_school") ?? "").trim(),
      guardian_first: String(fd.get("guardian_first") ?? "").trim(),
      guardian_last: String(fd.get("guardian_last") ?? "").trim(),
      guardian_phone: String(fd.get("guardian_phone") ?? "").trim(),
      guardian_email: String(fd.get("guardian_email") ?? "").trim(),
      guardian_relationship: String(fd.get("guardian_relationship") ?? "").trim(),
      program_ids: selected,
      // legacy single field so a not-yet-migrated backend still accepts the form
      program_id: selected[0] ?? "",
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
    if (selected.length === 0) {
      setError("Please choose at least one program.");
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

  const programChip = (p: RegProgram) => {
    const sel = selected.includes(p.id);
    const blocked = isBlocked(p);
    const meta = [timeRange(p), gradeRange(p), multiSite ? p.site : null]
      .filter(Boolean)
      .join(" · ");
    return (
      <button
        key={p.id}
        type="button"
        className={`rg-prog${sel ? " is-sel" : ""}`}
        aria-pressed={sel}
        disabled={blocked}
        title={blocked ? "Another selected program already meets that day" : undefined}
        onClick={() => toggle(p.id)}
      >
        <span className="rg-prog-name">{p.name}</span>
        {meta && <span className="rg-prog-meta">{meta}</span>}
      </button>
    );
  };

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
          <div className="rg-field rg-wide">
            <span id="rg-dob-label">Date of birth</span>
            <div className="rg-dob" role="group" aria-labelledby="rg-dob-label">
              <select
                aria-label="Day"
                value={dobDay}
                onChange={(e) => setDobDay(e.target.value)}
              >
                <option value="">Day</option>
                {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
              <select
                aria-label="Month"
                value={dobMonth}
                onChange={(e) => setDobMonth(e.target.value)}
              >
                <option value="">Month</option>
                {MONTHS.map((m, i) => (
                  <option key={m} value={i + 1}>
                    {m}
                  </option>
                ))}
              </select>
              <select
                aria-label="Year"
                value={dobYear}
                onChange={(e) => setDobYear(e.target.value)}
              >
                <option value="">Year</option>
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <label className="rg-field">
            <span>Grade</span>
            <input name="child_grade" placeholder="e.g. 4" />
          </label>
          <label className="rg-field">
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
        <legend>Programs</legend>
        {programs.length === 0 ? (
          <p className="rg-note">
            There are no programs open for registration right now. Please check back later.
          </p>
        ) : (
          <>
            {scheduled.length > 0 && (
              <>
                <p className="rg-note">
                  Pick your child&apos;s week — <strong>one program per day</strong>. A program
                  that meets on several days fills all of them.
                </p>
                <div className="rg-tt" role="group" aria-label="Weekly program timetable">
                  {visibleDays.map((d) => (
                    <div className="rg-tt-day" key={d}>
                      <div className="rg-tt-dayname">{DAY_NAMES[d]}</div>
                      {scheduled.filter((p) => p.days?.includes(d)).map(programChip)}
                    </div>
                  ))}
                </div>
              </>
            )}
            {unscheduled.length > 0 && (
              <div className="rg-tba">
                {scheduled.length > 0 && (
                  <p className="rg-note">These programs haven&apos;t published a weekly day yet:</p>
                )}
                <div className="rg-tba-list">{unscheduled.map(programChip)}</div>
              </div>
            )}
            <p className="rg-selected" aria-live="polite">
              {selected.length === 0
                ? "No programs selected yet."
                : `Selected: ${selected
                    .map((id) => programs.find((p) => p.id === id)?.name)
                    .filter(Boolean)
                    .join(", ")}`}
            </p>
          </>
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

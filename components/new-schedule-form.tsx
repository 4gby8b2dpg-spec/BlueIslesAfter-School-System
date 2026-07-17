"use client";

import { useActionState, useState } from "react";
import { createRecurringSchedule } from "@/app/(app)/timetable/actions";

const DAYS = [
  { v: 1, label: "Mon" },
  { v: 2, label: "Tue" },
  { v: 3, label: "Wed" },
  { v: 4, label: "Thu" },
  { v: 5, label: "Fri" },
];

function iso(d: Date) {
  return d.toISOString().slice(0, 10);
}

export function NewScheduleForm({
  programs,
  sites,
}: {
  programs: { id: string; name: string; siteId: string | null }[];
  sites: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [site, setSite] = useState("");
  const [state, formAction, pending] = useActionState(createRecurringSchedule, null);

  const shownPrograms = site ? programs.filter((p) => p.siteId === site) : programs;

  const today = iso(new Date());
  const inTenWeeks = iso(new Date(Date.now() + 70 * 86_400_000));

  if (!open) {
    return (
      <div className="tt-add-wrap">
        <button type="button" className="form-trigger" onClick={() => setOpen(true)}>
          + Schedule a program
        </button>
        {state?.ok && (
          <span className="tt-saved">✓ Created {state.created} sessions.</span>
        )}
      </div>
    );
  }

  return (
    <form action={formAction} className="tt-form">
      <div className="tt-form-row">
        <label className="tt-field">
          <span>Site</span>
          <select value={site} onChange={(e) => setSite(e.target.value)} aria-label="Filter programs by site">
            <option value="">All sites</option>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="tt-field">
          <span>Program</span>
          <select name="programId" required defaultValue="" key={site}>
            <option value="" disabled>
              {shownPrograms.length ? "Choose…" : "No programs at this site"}
            </option>
            {shownPrograms.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <fieldset className="tt-days">
          <legend>Days</legend>
          {DAYS.map((d) => (
            <label key={d.v} className="tt-day">
              <input type="checkbox" name="weekdays" value={d.v} />
              {d.label}
            </label>
          ))}
        </fieldset>
      </div>

      <div className="tt-form-row">
        <label className="tt-field">
          <span>Start</span>
          <input type="time" name="startTime" defaultValue="15:30" required />
        </label>
        <label className="tt-field">
          <span>Minutes</span>
          <input type="number" name="durationMin" min="15" step="15" defaultValue="90" />
        </label>
        <label className="tt-field">
          <span>Room</span>
          <input name="room" placeholder="Rm 104" />
        </label>
        <label className="tt-field">
          <span>From</span>
          <input type="date" name="fromDate" defaultValue={today} required />
        </label>
        <label className="tt-field">
          <span>Until</span>
          <input type="date" name="toDate" defaultValue={inTenWeeks} required />
        </label>
      </div>

      {state?.error && (
        <p className="tt-error" role="alert">
          {state.error}
        </p>
      )}

      <div className="tt-form-actions">
        <button className="btn-primary" type="submit" disabled={pending}>
          {pending ? "Generating…" : "Generate sessions"}
        </button>
        <button className="btn-ghost" type="button" onClick={() => setOpen(false)}>
          Close
        </button>
      </div>
    </form>
  );
}

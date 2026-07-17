"use client";

import { useMemo, useState } from "react";
import { saveAttendance, type AttendanceMark } from "@/app/(app)/attendance/actions";

type Status = "present" | "absent" | "excused" | "late";
const STATUSES: { key: Status; label: string; short: string }[] = [
  { key: "present", label: "Present", short: "P" },
  { key: "absent", label: "Absent", short: "A" },
  { key: "excused", label: "Excused", short: "E" },
  { key: "late", label: "Late", short: "L" },
];

export function CheckInRoster({
  sessionId,
  roster,
  initial,
}: {
  sessionId: string;
  roster: { id: string; name: string; grade: string }[];
  initial: Record<string, string>;
}) {
  const [marks, setMarks] = useState<Record<string, Status>>(
    () => ({ ...(initial as Record<string, Status>) }),
  );
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function set(id: string, status: Status) {
    setSavedMsg(null);
    setMarks((m) => ({ ...m, [id]: status }));
  }
  function markAllPresent() {
    setSavedMsg(null);
    setMarks(Object.fromEntries(roster.map((r) => [r.id, "present" as Status])));
  }

  const counts = useMemo(() => {
    const c = { present: 0, absent: 0, excused: 0, late: 0, unmarked: 0 };
    for (const r of roster) {
      const s = marks[r.id];
      if (s) c[s]++;
      else c.unmarked++;
    }
    return c;
  }, [marks, roster]);

  async function onSave() {
    setSaving(true);
    setError(null);
    const records: AttendanceMark[] = roster
      .filter((r) => marks[r.id])
      .map((r) => ({ participantId: r.id, status: marks[r.id] }));
    const res = await saveAttendance({ sessionId, records });
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setSavedMsg(`Saved ${res.saved} record${res.saved === 1 ? "" : "s"}.`);
  }

  return (
    <>
      <div className="checkin-toolbar">
        <button className="btn-ghost" onClick={markAllPresent} type="button">
          Mark all present
        </button>
        {savedMsg && <span className="checkin-saved">✓ {savedMsg}</span>}
        {error && (
          <span className="checkin-error" role="alert">
            {error}
          </span>
        )}
      </div>

      <ul className="roster-checkin">
        {roster.map((r) => (
          <li key={r.id} className="checkin-row">
            <span className="checkin-who">
              <span className="checkin-name">{r.name}</span>
              <span className="checkin-grade">Gr {r.grade}</span>
            </span>
            <span className="checkin-btns" role="group" aria-label={`Attendance for ${r.name}`}>
              {STATUSES.map((s) => {
                const active = marks[r.id] === s.key;
                return (
                  <button
                    key={s.key}
                    type="button"
                    className={active ? `ci-btn ${s.key} active` : "ci-btn"}
                    aria-pressed={active}
                    title={s.label}
                    onClick={() => set(r.id, s.key)}
                  >
                    <span className="ci-full">{s.label}</span>
                    <span className="ci-short">{s.short}</span>
                  </button>
                );
              })}
            </span>
          </li>
        ))}
      </ul>

      <div className="checkin-footer">
        <span className="checkin-summary num">
          {counts.present} present · {counts.absent} absent · {counts.excused} excused ·{" "}
          {counts.late} late · {counts.unmarked} unmarked
        </span>
        <button className="btn-primary" onClick={onSave} disabled={saving} type="button">
          {saving ? "Saving…" : "Save attendance"}
        </button>
      </div>
    </>
  );
}

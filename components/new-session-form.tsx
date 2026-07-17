"use client";

import { useState } from "react";
import { createSession } from "@/app/(app)/programs/actions";

export function NewSessionForm({
  programId,
  todayStr,
}: {
  programId: string;
  todayStr: string;
}) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button type="button" className="form-trigger" onClick={() => setOpen(true)}>
        + Add session
      </button>
    );
  }

  return (
    <form action={createSession} className="ns-form">
      <input type="hidden" name="programId" value={programId} />
      <label>
        <span>Date</span>
        <input name="date" type="date" defaultValue={todayStr} required />
      </label>
      <label>
        <span>Start</span>
        <input name="startTime" type="time" defaultValue="15:30" required />
      </label>
      <label>
        <span>Minutes</span>
        <input name="durationMin" type="number" min="15" step="15" defaultValue="90" />
      </label>
      <label>
        <span>Room</span>
        <input name="room" placeholder="Rm 104" />
      </label>
      <button className="btn-primary" type="submit">
        Add
      </button>
      <button className="btn-ghost" type="button" onClick={() => setOpen(false)}>
        Cancel
      </button>
    </form>
  );
}

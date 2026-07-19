"use client";

import { useState } from "react";

type P = { id: string; name: string };

export function AddParticipantForm({
  action,
  programId,
  participants,
  full,
}: {
  action: (fd: FormData) => void;
  programId: string;
  participants: P[];
  full: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  if (!open) {
    return (
      <button type="button" className="form-trigger" onClick={() => setOpen(true)}>
        + Add participant
      </button>
    );
  }

  const q = query.trim().toLowerCase();
  const filtered = (q ? participants.filter((p) => p.name.toLowerCase().includes(q)) : participants).slice(
    0,
    8,
  );

  return (
    <div className="ap-panel">
      <input
        className="ap-search"
        placeholder="Search participants…"
        value={query}
        autoFocus
        onChange={(e) => setQuery(e.target.value)}
      />
      {filtered.length === 0 ? (
        <p className="empty">No matching participants.</p>
      ) : (
        <ul className="ap-results">
          {filtered.map((p) => (
            <li key={p.id}>
              <form action={action}>
                <input type="hidden" name="programId" value={programId} />
                <input type="hidden" name="participantId" value={p.id} />
                <button type="submit" className="ap-result">
                  <span>{p.name}</span>
                  <span className="ap-add">{full ? "Waitlist" : "Add"}</span>
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
      {full && <p className="roster-add-note">At capacity — additions join the waitlist.</p>}
      <button type="button" className="btn-ghost ap-cancel" onClick={() => setOpen(false)}>
        Cancel
      </button>
    </div>
  );
}

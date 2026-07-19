"use client";

import { useState } from "react";

export function EditCapacityForm({
  action,
  programId,
  capacity,
}: {
  action: (fd: FormData) => void;
  programId: string;
  capacity: number; // 0 = no cap set
}) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button type="button" className="cap-edit-link" onClick={() => setOpen(true)}>
        {capacity > 0 ? "Edit capacity" : "Set capacity"}
      </button>
    );
  }

  return (
    <form action={action} className="cap-edit-form">
      <input type="hidden" name="programId" value={programId} />
      <input
        type="number"
        name="capacity"
        min={0}
        defaultValue={capacity > 0 ? capacity : ""}
        placeholder="none"
        autoFocus
        aria-label="Program capacity"
      />
      <button type="submit" className="cap-save">
        Save
      </button>
      <button type="button" className="cap-cancel" onClick={() => setOpen(false)}>
        Cancel
      </button>
    </form>
  );
}

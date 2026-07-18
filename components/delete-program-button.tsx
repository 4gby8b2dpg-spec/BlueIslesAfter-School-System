"use client";

import { useState } from "react";
import { deleteProgram } from "@/app/(app)/programs/actions";

export function DeleteProgramButton({
  programId,
  programName,
  sessions,
  enrolled,
}: {
  programId: string;
  programName: string;
  sessions: number;
  enrolled: number;
}) {
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <button className="link-btn danger" type="button" onClick={() => setConfirming(true)}>
        Delete program
      </button>
    );
  }

  return (
    <div className="delete-confirm" role="alertdialog" aria-label="Confirm delete program">
      <p>
        <strong>Permanently delete “{programName}”?</strong> This also removes its{" "}
        {sessions} session{sessions === 1 ? "" : "s"}, {enrolled} enrollment
        {enrolled === 1 ? "" : "s"}, and all attendance recorded against them. This
        cannot be undone.
      </p>
      <div className="delete-actions">
        <form action={deleteProgram}>
          <input type="hidden" name="programId" value={programId} />
          <button className="btn-danger" type="submit">
            Yes, delete permanently
          </button>
        </form>
        <button className="btn-ghost" type="button" onClick={() => setConfirming(false)}>
          Cancel
        </button>
      </div>
    </div>
  );
}

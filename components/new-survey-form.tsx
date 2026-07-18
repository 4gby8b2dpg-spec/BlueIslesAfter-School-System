"use client";

import { useState } from "react";

export function NewSurveyForm({ action }: { action: (fd: FormData) => void }) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <div className="survey-new">
        <button type="button" className="form-trigger" onClick={() => setOpen(true)}>
          + New survey
        </button>
      </div>
    );
  }

  return (
    <form action={action} className="survey-new-form">
      <input name="title" required autoFocus placeholder="Survey title (e.g. Program Satisfaction)" />
      <button className="btn-primary" type="submit">
        Create
      </button>
      <button className="btn-ghost" type="button" onClick={() => setOpen(false)}>
        Cancel
      </button>
    </form>
  );
}

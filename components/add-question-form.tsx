"use client";

import { useState } from "react";

const TYPES = [
  { v: "multiple_choice", label: "Multiple choice" },
  { v: "checkboxes", label: "Checkboxes" },
  { v: "rating_1_5", label: "Rating 1–5" },
  { v: "scale_0_10", label: "Scale 0–10" },
  { v: "short_text", label: "Short text" },
  { v: "long_text", label: "Long text" },
  { v: "yes_no", label: "Yes / No" },
];

export function AddQuestionForm({
  surveyId,
  action,
}: {
  surveyId: string;
  action: (fd: FormData) => void;
}) {
  const [qtype, setQtype] = useState("multiple_choice");
  const needsOptions = qtype === "multiple_choice" || qtype === "checkboxes";

  return (
    <form action={action} className="q-add">
      <input type="hidden" name="surveyId" value={surveyId} />
      <div className="q-add-row">
        <input name="prompt" required placeholder="Question text" className="q-add-prompt" />
        <select name="qtype" value={qtype} onChange={(e) => setQtype(e.target.value)}>
          {TYPES.map((t) => (
            <option key={t.v} value={t.v}>
              {t.label}
            </option>
          ))}
        </select>
      </div>
      {needsOptions && (
        <input
          name="options"
          required
          placeholder="Options, comma-separated (e.g. Yes, No, Maybe)"
          className="q-add-options"
        />
      )}
      <div className="q-add-foot">
        <label className="q-add-req">
          <input type="checkbox" name="required" /> Required
        </label>
        <button className="btn-primary" type="submit">
          Add question
        </button>
      </div>
    </form>
  );
}

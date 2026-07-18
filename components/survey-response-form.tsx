"use client";

import { memo, useCallback, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export type PublicQuestion = {
  id: string;
  prompt: string;
  qtype: string;
  options: string[] | null;
  required: boolean;
};

type Answer = string | string[];

// One question. Memoized so changing another question's answer doesn't
// re-render the whole form — only the field whose value actually changed.
const QuestionField = memo(function QuestionField({
  q,
  index,
  value,
  onChange,
}: {
  q: PublicQuestion;
  index: number;
  value: Answer | undefined;
  onChange: (qid: string, value: Answer) => void;
}) {
  const hasOptions = (q.options?.length ?? 0) > 0;
  // A choice question saved without options would render blank — fall back to text.
  const type =
    (q.qtype === "multiple_choice" || q.qtype === "checkboxes") && !hasOptions
      ? "short_text"
      : q.qtype;

  function toggleCheckbox(option: string, checked: boolean) {
    const cur = (value as string[]) ?? [];
    onChange(q.id, checked ? [...cur, option] : cur.filter((o) => o !== option));
  }

  return (
    <fieldset className="sv-q">
      <legend>
        <span className="sv-qnum">{index + 1}.</span> {q.prompt}
        {q.required && <span className="sv-req">*</span>}
      </legend>

      {type === "short_text" && (
        <input
          type="text"
          placeholder="Type your answer…"
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(q.id, e.target.value)}
        />
      )}
      {type === "long_text" && (
        <textarea
          rows={3}
          placeholder="Type your answer…"
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(q.id, e.target.value)}
        />
      )}
      {type === "yes_no" &&
        ["Yes", "No"].map((o) => (
          <label key={o} className="sv-opt">
            <input type="radio" name={q.id} checked={value === o} onChange={() => onChange(q.id, o)} />
            {o}
          </label>
        ))}
      {type === "multiple_choice" &&
        (q.options ?? []).map((o) => (
          <label key={o} className="sv-opt">
            <input type="radio" name={q.id} checked={value === o} onChange={() => onChange(q.id, o)} />
            {o}
          </label>
        ))}
      {type === "checkboxes" &&
        (q.options ?? []).map((o) => (
          <label key={o} className="sv-opt">
            <input
              type="checkbox"
              checked={Array.isArray(value) && value.includes(o)}
              onChange={(e) => toggleCheckbox(o, e.target.checked)}
            />
            {o}
          </label>
        ))}
      {(type === "rating_1_5" || type === "scale_0_10") &&
        (() => {
          const max = type === "rating_1_5" ? 5 : 10;
          const start = type === "rating_1_5" ? 1 : 0;
          const nums = Array.from({ length: max - start + 1 }, (_, k) => start + k);
          return (
            <div className="sv-scale-wrap">
              <div className="sv-scale">
                {nums.map((n) => (
                  <button
                    key={n}
                    type="button"
                    className={value === String(n) ? "sv-scale-btn active" : "sv-scale-btn"}
                    onClick={() => onChange(q.id, String(n))}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <div className="sv-scale-ends">
                <span>{start} — lowest</span>
                <span>{max} — highest</span>
              </div>
            </div>
          );
        })()}
    </fieldset>
  );
});

export function SurveyResponseForm({
  token,
  questions,
}: {
  token: string;
  questions: PublicQuestion[];
}) {
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // Stable across renders so memoized fields don't re-render on every change.
  const setAnswer = useCallback((qid: string, value: Answer) => {
    setError(null);
    setAnswers((a) => ({ ...a, [qid]: value }));
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    // required check
    for (const q of questions) {
      if (!q.required) continue;
      const v = answers[q.id];
      if (v == null || (Array.isArray(v) ? v.length === 0 : String(v).trim() === "")) {
        setError("Please answer all required questions (marked *).");
        return;
      }
    }
    setBusy(true);
    const supabase = createClient();
    const payload = questions
      .filter((q) => answers[q.id] != null)
      .map((q) => ({ question_id: q.id, value: answers[q.id] }));

    // One token-scoped RPC creates the response + answers server-side (0005).
    const { error: rpcErr } = await supabase.rpc("submit_survey_response", {
      p_token: token,
      p_answers: payload,
    });
    if (rpcErr) {
      setBusy(false);
      setError("Could not submit. The survey may have closed. Please try again.");
      return;
    }
    setBusy(false);
    setDone(true);
  }

  if (done) {
    return (
      <div className="sv-done">
        <div className="sv-check" aria-hidden="true">
          ✓
        </div>
        <h2>Thank you!</h2>
        <p>Your response has been recorded.</p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="sv-form">
      {questions.map((q, i) => (
        <QuestionField key={q.id} q={q} index={i} value={answers[q.id]} onChange={setAnswer} />
      ))}

      {error && (
        <p className="sv-error" role="alert">
          {error}
        </p>
      )}
      <button className="sv-submit" type="submit" disabled={busy}>
        {busy ? "Submitting…" : "Submit response"}
      </button>
    </form>
  );
}

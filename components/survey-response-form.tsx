"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export type PublicQuestion = {
  id: string;
  prompt: string;
  qtype: string;
  options: string[] | null;
  required: boolean;
};

export function SurveyResponseForm({
  token,
  questions,
}: {
  token: string;
  questions: PublicQuestion[];
}) {
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function set(qid: string, value: string | string[]) {
    setError(null);
    setAnswers((a) => ({ ...a, [qid]: value }));
  }
  function toggleCheckbox(qid: string, option: string, checked: boolean) {
    const cur = (answers[qid] as string[]) ?? [];
    set(qid, checked ? [...cur, option] : cur.filter((o) => o !== option));
  }

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
      {questions.map((q, i) => {
        const hasOptions = (q.options?.length ?? 0) > 0;
        // A choice question saved without options would render blank — fall back to text.
        const type =
          (q.qtype === "multiple_choice" || q.qtype === "checkboxes") && !hasOptions
            ? "short_text"
            : q.qtype;
        const val = answers[q.id];

        return (
          <fieldset key={q.id} className="sv-q">
            <legend>
              <span className="sv-qnum">{i + 1}.</span> {q.prompt}
              {q.required && <span className="sv-req">*</span>}
            </legend>

            {type === "short_text" && (
              <input
                type="text"
                placeholder="Type your answer…"
                value={typeof val === "string" ? val : ""}
                onChange={(e) => set(q.id, e.target.value)}
              />
            )}
            {type === "long_text" && (
              <textarea
                rows={3}
                placeholder="Type your answer…"
                value={typeof val === "string" ? val : ""}
                onChange={(e) => set(q.id, e.target.value)}
              />
            )}
            {type === "yes_no" &&
              ["Yes", "No"].map((o) => (
                <label key={o} className="sv-opt">
                  <input type="radio" name={q.id} checked={val === o} onChange={() => set(q.id, o)} />
                  {o}
                </label>
              ))}
            {type === "multiple_choice" &&
              (q.options ?? []).map((o) => (
                <label key={o} className="sv-opt">
                  <input type="radio" name={q.id} checked={val === o} onChange={() => set(q.id, o)} />
                  {o}
                </label>
              ))}
            {type === "checkboxes" &&
              (q.options ?? []).map((o) => (
                <label key={o} className="sv-opt">
                  <input
                    type="checkbox"
                    checked={Array.isArray(val) && val.includes(o)}
                    onChange={(e) => toggleCheckbox(q.id, o, e.target.checked)}
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
                          className={val === String(n) ? "sv-scale-btn active" : "sv-scale-btn"}
                          onClick={() => set(q.id, String(n))}
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
      })}

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

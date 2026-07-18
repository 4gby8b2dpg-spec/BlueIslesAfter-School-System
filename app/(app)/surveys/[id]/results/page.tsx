import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAppContext } from "@/lib/auth-context";
import { createClient } from "@/lib/supabase/server";
import { ReportActions } from "@/components/report-actions";
import "../../surveys.css";

export const dynamic = "force-dynamic";

function asText(v: unknown): string {
  if (Array.isArray(v)) return v.join(", ");
  if (v == null) return "";
  return String(v);
}

export default async function SurveyResults({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireAppContext();
  const supabase = await createClient();

  const { data: survey } = await supabase
    .from("surveys")
    .select("id, title, status")
    .eq("org_id", ctx.orgId)
    .eq("id", id)
    .maybeSingle();
  if (!survey) notFound();

  const [questionsRes, responsesRes, answersRes] = await Promise.all([
    supabase.from("survey_questions").select("id, prompt, qtype, options, position").eq("survey_id", id).order("position"),
    supabase.from("survey_responses").select("id, submitted_at").eq("survey_id", id).order("submitted_at"),
    supabase.from("survey_answers").select("response_id, question_id, value").eq("org_id", ctx.orgId),
  ]);

  const questions = questionsRes.data ?? [];
  const responses = responsesRes.data ?? [];
  const qIds = new Set(questions.map((q) => q.id));
  const answers = (answersRes.data ?? []).filter((a) => qIds.has(a.question_id));

  // answers grouped
  const byQuestion = new Map<string, unknown[]>();
  const byResponse = new Map<string, Map<string, unknown>>();
  for (const a of answers) {
    const arr = byQuestion.get(a.question_id) ?? [];
    arr.push(a.value);
    byQuestion.set(a.question_id, arr);
    const rmap = byResponse.get(a.response_id) ?? new Map();
    rmap.set(a.question_id, a.value);
    byResponse.set(a.response_id, rmap);
  }

  // export matrix
  const columns = ["Response", "Submitted", ...questions.map((q) => q.prompt)];
  const rows = responses.map((r, i) => {
    const rmap = byResponse.get(r.id) ?? new Map();
    return [
      i + 1,
      new Date(r.submitted_at).toLocaleDateString("en-US"),
      ...questions.map((q) => asText(rmap.get(q.id))),
    ] as (string | number)[];
  });

  return (
    <main className="dash">
      <div className="profile-back">
        <Link href={`/surveys/${id}`}>← Back to survey</Link>
      </div>

      <div className="survey-results-head">
        <div>
          <h1>{survey.title}</h1>
          <p className="results-count num">
            {responses.length} response{responses.length === 1 ? "" : "s"}
          </p>
        </div>
        {responses.length > 0 && (
          <ReportActions
            filename={`survey-${survey.title.replace(/\s+/g, "-").toLowerCase()}.xlsx`}
            sheetName="Responses"
            columns={columns}
            rows={rows}
          />
        )}
      </div>

      {responses.length === 0 ? (
        <section className="card">
          <p className="empty">No responses yet. Share the link from the survey page.</p>
        </section>
      ) : (
        <div className="results-list">
          {questions.map((q) => {
            const vals = byQuestion.get(q.id) ?? [];
            const isChoice = ["multiple_choice", "checkboxes", "yes_no"].includes(q.qtype);
            const isScale = ["rating_1_5", "scale_0_10"].includes(q.qtype);
            const isText = ["short_text", "long_text"].includes(q.qtype);

            // choice distribution
            const counts = new Map<string, number>();
            if (isChoice) {
              const opts =
                q.qtype === "yes_no" ? ["Yes", "No"] : (q.options as string[] | null) ?? [];
              for (const o of opts) counts.set(o, 0);
              for (const v of vals) {
                const list = Array.isArray(v) ? v : [v];
                for (const x of list) counts.set(String(x), (counts.get(String(x)) ?? 0) + 1);
              }
            }
            const maxCount = Math.max(1, ...counts.values());

            // scale average
            const nums = isScale ? vals.map((v) => Number(v)).filter((n) => !isNaN(n)) : [];
            const avg = nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;

            return (
              <section key={q.id} className="card result-q">
                <div className="card-head">
                  <h2>{q.prompt}</h2>
                  <span className="card-sub num">{vals.length} answered</span>
                </div>

                {isChoice && (
                  <ul className="bars">
                    {[...counts.entries()].map(([opt, n], i) => (
                      <li key={i} className="bar-row">
                        <span className="bar-name">{opt}</span>
                        <span className="bar-track">
                          <span className="bar-fill" style={{ width: `${(n / maxCount) * 100}%` }} />
                        </span>
                        <span className="bar-val num">{n}</span>
                      </li>
                    ))}
                  </ul>
                )}

                {isScale && (
                  <p className="result-avg">
                    Average <strong className="num">{avg == null ? "—" : (Math.round(avg * 10) / 10)}</strong>
                    {q.qtype === "rating_1_5" ? " / 5" : " / 10"}
                  </p>
                )}

                {isText && (
                  <ul className="result-texts">
                    {vals.length === 0 ? (
                      <li className="empty">No answers.</li>
                    ) : (
                      vals.map((v, i) => <li key={i}>{asText(v)}</li>)
                    )}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      )}
    </main>
  );
}

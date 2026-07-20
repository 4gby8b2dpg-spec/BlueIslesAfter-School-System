import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAppContext } from "@/lib/auth-context";
import { createClient } from "@/lib/supabase/server";
import { updateSurvey, deleteQuestion, setSurveyStatus, addQuestion, setSurveyPair } from "../actions";
import { AddQuestionForm } from "@/components/add-question-form";
import { CopyLink } from "@/components/copy-link";
import "../surveys.css";
import { CardIcon } from "@/components/card-icon";

export const dynamic = "force-dynamic";

const QTYPE_LABEL: Record<string, string> = {
  multiple_choice: "Multiple choice",
  checkboxes: "Checkboxes",
  rating_1_5: "Rating 1–5",
  scale_0_10: "Scale 0–10",
  short_text: "Short text",
  long_text: "Long text",
  yes_no: "Yes / No",
};

export default async function SurveyBuilder({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireAppContext();
  const supabase = await createClient();

  const { data: survey } = await supabase
    .from("surveys")
    .select("id, title, description, audience, program_id, status, public_token, paired_survey_id")
    .eq("org_id", ctx.orgId)
    .eq("id", id)
    .maybeSingle();
  if (!survey) notFound();

  const [questionsRes, programsRes, responsesRes, otherSurveysRes] = await Promise.all([
    supabase
      .from("survey_questions")
      .select("id, position, prompt, qtype, options, required")
      .eq("survey_id", id)
      .order("position"),
    supabase.from("programs").select("id, name").eq("org_id", ctx.orgId).order("name"),
    supabase.from("survey_responses").select("id", { count: "exact", head: true }).eq("survey_id", id),
    supabase
      .from("surveys")
      .select("id, title")
      .eq("org_id", ctx.orgId)
      .neq("id", id)
      .order("title"),
  ]);

  const questions = questionsRes.data ?? [];
  const programs = programsRes.data ?? [];
  const responseCount = responsesRes.count ?? 0;
  const otherSurveys = otherSurveysRes.data ?? [];
  const pairedTitle = survey.paired_survey_id
    ? (otherSurveys.find((s) => s.id === survey.paired_survey_id)?.title ?? "another survey")
    : null;
  const canEdit = ["admin", "director", "staff"].includes(ctx.role);

  return (
    <main className="dash">
      <div className="profile-back">
        <Link href="/surveys">← All surveys</Link>
      </div>

      <section className="card survey-head">
        <div>
          <span className={`survey-status ${survey.status}`}>{survey.status}</span>
          <h1>{survey.title}</h1>
        </div>
        <div className="survey-head-actions">
          <Link href={`/surveys/${id}/results`} className="btn-ghost">
            Results ({responseCount})
          </Link>
          {canEdit &&
            (survey.status === "open" ? (
              <form action={setSurveyStatus}>
                <input type="hidden" name="surveyId" value={id} />
                <input type="hidden" name="status" value="closed" />
                <button className="btn-primary" type="submit">
                  Close survey
                </button>
              </form>
            ) : (
              <form action={setSurveyStatus}>
                <input type="hidden" name="surveyId" value={id} />
                <input type="hidden" name="status" value="open" />
                <button
                  className="btn-primary"
                  type="submit"
                  disabled={questions.length === 0}
                  title={questions.length === 0 ? "Add a question first" : undefined}
                >
                  {survey.status === "closed" ? "Reopen" : "Publish"}
                </button>
              </form>
            ))}
        </div>
      </section>

      {survey.status === "open" && survey.public_token && (
        <section className="card survey-link">
          <div className="card-head">
            <div className="card-title">
              <span className="spot mint"><CardIcon name="link" /></span>
              <h2>Share link</h2>
            </div>
            <span className="card-sub">Anyone with this link can respond</span>
          </div>
          <CopyLink path={`/survey/${survey.public_token}`} />
        </section>
      )}

      {(canEdit || survey.paired_survey_id) && (
        <section className="card survey-pair">
          <div className="card-head">
            <div className="card-title">
              <span className="spot violet"><CardIcon name="compare" /></span>
              <h2>Pre / Post pairing</h2>
            </div>
            <span className="card-sub">Compare two surveys to see the shift</span>
          </div>
          {survey.paired_survey_id ? (
            <div className="pair-active">
              <p>
                Paired with <strong>{pairedTitle}</strong>. The comparison shows the before → after
                change for each matching question.
              </p>
              <div className="pair-actions">
                <Link href={`/surveys/${id}/compare`} className="btn-primary">
                  View comparison
                </Link>
                {canEdit && (
                  <form action={setSurveyPair}>
                    <input type="hidden" name="surveyId" value={id} />
                    <input type="hidden" name="pairedSurveyId" value="" />
                    <button className="btn-ghost" type="submit">
                      Unpair
                    </button>
                  </form>
                )}
              </div>
            </div>
          ) : canEdit ? (
            otherSurveys.length === 0 ? (
              <p className="empty">Create another survey to pair this one with.</p>
            ) : (
              <form action={setSurveyPair} className="pair-form">
                <input type="hidden" name="surveyId" value={id} />
                <label>
                  <span>Pair with</span>
                  <select name="pairedSurveyId" defaultValue="">
                    <option value="" disabled>
                      Choose a survey…
                    </option>
                    {otherSurveys.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.title}
                      </option>
                    ))}
                  </select>
                </label>
                <button className="btn-primary" type="submit">
                  Pair surveys
                </button>
              </form>
            )
          ) : null}
        </section>
      )}

      <div className="survey-build-grid">
        {/* settings */}
        {canEdit && (
          <section className="card">
            <div className="card-head">
              <div className="card-title">
                <span className="spot teal"><CardIcon name="gear" /></span>
                <h2>Settings</h2>
              </div>
            </div>
            <form action={updateSurvey} className="survey-settings">
              <input type="hidden" name="surveyId" value={id} />
              <label>
                <span>Title</span>
                <input name="title" defaultValue={survey.title} required />
              </label>
              <label>
                <span>Description</span>
                <textarea name="description" defaultValue={survey.description ?? ""} rows={2} />
              </label>
              <label>
                <span>Audience</span>
                <select name="audience" defaultValue={survey.audience}>
                  <option value="participants">Participants</option>
                  <option value="guardians">Guardians</option>
                  <option value="staff">Staff</option>
                  <option value="public">Public / anonymous</option>
                </select>
              </label>
              <label>
                <span>Linked program (optional)</span>
                <select name="programId" defaultValue={survey.program_id ?? ""}>
                  <option value="">— None —</option>
                  {programs.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <button className="btn-primary" type="submit">
                Save settings
              </button>
            </form>
          </section>
        )}

        {/* questions */}
        <section className="card">
          <div className="card-head">
            <div className="card-title">
              <span className="spot coral"><CardIcon name="list" /></span>
              <h2>Questions</h2>
            </div>
            <span className="card-sub">{questions.length}</span>
          </div>
          {questions.length === 0 ? (
            <p className="empty">No questions yet. Add the first one below.</p>
          ) : (
            <ol className="q-list">
              {questions.map((q) => (
                <li key={q.id} className="q-row">
                  <div className="q-main">
                    <span className="q-prompt">
                      {q.prompt}
                      {q.required && <span className="q-req">*</span>}
                    </span>
                    <span className="q-type">
                      {QTYPE_LABEL[q.qtype] ?? q.qtype}
                      {Array.isArray(q.options) && q.options.length > 0
                        ? ` · ${(q.options as string[]).join(", ")}`
                        : ""}
                    </span>
                  </div>
                  {canEdit && (
                    <form action={deleteQuestion}>
                      <input type="hidden" name="questionId" value={q.id} />
                      <input type="hidden" name="surveyId" value={id} />
                      <button className="link-btn danger" type="submit">
                        Remove
                      </button>
                    </form>
                  )}
                </li>
              ))}
            </ol>
          )}

          {canEdit && <AddQuestionForm surveyId={id} action={addQuestion} />}
        </section>
      </div>
    </main>
  );
}

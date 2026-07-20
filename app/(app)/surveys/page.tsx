import Link from "next/link";
import { requireAppContext } from "@/lib/auth-context";
import { createClient } from "@/lib/supabase/server";
import { createSurvey } from "./actions";
import { NewSurveyForm } from "@/components/new-survey-form";
import "./surveys.css";
import { PageHead } from "@/components/page-head";

export const dynamic = "force-dynamic";

export default async function SurveysPage() {
  const ctx = await requireAppContext();
  const supabase = await createClient();

  const [surveysRes, responsesRes] = await Promise.all([
    supabase
      .from("surveys")
      .select("id, title, status, audience, created_at")
      .eq("org_id", ctx.orgId)
      .order("created_at", { ascending: false }),
    supabase.from("survey_responses").select("survey_id").eq("org_id", ctx.orgId),
  ]);

  const surveys = surveysRes.data ?? [];
  const responseCount = new Map<string, number>();
  for (const r of responsesRes.data ?? [])
    responseCount.set(r.survey_id, (responseCount.get(r.survey_id) ?? 0) + 1);

  const canEdit = ["admin", "director", "staff"].includes(ctx.role);

  return (
    <main className="dash">
      <PageHead href="/surveys" title="Surveys" tone="mint">
        Build surveys, share a link, and read the results.
      </PageHead>

      {canEdit && <NewSurveyForm action={createSurvey} />}

      {surveys.length === 0 ? (
        <section className="card">
          <p className="empty">No surveys yet. Create one to get started.</p>
        </section>
      ) : (
        <div className="survey-grid">
          {surveys.map((s) => (
            <Link key={s.id} href={`/surveys/${s.id}`} className="survey-card">
              <div className="survey-card-top">
                <span className="survey-title">{s.title}</span>
                <span className={`survey-status ${s.status}`}>{s.status}</span>
              </div>
              <div className="survey-card-meta">
                <span className="survey-aud">{s.audience}</span>
                <span className="survey-resp num">
                  {responseCount.get(s.id) ?? 0} response
                  {(responseCount.get(s.id) ?? 0) === 1 ? "" : "s"}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}

import { createClient } from "@/lib/supabase/server";
import { SurveyResponseForm, type PublicQuestion } from "@/components/survey-response-form";
import "./survey-public.css";

export const dynamic = "force-dynamic";

export default async function PublicSurveyPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const supabase = await createClient();

  // Single token-scoped RPC — anon has no direct table access (see 0005).
  const { data } = await supabase.rpc("get_public_survey", { p_token: token });
  const survey = data as {
    id: string;
    org_id: string;
    title: string;
    description: string | null;
    questions: PublicQuestion[];
  } | null;

  if (!survey) {
    return (
      <main className="sv-wrap">
        <div className="sv-card sv-unavailable">
          <div className="sv-brand">BlueIsles</div>
          <h1>Survey unavailable</h1>
          <p>This survey link is invalid, or the survey has closed.</p>
        </div>
      </main>
    );
  }

  const questions = survey.questions ?? [];

  return (
    <main className="sv-wrap">
      <div className="sv-card">
        <div className="sv-brand">BlueIsles</div>
        <h1>{survey.title}</h1>
        {survey.description && <p className="sv-desc">{survey.description}</p>}
        {questions.length === 0 ? (
          <p className="sv-desc">This survey has no questions yet.</p>
        ) : (
          <SurveyResponseForm token={token} questions={questions} />
        )}
      </div>
    </main>
  );
}

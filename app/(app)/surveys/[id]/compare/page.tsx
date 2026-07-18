import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAppContext } from "@/lib/auth-context";
import { createClient } from "@/lib/supabase/server";
import "../../surveys.css";

export const dynamic = "force-dynamic";

const NUMERIC = ["rating_1_5", "scale_0_10"];
const COMPARABLE = [...NUMERIC, "yes_no"];

type Q = { id: string; prompt: string; qtype: string; survey_id: string };

function norm(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

// Returns a single comparable number for a question: average for scales,
// percent-yes for yes/no. Null when there are no usable answers.
function stat(qtype: string, values: unknown[]): number | null {
  if (NUMERIC.includes(qtype)) {
    const nums = values.map((v) => Number(v)).filter((n) => !Number.isNaN(n));
    return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
  }
  if (qtype === "yes_no") {
    const answered = values.filter((v) => v === "Yes" || v === "No");
    return answered.length
      ? (answered.filter((v) => v === "Yes").length / answered.length) * 100
      : null;
  }
  return null;
}

function fmt(qtype: string, n: number | null): string {
  if (n == null) return "—";
  if (qtype === "yes_no") return `${Math.round(n)}% yes`;
  const rounded = Math.round(n * 10) / 10;
  return qtype === "rating_1_5" ? `${rounded} / 5` : `${rounded} / 10`;
}

export default async function SurveyCompare({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireAppContext();
  const supabase = await createClient();

  const { data: survey } = await supabase
    .from("surveys")
    .select("id, title, created_at, paired_survey_id")
    .eq("org_id", ctx.orgId)
    .eq("id", id)
    .maybeSingle();
  if (!survey) notFound();

  if (!survey.paired_survey_id) {
    return (
      <main className="dash">
        <div className="profile-back">
          <Link href={`/surveys/${id}`}>← Back to survey</Link>
        </div>
        <section className="card">
          <p className="empty">This survey isn&rsquo;t paired yet. Pair it from the survey page to compare.</p>
        </section>
      </main>
    );
  }

  const { data: pair } = await supabase
    .from("surveys")
    .select("id, title, created_at")
    .eq("org_id", ctx.orgId)
    .eq("id", survey.paired_survey_id)
    .maybeSingle();
  if (!pair) notFound();

  // Earlier survey is "Before", later is "After".
  const [pre, post] =
    new Date(survey.created_at) <= new Date(pair.created_at)
      ? [survey, pair]
      : [pair, survey];

  const [qRes, aRes] = await Promise.all([
    supabase
      .from("survey_questions")
      .select("id, prompt, qtype, survey_id")
      .in("survey_id", [pre.id, post.id]),
    supabase.from("survey_answers").select("question_id, value").eq("org_id", ctx.orgId),
  ]);

  const questions = (qRes.data ?? []) as Q[];
  const valuesByQ = new Map<string, unknown[]>();
  const qIds = new Set(questions.map((q) => q.id));
  for (const a of aRes.data ?? []) {
    if (!qIds.has(a.question_id)) continue;
    const arr = valuesByQ.get(a.question_id) ?? [];
    arr.push(a.value);
    valuesByQ.set(a.question_id, arr);
  }

  const preQs = questions.filter((q) => q.survey_id === pre.id);
  const postQs = questions.filter((q) => q.survey_id === post.id);

  // Match comparable questions by normalized prompt + identical type.
  const rows = preQs
    .filter((q) => COMPARABLE.includes(q.qtype))
    .map((pq) => {
      const match = postQs.find((x) => x.qtype === pq.qtype && norm(x.prompt) === norm(pq.prompt));
      if (!match) return null;
      const preVal = stat(pq.qtype, valuesByQ.get(pq.id) ?? []);
      const postVal = stat(pq.qtype, valuesByQ.get(match.id) ?? []);
      const delta = preVal != null && postVal != null ? postVal - preVal : null;
      return { prompt: pq.prompt, qtype: pq.qtype, preVal, postVal, delta };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  return (
    <main className="dash">
      <div className="profile-back">
        <Link href={`/surveys/${id}`}>← Back to survey</Link>
      </div>

      <div className="dash-head">
        <h1>Before → After</h1>
        <p>
          Comparing <strong>{pre.title}</strong> (before) with <strong>{post.title}</strong> (after)
          on each matching question.
        </p>
      </div>

      {rows.length === 0 ? (
        <section className="card">
          <p className="empty">
            No matching questions to compare. Pre/post pairs compare rating, scale, and yes/no
            questions with the same wording in both surveys.
          </p>
        </section>
      ) : (
        <section className="card">
          <ul className="cmp-list">
            <li className="cmp-row cmp-head">
              <span className="cmp-q">Question</span>
              <span className="cmp-val">Before</span>
              <span className="cmp-val">After</span>
              <span className="cmp-delta">Change</span>
            </li>
            {rows.map((r, i) => {
              const dir = r.delta == null ? "flat" : r.delta > 0.05 ? "up" : r.delta < -0.05 ? "down" : "flat";
              const unit = r.qtype === "yes_no" ? " pts" : "";
              return (
                <li key={i} className="cmp-row">
                  <span className="cmp-q">{r.prompt}</span>
                  <span className="cmp-val num">{fmt(r.qtype, r.preVal)}</span>
                  <span className="cmp-val num">{fmt(r.qtype, r.postVal)}</span>
                  <span className={`cmp-delta num ${dir}`}>
                    {r.delta == null
                      ? "—"
                      : `${r.delta > 0 ? "▲ +" : r.delta < 0 ? "▼ " : ""}${Math.round(r.delta * 10) / 10}${unit}`}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </main>
  );
}

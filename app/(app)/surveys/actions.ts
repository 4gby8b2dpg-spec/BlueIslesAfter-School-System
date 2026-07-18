"use server";

import { requireAppContext } from "@/lib/auth-context";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

const QTYPES = [
  "multiple_choice",
  "checkboxes",
  "rating_1_5",
  "scale_0_10",
  "short_text",
  "long_text",
  "yes_no",
];

async function requireEditor() {
  const ctx = await requireAppContext();
  return ["admin", "director", "staff"].includes(ctx.role) ? ctx : null;
}

export async function createSurvey(formData: FormData) {
  const ctx = await requireEditor();
  if (!ctx) return;
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return;

  const supabase = await createClient();
  const { data } = await supabase
    .from("surveys")
    .insert({ org_id: ctx.orgId, title, status: "draft", audience: "participants" })
    .select("id")
    .single();

  revalidatePath("/surveys");
  if (data?.id) redirect(`/surveys/${data.id}`);
}

export async function updateSurvey(formData: FormData) {
  const ctx = await requireEditor();
  if (!ctx) return;
  const id = String(formData.get("surveyId"));
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const audience = String(formData.get("audience") ?? "participants");
  const programId = String(formData.get("programId") ?? "") || null;
  if (!id || !title) return;

  const supabase = await createClient();
  await supabase
    .from("surveys")
    .update({ title, description, audience, program_id: programId })
    .eq("id", id)
    .eq("org_id", ctx.orgId);

  revalidatePath(`/surveys/${id}`);
}

export async function addQuestion(formData: FormData) {
  const ctx = await requireEditor();
  if (!ctx) return;
  const surveyId = String(formData.get("surveyId"));
  const prompt = String(formData.get("prompt") ?? "").trim();
  const qtype = String(formData.get("qtype") ?? "");
  const required = formData.get("required") === "on";
  const optionsRaw = String(formData.get("options") ?? "").trim();
  if (!surveyId || !prompt || !QTYPES.includes(qtype)) return;

  const isChoice = ["multiple_choice", "checkboxes"].includes(qtype);
  const options = isChoice && optionsRaw
    ? optionsRaw.split(",").map((o) => o.trim()).filter(Boolean)
    : null;
  // A choice question must have options, or it renders blank to respondents.
  if (isChoice && (!options || options.length === 0)) return;

  const supabase = await createClient();
  const { count } = await supabase
    .from("survey_questions")
    .select("id", { count: "exact", head: true })
    .eq("survey_id", surveyId);

  await supabase.from("survey_questions").insert({
    org_id: ctx.orgId,
    survey_id: surveyId,
    position: count ?? 0,
    prompt,
    qtype,
    options,
    required,
  });

  revalidatePath(`/surveys/${surveyId}`);
}

export async function deleteQuestion(formData: FormData) {
  const ctx = await requireEditor();
  if (!ctx) return;
  const questionId = String(formData.get("questionId"));
  const surveyId = String(formData.get("surveyId"));
  const supabase = await createClient();
  await supabase.from("survey_questions").delete().eq("id", questionId).eq("org_id", ctx.orgId);
  revalidatePath(`/surveys/${surveyId}`);
}

export async function setSurveyStatus(formData: FormData) {
  const ctx = await requireEditor();
  if (!ctx) return;
  const id = String(formData.get("surveyId"));
  const status = String(formData.get("status"));
  if (!id || !["draft", "open", "closed"].includes(status)) return;

  const supabase = await createClient();
  const patch: Record<string, unknown> = { status };
  if (status === "open") {
    // ensure a public token exists when publishing
    const { data: s } = await supabase
      .from("surveys")
      .select("public_token")
      .eq("id", id)
      .maybeSingle();
    if (!s?.public_token) patch.public_token = crypto.randomUUID().replace(/-/g, "");
  }
  await supabase.from("surveys").update(patch).eq("id", id).eq("org_id", ctx.orgId);

  revalidatePath(`/surveys/${id}`);
  revalidatePath("/surveys");
}

// Pre/post pairing (FR-F.4). Links two surveys both directions so their
// results can be compared. Passing an empty partner unpairs.
export async function setSurveyPair(formData: FormData) {
  const ctx = await requireEditor();
  if (!ctx) return;
  const id = String(formData.get("surveyId"));
  const pairedId = String(formData.get("pairedSurveyId") ?? "") || null;
  if (!id || pairedId === id) return;

  const supabase = await createClient();

  async function clearPartnerOf(surveyId: string, keep: string | null) {
    const { data } = await supabase
      .from("surveys")
      .select("paired_survey_id")
      .eq("id", surveyId)
      .eq("org_id", ctx!.orgId)
      .maybeSingle();
    const partner = data?.paired_survey_id as string | null | undefined;
    if (partner && partner !== keep) {
      await supabase
        .from("surveys")
        .update({ paired_survey_id: null })
        .eq("id", partner)
        .eq("org_id", ctx!.orgId);
    }
  }

  // Detach whatever each side currently points at, then link (or leave cleared).
  await clearPartnerOf(id, pairedId);
  if (pairedId) await clearPartnerOf(pairedId, id);

  await supabase
    .from("surveys")
    .update({ paired_survey_id: pairedId })
    .eq("id", id)
    .eq("org_id", ctx.orgId);
  if (pairedId) {
    await supabase
      .from("surveys")
      .update({ paired_survey_id: id })
      .eq("id", pairedId)
      .eq("org_id", ctx.orgId);
    revalidatePath(`/surveys/${pairedId}`);
  }

  revalidatePath(`/surveys/${id}`);
}

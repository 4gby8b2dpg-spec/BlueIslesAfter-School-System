"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAppContext } from "@/lib/auth-context";
import { cleanName } from "@/lib/names";
import { nameField, parseFields } from "@/lib/validate";

// A person sets their own name. Only their own profile row is touched; the
// user id comes from the verified session, never from the form.
export async function updateOwnName(formData: FormData) {
  const ctx = await requireAppContext();
  const input = parseFields(formData, { name: nameField });
  if (!input) redirect("/account?saved=invalid");
  const name = cleanName(input.name);
  if (!name) redirect("/account?saved=invalid");

  const admin = createAdminClient();
  const { error } = await admin.from("profiles").update({ full_name: name }).eq("id", ctx.userId);
  if (error) {
    console.error("[account] name update failed:", error);
    redirect("/account?saved=failed");
  }

  const supabase = await createClient();
  await supabase.from("audit_log").insert({
    org_id: ctx.orgId,
    actor_id: ctx.userId,
    action: "update",
    entity_table: "profiles",
    entity_id: ctx.userId,
    before: null,
    after: { full_name: name },
  });

  // Layout too, so the sidebar name and the "add your name" banner update everywhere.
  revalidatePath("/", "layout");
  redirect("/account?saved=ok");
}

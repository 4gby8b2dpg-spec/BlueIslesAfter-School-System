"use server";

import { requireAppContext } from "@/lib/auth-context";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export type ParticipantFields = {
  first_name: string;
  last_name: string;
  external_id: string | null;
  date_of_birth: string | null;
  grade: string | null;
  school: string | null;
  gender: string | null;
};

export type ImportRowInput = {
  rowNumber: number;
  raw: Record<string, string>;
  fields: ParticipantFields;
};

export type CommitInput = {
  fileName: string;
  sheetName: string | null;
  rowsTotal: number;
  rowsSkipped: number;
  rows: ImportRowInput[];
};

export async function commitImport(input: CommitInput) {
  const ctx = await requireAppContext();
  if (!["admin", "director", "staff"].includes(ctx.role)) {
    return { ok: false as const, error: "You don't have permission to import." };
  }
  if (input.rows.length === 0) {
    return { ok: false as const, error: "Nothing to commit." };
  }
  const supabase = await createClient();

  // 1. import record
  const { data: imp, error: impErr } = await supabase
    .from("imports")
    .insert({
      org_id: ctx.orgId,
      file_name: input.fileName,
      sheet_name: input.sheetName,
      target_type: "participants",
      status: "validating",
      rows_total: input.rowsTotal,
      rows_skipped: input.rowsSkipped,
      run_by: ctx.userId,
    })
    .select("id")
    .single();
  if (impErr || !imp) {
    return { ok: false as const, error: impErr?.message ?? "Could not start import." };
  }

  // 2. participants
  const toInsert = input.rows.map((r) => ({
    org_id: ctx.orgId,
    ...r.fields,
    source_import_id: imp.id,
  }));
  const { data: created, error: pErr } = await supabase
    .from("participants")
    .insert(toInsert)
    .select("id");
  if (pErr || !created) {
    await supabase.from("imports").update({ status: "failed" }).eq("id", imp.id);
    return { ok: false as const, error: pErr?.message ?? "Insert failed." };
  }

  // 3. provenance rows (enables rollback)
  const prov = input.rows.map((r, i) => ({
    org_id: ctx.orgId,
    import_id: imp.id,
    row_number: r.rowNumber,
    raw: r.raw,
    outcome: "committed",
    created_record_table: "participants",
    created_record_id: created[i]?.id ?? null,
  }));
  await supabase.from("import_rows").insert(prov);

  // 4. finalize
  await supabase
    .from("imports")
    .update({ status: "committed", rows_committed: created.length })
    .eq("id", imp.id);

  revalidatePath("/import");
  revalidatePath("/dashboard");
  revalidatePath("/analytics");
  return { ok: true as const, importId: imp.id, committed: created.length };
}

export async function rollbackImport(importId: string) {
  const ctx = await requireAppContext();
  if (!["admin", "director"].includes(ctx.role)) {
    return { ok: false as const, error: "Only an admin or director can roll back." };
  }
  const supabase = await createClient();

  const { data: rows } = await supabase
    .from("import_rows")
    .select("created_record_id")
    .eq("import_id", importId)
    .eq("created_record_table", "participants");

  const ids = (rows ?? [])
    .map((r) => r.created_record_id as string | null)
    .filter((x): x is string => !!x);

  if (ids.length) {
    // Hard-delete the rows this import created (cascades dependents), so the
    // rollback actually clears them from every view.
    await supabase.from("participants").delete().in("id", ids);
  }
  await supabase.from("imports").update({ status: "rolled_back" }).eq("id", importId);

  revalidatePath("/import");
  revalidatePath("/dashboard");
  revalidatePath("/analytics");
  return { ok: true as const, removed: ids.length };
}

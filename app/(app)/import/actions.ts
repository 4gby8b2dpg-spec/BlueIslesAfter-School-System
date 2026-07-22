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

export type ProgramFields = {
  name: string;
  category: string | null;
  capacity: number | null;
  site_id: string | null;
};

export type ProgramRowInput = {
  rowNumber: number;
  raw: Record<string, string>;
  fields: ProgramFields;
};

export type CommitProgramInput = {
  fileName: string;
  sheetName: string | null;
  rowsTotal: number;
  rowsSkipped: number;
  rows: ProgramRowInput[];
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

export async function commitProgramImport(input: CommitProgramInput) {
  const ctx = await requireAppContext();
  if (!["admin", "director"].includes(ctx.role)) {
    return { ok: false as const, error: "You don't have permission to import programs." };
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
      target_type: "programs",
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

  // Default new programs to the org's first term, mirroring manual creation.
  const { data: term } = await supabase
    .from("terms")
    .select("id")
    .eq("org_id", ctx.orgId)
    .limit(1)
    .maybeSingle();

  // 2. programs
  const toInsert = input.rows.map((r) => ({
    org_id: ctx.orgId,
    name: r.fields.name,
    category: r.fields.category,
    capacity: r.fields.capacity,
    site_id: r.fields.site_id,
    term_id: term?.id ?? null,
    status: "active" as const,
  }));
  const { data: created, error: pErr } = await supabase
    .from("programs")
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
    created_record_table: "programs",
    created_record_id: created[i]?.id ?? null,
  }));
  await supabase.from("import_rows").insert(prov);

  // 4. finalize
  await supabase
    .from("imports")
    .update({ status: "committed", rows_committed: created.length })
    .eq("id", imp.id);

  revalidatePath("/import");
  revalidatePath("/programs");
  revalidatePath("/dashboard");
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
    .select("created_record_table, created_record_id")
    .eq("import_id", importId);

  // Group the records this import created by their table so we can hard-delete
  // each set (cascades dependents), clearing them from every view.
  const byTable = new Map<string, string[]>();
  for (const r of rows ?? []) {
    const table = r.created_record_table as string | null;
    const id = r.created_record_id as string | null;
    if (table && id) {
      const list = byTable.get(table) ?? [];
      list.push(id);
      byTable.set(table, list);
    }
  }

  let removed = 0;

  const participantIds = byTable.get("participants") ?? [];
  if (participantIds.length) {
    await supabase.from("participants").delete().in("id", participantIds);
    removed += participantIds.length;
  }

  const programIds = byTable.get("programs") ?? [];
  if (programIds.length) {
    // Surveys reference programs without cascade — detach so the delete succeeds.
    await supabase
      .from("surveys")
      .update({ program_id: null })
      .eq("org_id", ctx.orgId)
      .in("program_id", programIds);
    await supabase.from("programs").delete().in("id", programIds);
    removed += programIds.length;
  }

  await supabase.from("imports").update({ status: "rolled_back" }).eq("id", importId);

  revalidatePath("/import");
  revalidatePath("/programs");
  revalidatePath("/dashboard");
  revalidatePath("/analytics");
  return { ok: true as const, removed };
}

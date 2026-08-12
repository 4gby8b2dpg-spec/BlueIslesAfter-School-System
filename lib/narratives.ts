// Shared block type for the narrative builder (FR-H.4). Stored as loose
// jsonb (report_narratives.blocks) — same convention as
// participants.custom_fields, not validated against a DB enum.
// KPI/chart blocks are snapshots captured at add-time, not live-recomputed,
// so a saved narrative stays stable for a board deck.
export type NarrativeBlock =
  | { id: string; type: "text"; body: string }
  | { id: string; type: "kpi"; label: string; value: string }
  | { id: string; type: "chart"; label: string; dataUrl: string };

export function isNarrativeBlock(v: unknown): v is NarrativeBlock {
  if (!v || typeof v !== "object") return false;
  const b = v as Record<string, unknown>;
  if (typeof b.id !== "string") return false;
  if (b.type === "text") return typeof b.body === "string";
  if (b.type === "kpi") return typeof b.label === "string" && typeof b.value === "string";
  if (b.type === "chart") return typeof b.label === "string" && typeof b.dataUrl === "string";
  return false;
}

export function parseNarrativeBlocks(raw: string): NarrativeBlock[] {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isNarrativeBlock);
  } catch {
    return [];
  }
}

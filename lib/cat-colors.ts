// Categorical palette — deliberately distinct from the brand (teal/marigold)
// and semantic (good/warn/crit) colors, so a category never reads as a status.
// Shared by the month calendar and the term planning grid.
export const CAT_COLOR: Record<string, string> = {
  tutoring: "#2563EB",
  STEM: "#7C3AED",
  sports: "#DB2777",
  arts: "#C2410C",
  enrichment: "#0891B2",
};
export const OTHER_COLOR = "#64748B";
export const catColor = (c: string | null) => (c && CAT_COLOR[c]) || OTHER_COLOR;

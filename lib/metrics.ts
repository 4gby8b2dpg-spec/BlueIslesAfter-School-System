/**
 * Canonical metric definitions (blueprint §2.3).
 *
 * These live in ONE place and are printed verbatim in report footers, so the
 * numbers stay defensible to funders. Never re-implement a metric inline in a
 * screen — import the definition from here (and compute in SQL views where noted).
 */

export const METRIC_DEFINITIONS = {
  attendance_rate: {
    label: "Attendance rate",
    // late counts as attended; excused is excluded from the denominator by default.
    formula: "(present + late) ÷ (present + late + absent)",
    note: "Late counts as attended. Excused absences are excluded from the denominator by default (org-configurable).",
  },
  avg_daily_attendance: {
    label: "Average daily attendance",
    formula: "mean of present-count per completed session",
    note: "Averaged across completed sessions only.",
  },
  retention: {
    label: "Retention",
    formula: "participants still enrolled/completed ÷ ever enrolled",
    note: "Measured over the term.",
  },
  unduplicated_participants: {
    label: "Unduplicated participants served",
    formula: "distinct participants with ≥ 1 present record",
    note: "The count funders ask for — each child counted once.",
  },
  attendance_hours: {
    label: "Attendance hours",
    formula: "Σ (time_out − time_in) where captured, else session duration × present",
    note: "Falls back to scheduled duration when sign-in/out times are absent.",
  },
} as const;

export type MetricKey = keyof typeof METRIC_DEFINITIONS;

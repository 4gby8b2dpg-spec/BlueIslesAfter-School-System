// Ready-made survey definitions (FR-F.5). Picking one seeds a real draft
// survey + its questions, which staff can then tweak. Question types match the
// question_type enum (0001); choice types carry an `options` array.

export type TemplateQType =
  | "multiple_choice"
  | "checkboxes"
  | "rating_1_5"
  | "scale_0_10"
  | "short_text"
  | "long_text"
  | "yes_no";

export type TemplateAudience = "participants" | "guardians" | "staff" | "public";

export type TemplateQuestion = {
  prompt: string;
  qtype: TemplateQType;
  required?: boolean;
  options?: string[];
};

export type SurveyTemplate = {
  key: string;
  name: string;
  description: string;
  audience: TemplateAudience;
  questions: TemplateQuestion[];
};

export const SURVEY_TEMPLATES: SurveyTemplate[] = [
  {
    key: "program_satisfaction_participant",
    name: "Program satisfaction (participant)",
    description: "How much kids enjoy and feel they belong in the program.",
    audience: "participants",
    questions: [
      { prompt: "How much do you enjoy this program?", qtype: "rating_1_5", required: true },
      { prompt: "I feel like I belong here.", qtype: "rating_1_5" },
      { prompt: "I've learned new things in this program.", qtype: "rating_1_5" },
      { prompt: "What do you like most about it?", qtype: "long_text" },
      { prompt: "What would make it better?", qtype: "long_text" },
    ],
  },
  {
    key: "program_satisfaction_guardian",
    name: "Program satisfaction (guardian)",
    description: "Family view of satisfaction, communication, and likelihood to recommend.",
    audience: "guardians",
    questions: [
      { prompt: "How satisfied are you with the program overall?", qtype: "rating_1_5", required: true },
      { prompt: "How likely are you to recommend it to another family?", qtype: "scale_0_10" },
      { prompt: "My child looks forward to attending.", qtype: "rating_1_5" },
      { prompt: "Communication from staff has been clear and timely.", qtype: "rating_1_5" },
      { prompt: "Any comments or suggestions?", qtype: "long_text" },
    ],
  },
  {
    key: "staff_reflection",
    name: "Staff end-of-term reflection",
    description: "A short reflection for staff at the close of a term.",
    audience: "staff",
    questions: [
      { prompt: "How well did this term go overall?", qtype: "rating_1_5", required: true },
      { prompt: "What went well?", qtype: "long_text" },
      { prompt: "What was challenging?", qtype: "long_text" },
      { prompt: "What support would help you next term?", qtype: "long_text" },
      { prompt: "Would you run this program again?", qtype: "yes_no" },
    ],
  },
  {
    key: "event_feedback",
    name: "Event feedback",
    description: "Quick post-event pulse for a field trip, showcase, or family night.",
    audience: "public",
    questions: [
      { prompt: "How would you rate this event?", qtype: "rating_1_5", required: true },
      { prompt: "How likely are you to attend a future event?", qtype: "scale_0_10" },
      { prompt: "What was the highlight?", qtype: "short_text" },
      { prompt: "What could we improve?", qtype: "long_text" },
    ],
  },
  {
    key: "sel_self_assessment",
    name: "SEL self-assessment",
    description: "Social-emotional learning check-in on self-regulation and collaboration.",
    audience: "participants",
    questions: [
      { prompt: "I can calm myself down when I'm upset.", qtype: "rating_1_5" },
      { prompt: "I work well with others in a group.", qtype: "rating_1_5" },
      { prompt: "I keep trying even when something is hard.", qtype: "rating_1_5" },
      { prompt: "I can name how I'm feeling.", qtype: "rating_1_5" },
      { prompt: "Something I'm proud of:", qtype: "short_text" },
    ],
  },
];

export function getSurveyTemplate(key: string): SurveyTemplate | undefined {
  return SURVEY_TEMPLATES.find((t) => t.key === key);
}

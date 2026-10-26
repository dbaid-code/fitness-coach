// PRD Appendix A: the fixed message catalog (canonical). FR-46: the UI shows only these templates,
// UI copy and database names; never agent text.

export const MESSAGE_CODES = [
  'SIGNUP_NOTICE',
  'APPLIED',
  'NOTE_APPLIED',
  'APPLIED_HEALTH_AREA',
  'APPLIED_HEALTH_LIGHTER',
  'PARTIAL',
  'NOT_POSSIBLE',
  'NOT_UNDERSTOOD',
  'NOT_UNDERSTOOD_NOTE',
  'OUT_OF_SCOPE_EDIT',
  'OUT_OF_SCOPE_NOTE',
  'RED_FLAG',
  'EDIT_LIMIT',
  'PLAN_LIMIT',
  'PHOTO_LIMIT',
  'PHOTO_NONE',
  'PHOTO_PARTIAL',
  'GENERATION_FAILED',
  'SPEND_CAP',
  'EXPIRED',
  'DISCARD_CONFIRM',
  'OVER_TIME_WARNING',
  'HEADER_USER',
  'HEADER_COACH',
  'HEADER_FIRST',
  'RECENCY_STRIP',
] as const;
export type MessageCode = (typeof MESSAGE_CODES)[number];

/** Templates without parameters, word for word. Parameterised codes are rendered in render-message.ts. */
export const STATIC_TEMPLATES = {
  // D-27 wording (amended by the handoff).
  SIGNUP_NOTICE:
    "Gym Coach is a workout planner, not medical advice. The app owner can see your data and the coach's activity logs (kept for 30 days) to fix problems and improve the app. Your notes and photos are processed by our AI provider, Anthropic.",
  APPLIED: 'Done. Your workout is updated.',
  NOTE_APPLIED: 'Planned with your note for today in mind.',
  APPLIED_HEALTH_LIGHTER: "Made today's workout lighter.",
  PARTIAL: "I made the changes I could. Some didn't fit your equipment or time.",
  NOT_POSSIBLE: "I couldn't make that change with your equipment or time today.",
  NOT_UNDERSTOOD: "I couldn't apply that. Try something like 'swap squats for lunges' or 'fewer exercises'.",
  NOT_UNDERSTOOD_NOTE: "I couldn't use your note, so I planned without it.",
  OUT_OF_SCOPE_EDIT: "I can only adjust your workout plan, so I've left it as is.",
  OUT_OF_SCOPE_NOTE: "I can only plan workouts, so I've set that note aside.",
  RED_FLAG:
    "That sounds like something to check with a doctor before you train. I won't plan a workout for this session.",
  EDIT_LIMIT: "You've used all 5 changes for this workout. Reset to start over.",
  PLAN_LIMIT: "You've planned 10 workouts today, which is the daily limit. Try again tomorrow.",
  PHOTO_LIMIT: "You've used today's 5 photo scans. Pick your equipment from the list instead.",
  PHOTO_NONE: "I couldn't identify equipment in those photos. Please pick from the list.",
  GENERATION_FAILED: "I couldn't build a plan this time. Try again or change your inputs.",
  SPEND_CAP: 'Coach is resting right now. Please try again later.',
  EXPIRED: "This workout expired. Plan a new one when you're ready.",
  DISCARD_CONFIRM: 'Discard your current workout?',
} as const satisfies Partial<Record<MessageCode, string>>;

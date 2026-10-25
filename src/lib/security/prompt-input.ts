// Hardening for user-typed text on its way to AG-2 (agent-ag2-input-guard.md §2, §6; engineering doc
// §8.12). AG-3 never receives user text; these helpers keep the AG-2 boundary tight:
// - normalizeUserText strips characters a reader can't see (zero-width, bidi overrides, controls)
//   that could hide instructions from the owner's log review while the model still reads them.
// - fenceUserText wraps the text in <user_text> and neutralises any tag the user typed, in any case
//   or spacing (the spec escapes only the exact `</user_text>`).
// - sanitizeTerm re-checks AG-2's free-form terms before they are used (§6 step 2).

// C0/C1 controls except tab and newline, soft hyphen, zero-width and bidi controls, BOM.
const INVISIBLE =
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u00AD\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/g;
const LINE_BREAKS = /\r\n?|[\u2028\u2029]/g;
const USER_TEXT_TAG = /<(\s*\/?\s*user_text\s*)>/gi;
const TERM = /^[\p{L}\p{N} '\-]+$/u;

/** Run before the length check and before AG-2; the result is what AG-2 sees and what agent_logs stores. */
export function normalizeUserText(text: string): string {
  return text.normalize('NFC').replace(LINE_BREAKS, '\n').replace(INVISIBLE, '').trim();
}

/** `</USER_TEXT >` → `<\/USER_TEXT >`, `<user_text>` → `<\user_text>`: still readable, never a tag. */
export function escapeUserTextTags(text: string): string {
  return text.replace(USER_TEXT_TAG, (_match, inner: string) =>
    inner.includes('/') ? `<${inner.replace('/', '\\/')}>` : `<\\${inner}>`,
  );
}

/** The user-content block for AG-2, exactly as agent-ag2-input-guard.md §2 shows it. */
export function fenceUserText(text: string): string {
  return `<user_text>\n${escapeUserTextTags(text)}\n</user_text>`;
}

/** A Term (`target_term`, `replacement_term`, `exercise_term`) or null when it is empty, too long or has other characters. */
export function sanitizeTerm(term: string | null, maxChars: number): string | null {
  if (term === null) return null;
  const trimmed = term.normalize('NFC').trim();
  if (trimmed.length === 0 || trimmed.length > maxChars || !TERM.test(trimmed)) return null;
  return trimmed;
}

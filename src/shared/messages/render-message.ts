// Renders a catalog code with structured params (messages-and-ui-copy.md §3). Every param is an enum
// value or an integer; display names come from labels.ts, never from the server (FR-46).
import { BODY_AREAS, MUSCLE_GROUPS, type BodyArea, type MuscleGroup } from '@/shared/constants';
import { STATIC_TEMPLATES, type MessageCode } from './catalog';
import { BODY_AREA_LABELS, MUSCLE_GROUP_LABELS } from './labels';

export type MessageParams = Record<string, string | number | string[]>;

export class MessageParamError extends Error {
  constructor(code: MessageCode, param: string) {
    super(`Invalid or missing param "${param}" for ${code}`);
    this.name = 'MessageParamError';
  }
}

/** 'A' | 'A & B' | 'A, B & C' */
export function formatList(names: string[]): string {
  if (names.length === 0) throw new Error('formatList needs at least one name');
  if (names.length === 1) return names[0]!;
  return `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}`;
}

function int(code: MessageCode, params: MessageParams | undefined, key: string, min: number): number {
  const v = params?.[key];
  if (typeof v !== 'number' || !Number.isInteger(v) || v < min) throw new MessageParamError(code, key);
  return v;
}

function enumList<T extends string>(
  code: MessageCode,
  params: MessageParams | undefined,
  key: string,
  allowed: readonly T[],
): T[] {
  const v = params?.[key];
  if (!Array.isArray(v) || v.length === 0 || !v.every((x) => (allowed as readonly string[]).includes(x))) {
    throw new MessageParamError(code, key);
  }
  return v as T[];
}

const groups = (code: MessageCode, params?: MessageParams) =>
  formatList(enumList<MuscleGroup>(code, params, 'groups', MUSCLE_GROUPS).map((g) => MUSCLE_GROUP_LABELS[g]));

const RECENCY_LABEL = /^(today|yesterday|([2-9]|[1-9]\d+) days ago)$/;

export function renderMessage(code: MessageCode, params?: MessageParams): string {
  switch (code) {
    case 'APPLIED_HEALTH_AREA': {
      const areas = enumList<BodyArea>(code, params, 'body_areas', BODY_AREAS);
      return `Adjusted today's workout to go easy on your ${formatList(areas.map((a) => BODY_AREA_LABELS[a]))}.`;
    }
    case 'PHOTO_PARTIAL': {
      const n = int(code, params, 'n', 1);
      return `Found ${n} ${n === 1 ? 'item' : 'items'}. Check the list and add anything I missed.`;
    }
    case 'OVER_TIME_WARNING': {
      const m = int(code, params, 'm', 1);
      const t = int(code, params, 't', 1);
      return `This workout now runs about ${m} min — longer than your ${t} min.`;
    }
    case 'HEADER_USER':
      return `${groups(code, params)} · ${int(code, params, 't', 1)} min`;
    case 'HEADER_COACH': {
      const picked = groups(code, params);
      if (params?.n === undefined) return `Coach picked ${picked} — not trained yet`;
      const n = int(code, params, 'n', 1);
      return `Coach picked ${picked} — rested at least ${n} ${n === 1 ? 'day' : 'days'}`;
    }
    case 'HEADER_FIRST':
      return `First workout — starting with ${groups(code, params)}`;
    case 'RECENCY_STRIP': {
      const variant = params?.variant;
      if (variant === 'none_ever') return 'No workouts logged yet';
      // D-29
      if (variant === 'none_recent') return 'Last trained: nothing in the last 14 days';
      if (variant !== 'entries') throw new MessageParamError(code, 'variant');
      const gs = enumList<MuscleGroup>(code, params, 'groups', MUSCLE_GROUPS);
      const labels = params?.labels;
      if (
        !Array.isArray(labels) ||
        labels.length !== gs.length ||
        !labels.every((l) => typeof l === 'string' && RECENCY_LABEL.test(l))
      ) {
        throw new MessageParamError(code, 'labels');
      }
      return `Last trained: ${gs.map((g, i) => `${MUSCLE_GROUP_LABELS[g]} ${labels[i]}`).join(' · ')}`;
    }
    default:
      return STATIC_TEMPLATES[code];
  }
}

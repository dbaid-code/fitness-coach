import { HARD_BOUNDS } from '@/shared/constants';
import type { PlanDto, PlanItemDto } from '@/shared/schemas/api/plans';
import { cardSeconds, toMinutes } from '@/shared/time-model/time-model';

// Direct-edit working copy (plan-direct-edits.md §3). Totals are recomputed with the shared time model
// after every action, so the phone shows the new total within one frame (PRD §12.3).

export type PendingDelete = { item: PlanItemDto; index: number; expiresAt: number };
export type EditorState = {
  plan: PlanDto;
  items: PlanItemDto[];
  pendingDelete: PendingDelete | null;
  dirty: boolean;
};
export type EditorAction =
  | { type: 'init'; plan: PlanDto }
  | { type: 'set_sets' | 'set_reps' | 'set_time'; itemId: string; value: number }
  | { type: 'delete'; itemId: string; now: number }
  | { type: 'undo_delete' }
  | { type: 'commit_delete' }
  | { type: 'move'; itemId: string; toMainIndex: number }
  | { type: 'server_replace'; plan: PlanDto }
  /** A PATCH answered while newer local changes exist: take the new version, keep the working copy. */
  | { type: 'adopt_version'; version: number; expiresAt: string | null };

export const UNDO_WINDOW_MS = 5_000;

const clamp = (v: number, b: { min: number; max: number }) => Math.min(b.max, Math.max(b.min, Math.round(v)));

function itemSeconds(it: PlanItemDto): number {
  if (it.card_type === 'activity' || !it.time_model) return it.total_time_s;
  const params = {
    secondsPerRep: it.time_model.seconds_per_rep,
    restS: it.time_model.rest_s,
    setupS: it.time_model.setup_s,
  };
  return it.card_type === 'reps'
    ? cardSeconds({ cardType: 'reps', sets: it.sets ?? 1, reps: it.reps ?? 1, params })
    : cardSeconds({ cardType: 'timed', sets: it.sets ?? 1, timePerSetS: it.time_per_set_s ?? 5, params });
}

/** Positions 1..n in order; card and plan totals from exact seconds. */
function withTotals(state: EditorState, items: PlanItemDto[], dirty = true): EditorState {
  const positioned = items.map((it, i) => {
    const total = itemSeconds(it);
    return { ...it, position: i + 1, total_time_s: total, total_time_min: toMinutes(total) };
  });
  const totalS = positioned.reduce((a, it) => a + it.total_time_s, 0);
  return {
    ...state,
    items: positioned,
    dirty,
    plan: {
      ...state.plan,
      total_time_s: totalS,
      total_time_min: toMinutes(totalS),
      over_time: totalS > state.plan.session_length_min * 60,
    },
  };
}

export const mainItems = (items: PlanItemDto[]) => items.filter((i) => i.kind === 'exercise');

export function initEditor(plan: PlanDto): EditorState {
  return { plan, items: [...plan.items].sort((a, b) => a.position - b.position), pendingDelete: null, dirty: false };
}

export function planEditorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case 'init':
    case 'server_replace':
      return initEditor(action.plan);
    case 'set_sets':
    case 'set_reps':
    case 'set_time': {
      const items = state.items.map((it) => {
        if (it.id !== action.itemId || it.kind !== 'exercise') return it;
        if (action.type === 'set_sets') return { ...it, sets: clamp(action.value, HARD_BOUNDS.sets) };
        if (action.type === 'set_reps' && it.card_type === 'reps')
          return { ...it, reps: clamp(action.value, HARD_BOUNDS.reps) };
        if (action.type === 'set_time' && it.card_type === 'timed')
          return { ...it, time_per_set_s: clamp(action.value, HARD_BOUNDS.timePerSetS) };
        return it;
      });
      return withTotals(state, items);
    }
    case 'delete': {
      // At least one main item must remain.
      if (mainItems(state.items).length <= 1) return state;
      const index = state.items.findIndex((it) => it.id === action.itemId && it.kind === 'exercise');
      if (index === -1) return state;
      // A delete while another is pending commits the earlier one first.
      const items = state.items.filter((_, i) => i !== index);
      return {
        ...withTotals(state, items),
        pendingDelete: { item: state.items[index]!, index, expiresAt: action.now + UNDO_WINDOW_MS },
      };
    }
    case 'undo_delete': {
      if (!state.pendingDelete) return state;
      const items = [...state.items];
      items.splice(state.pendingDelete.index, 0, state.pendingDelete.item);
      return { ...withTotals(state, items), pendingDelete: null };
    }
    case 'adopt_version':
      return { ...state, plan: { ...state.plan, version: action.version, expires_at: action.expiresAt } };
    case 'commit_delete':
      return state.pendingDelete ? { ...state, pendingDelete: null, dirty: true } : state;
    case 'move': {
      const mains = mainItems(state.items);
      const from = mains.findIndex((m) => m.id === action.itemId);
      const to = Math.min(mains.length - 1, Math.max(0, action.toMainIndex));
      if (from === -1 || from === to) return state;
      const [moved] = mains.splice(from, 1);
      mains.splice(to, 0, moved!);
      const warmup = state.items.filter((i) => i.kind === 'warmup');
      const cooldown = state.items.filter((i) => i.kind === 'cooldown');
      return withTotals(state, [...warmup, ...mains, ...cooldown]);
    }
  }
}

/**
 * The PATCH body (§4): main items in order, a pending-deleted item still at its original index so Undo
 * always works (the deletion is sent only once committed).
 */
export function patchPayload(state: EditorState) {
  const items = [...state.items];
  if (state.pendingDelete) items.splice(state.pendingDelete.index, 0, state.pendingDelete.item);
  return {
    version: state.plan.version,
    items: mainItems(items).map((i) => ({
      id: i.id,
      sets: i.sets ?? 1,
      reps: i.card_type === 'reps' ? i.reps : null,
      time_per_set_s: i.card_type === 'timed' ? i.time_per_set_s : null,
    })),
  };
}

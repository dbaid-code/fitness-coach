import { describe, expect, it } from 'vitest';
import type { PlanDto, PlanItemDto } from '@/shared/schemas/api/plans';
import { cardSeconds, planTotals, resolveTimeParams } from '@/shared/time-model/time-model';
import { initEditor, mainItems, patchPayload, planEditorReducer as r, UNDO_WINDOW_MS } from './plan-editor-reducer';

const tm = { seconds_per_rep: 3, rest_s: 60, setup_s: 30 };
const item = (id: string, position: number, over: Partial<PlanItemDto> = {}): PlanItemDto => ({
  id,
  position,
  kind: 'exercise',
  card_type: 'reps',
  exercise_id: id,
  routine_id: null,
  name: id,
  muscle_group: 'chest',
  sets: 3,
  reps: 10,
  time_per_set_s: null,
  total_time_s: 240,
  total_time_min: 4,
  origin: 'agent',
  time_model: tm,
  ...over,
});
const activity = (id: string, position: number, kind: 'warmup' | 'cooldown') =>
  item(id, position, {
    kind,
    card_type: 'activity',
    exercise_id: null,
    routine_id: id,
    sets: null,
    reps: null,
    total_time_s: 300,
    total_time_min: 5,
    muscle_group: null,
    time_model: null,
  });

const plan: PlanDto = {
  id: '00000000-0000-4000-8000-000000000001',
  status: 'draft',
  version: 3,
  session_length_min: 30,
  focus: { mode: 'user', groups: ['chest'], reason: 'user_selected' },
  header: { code: 'HEADER_USER', params: { groups: ['chest'], t: 30 } },
  items: [
    activity('w', 1, 'warmup'),
    item('a', 2),
    item('b', 3, { card_type: 'timed', reps: null, time_per_set_s: 30, total_time_s: 240 }),
    item('c', 4),
    activity('cd', 5, 'cooldown'),
  ],
  total_time_s: 1320,
  total_time_min: 22,
  over_time: false,
  short_session: false,
  text_edits_used: 0,
  text_edits_remaining: 5,
  created_at: '2026-10-26T00:00:00.000Z',
  last_changed_at: '2026-10-26T00:00:00.000Z',
  accepted_at: null,
  expires_at: '2026-10-26T12:00:00.000Z',
};

const expectedTotal = (items: PlanItemDto[]) =>
  planTotals(
    items.map((i) =>
      i.card_type === 'activity'
        ? { cardType: 'activity' as const }
        : i.card_type === 'reps'
          ? { cardType: 'reps' as const, sets: i.sets!, reps: i.reps!, params: resolveTimeParams(tm) }
          : {
              cardType: 'timed' as const,
              sets: i.sets!,
              timePerSetS: i.time_per_set_s!,
              params: resolveTimeParams(tm),
            },
    ),
  );

describe('UF-8 plan editor reducer', () => {
  const s0 = initEditor(plan);

  it('FR-50: steppers recompute the card and plan totals with the shared time model', () => {
    const s = r(s0, { type: 'set_sets', itemId: 'a', value: 5 });
    const a = s.items.find((i) => i.id === 'a')!;
    expect(a.total_time_s).toBe(cardSeconds({ cardType: 'reps', sets: 5, reps: 10, params: resolveTimeParams(tm) }));
    expect(s.plan.total_time_s).toBe(expectedTotal(s.items).totalS);
    expect(s.plan.total_time_min).toBe(expectedTotal(s.items).totalMin);
    expect(s.dirty).toBe(true);
  });

  it('values clamp at the Appendix B bounds; reps only on reps cards, time only on timed', () => {
    expect(r(s0, { type: 'set_sets', itemId: 'a', value: 99 }).items[1]!.sets).toBe(10);
    expect(r(s0, { type: 'set_reps', itemId: 'a', value: 0 }).items[1]!.reps).toBe(1);
    expect(r(s0, { type: 'set_time', itemId: 'b', value: 1 }).items[2]!.time_per_set_s).toBe(5);
    expect(r(s0, { type: 'set_reps', itemId: 'b', value: 12 }).items[2]!.reps).toBeNull();
    expect(r(s0, { type: 'set_time', itemId: 'a', value: 40 }).items[1]!.time_per_set_s).toBeNull();
  });

  it('OVER_TIME: over_time flips when the total passes the session length', () => {
    let s = s0;
    for (const id of ['a', 'c']) s = r(s, { type: 'set_sets', itemId: id, value: 10 });
    expect(s.plan.over_time).toBe(true);
  });

  it('delete + undo restores the row at its index; the PATCH keeps the pending item until commit', () => {
    const d = r(s0, { type: 'delete', itemId: 'b', now: 1000 });
    expect(mainItems(d.items).map((i) => i.id)).toEqual(['a', 'c']);
    expect(d.pendingDelete).toMatchObject({ index: 2, expiresAt: 1000 + UNDO_WINDOW_MS });
    expect(patchPayload(d).items.map((i) => i.id)).toEqual(['a', 'b', 'c']);
    const u = r(d, { type: 'undo_delete' });
    expect(u.items.map((i) => i.id)).toEqual(['w', 'a', 'b', 'c', 'cd']);
    const c = r(d, { type: 'commit_delete' });
    expect(patchPayload(c).items.map((i) => i.id)).toEqual(['a', 'c']);
    expect(c.items.map((i) => i.position)).toEqual([1, 2, 3, 4]);
  });

  it('the last main item cannot be deleted', () => {
    let s = r(s0, { type: 'delete', itemId: 'a', now: 0 });
    s = r(r(s, { type: 'commit_delete' }), { type: 'delete', itemId: 'b', now: 0 });
    s = r(s, { type: 'commit_delete' });
    expect(r(s, { type: 'delete', itemId: 'c', now: 0 })).toBe(s);
  });

  it('move stays among main items: warm-up first, cool-down last', () => {
    const m = r(s0, { type: 'move', itemId: 'c', toMainIndex: -5 });
    expect(m.items.map((i) => i.id)).toEqual(['w', 'c', 'a', 'b', 'cd']);
    const n = r(s0, { type: 'move', itemId: 'a', toMainIndex: 99 });
    expect(n.items.map((i) => i.id)).toEqual(['w', 'b', 'c', 'a', 'cd']);
    expect(r(s0, { type: 'move', itemId: 'w', toMainIndex: 1 })).toBe(s0);
  });

  it('payload: reps cards send time null and timed cards send reps null', () => {
    expect(patchPayload(s0)).toEqual({
      version: 3,
      items: [
        { id: 'a', sets: 3, reps: 10, time_per_set_s: null },
        { id: 'b', sets: 3, reps: null, time_per_set_s: 30 },
        { id: 'c', sets: 3, reps: 10, time_per_set_s: null },
      ],
    });
  });

  it('server_replace resets the working copy; adopt_version keeps local changes', () => {
    const s = r(s0, { type: 'set_sets', itemId: 'a', value: 4 });
    const v = r(s, { type: 'adopt_version', version: 4, expiresAt: null });
    expect(v.plan.version).toBe(4);
    expect(v.items[1]!.sets).toBe(4);
    const back = r(s, { type: 'server_replace', plan });
    expect(back.dirty).toBe(false);
    expect(back.items[1]!.sets).toBe(3);
  });
});

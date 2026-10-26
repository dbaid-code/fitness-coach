import { describe, expect, it } from 'vitest';
import { ex, routine } from '../../../../tests/fixtures/domain';
import type { MuscleGroup } from '@/shared/constants';
import type { WorkoutPlannerOutput } from '@/shared/schemas/domain/workout-plan';
import type { ProgressionTarget } from '../progression/progression';
import type { Exercise } from '../types';
import { validatePlan, type ValidationContext } from './plan-validator';

// 45 min plan window 2295–2700 s; main window 1695–2100 s.
// build_muscle + moderately_regular new reps card 3 × 10 = 90 + 120 + 30 = 240 s.
const exercises: Exercise[] = [
  ex('bench', { muscleGroup: 'chest', requiredEquipment: ['barbell'] }),
  ex('push_up', { muscleGroup: 'chest', bodyAreasStressed: ['wrists'] }),
  ex('fly', { muscleGroup: 'chest', mechanic: 'isolation' }),
  ex('dip', { muscleGroup: 'triceps' }),
  ex('pushdown', { muscleGroup: 'triceps', mechanic: 'isolation' }),
  ex('skull', { muscleGroup: 'triceps', mechanic: 'isolation' }),
  ex('kick', { muscleGroup: 'triceps', mechanic: 'isolation' }),
  ex('close_grip', { muscleGroup: 'triceps' }),
  ex('squat', { muscleGroup: 'legs' }),
  ex('plank', { muscleGroup: 'core', cardType: 'timed', timedKind: 'hold' }),
  ex('bike', { muscleGroup: 'cardio', cardType: 'timed', timedKind: 'continuous' }),
];
const byId = new Map(exercises.map((e) => [e.id, e]));
const routines = [routine('warmup_upper'), routine('cooldown_upper'), routine('warmup_old', { isActive: false })];

function ctx(over: Partial<ValidationContext> = {}): ValidationContext {
  return {
    mode: 'generate',
    sessionLengthMin: 45,
    goal: 'build_muscle',
    experience: 'moderately_regular',
    candidates: new Map(byId),
    exercisesById: byId,
    routinesById: new Map(routines.map((r) => [r.id, r])),
    availableEquipment: new Set(['barbell']),
    avoidedBodyAreas: new Set(),
    effectiveFocus: { mode: 'user', groups: ['chest', 'triceps'] },
    rule48hRelaxed: false,
    groupsTrainedWithin48h: new Set(),
    progressionTargets: new Map(),
    historyExerciseIds: new Set(),
    currentIntents: [],
    sessionIntents: [],
    reset: null,
    inputPlan: null,
    ...over,
  };
}

const item = (exercise_id: string, sets = 3, reps: number | null = 10, time: number | null = null) => ({
  exercise_id,
  card_type: (time !== null ? 'timed' : 'reps') as 'reps' | 'timed',
  sets,
  reps: time !== null ? null : reps,
  time_per_set_s: time,
});

// 8 × 240 = 1920 s main → 2520 s total.
const MAIN = ['bench', 'push_up', 'fly', 'dip', 'pushdown', 'skull', 'kick', 'close_grip'];
function plan(over: Partial<WorkoutPlannerOutput> = {}): WorkoutPlannerOutput {
  return {
    focus_groups: ['chest', 'triceps'] as MuscleGroup[],
    focus_reason: 'user_selected',
    warmup_routine_id: 'warmup_upper',
    cooldown_routine_id: 'cooldown_upper',
    items: MAIN.map((id) => item(id)),
    applied_intents: [],
    unapplied_intents: [],
    ...over,
  };
}

const failed = (r: ReturnType<typeof validatePlan>) =>
  r.results.filter((x) => !x.passed).map((x) => `${x.check}:${x.detail_code}`);

describe('EV-1 plan validator', () => {
  it('a valid generate plan passes every check', () => {
    const r = validatePlan(plan(), ctx());
    expect(failed(r)).toEqual([]);
    expect(r.passed).toBe(true);
    expect(r.results.map((x) => x.check)).toEqual([
      'V-1',
      'V-2',
      'V-3',
      'V-4',
      'V-5',
      'V-6',
      'V-7',
      'V-8',
      'V-9',
      'V-10',
      'V-11',
    ]);
  });

  it('V-1: not in candidates, unknown or inactive or wrong-type routines', () => {
    const c = ctx({ candidates: new Map([...byId].filter(([id]) => id !== 'fly')) });
    expect(failed(validatePlan(plan(), c))).toContain('V-1:not_in_candidates');
    expect(failed(validatePlan(plan({ warmup_routine_id: 'nope' }), ctx()))).toContain('V-1:unknown_warmup');
    expect(failed(validatePlan(plan({ warmup_routine_id: 'warmup_old' }), ctx()))).toContain('V-1:unknown_warmup');
    expect(failed(validatePlan(plan({ warmup_routine_id: 'cooldown_upper' }), ctx()))).toContain('V-1:unknown_warmup');
    expect(failed(validatePlan(plan({ cooldown_routine_id: 'warmup_upper' }), ctx()))).toContain(
      'V-1:unknown_cooldown',
    );
    expect(failed(validatePlan(plan({ cooldown_routine_id: 'x' }), ctx()))).toContain('V-1:unknown_cooldown');
  });

  it('V-2: missing equipment', () => {
    const r = validatePlan(plan(), ctx({ availableEquipment: new Set() }));
    expect(r.results.find((x) => x.check === 'V-2')).toMatchObject({
      passed: false,
      detail_code: 'missing_equipment',
      item_indices: [0],
      values: { missing: ['barbell'] },
    });
  });

  it('V-3: stresses an avoided area', () => {
    const r = validatePlan(plan(), ctx({ avoidedBodyAreas: new Set(['wrists']) }));
    expect(r.results.find((x) => x.check === 'V-3')).toMatchObject({
      detail_code: 'stresses_avoided_area',
      values: { areas: ['wrists'] },
    });
  });

  it('V-4: outside focus, cardio not allowed, focus group not available (coach)', () => {
    const p = plan({ items: [...MAIN.slice(0, 7).map((id) => item(id)), item('squat')] });
    expect(failed(validatePlan(p, ctx()))).toContain('V-4:outside_focus');
    const withBike = plan({ items: [...MAIN.slice(0, 6).map((id) => item(id)), item('bike', 1, null, 600)] });
    expect(failed(validatePlan(withBike, ctx()))).toContain('V-4:cardio_not_allowed');
    const coach = ctx({
      effectiveFocus: { mode: 'coach' },
      candidates: new Map([...byId].filter(([, e]) => e.muscleGroup !== 'legs')),
    });
    expect(failed(validatePlan(plan({ focus_groups: ['chest', 'legs'] }), coach))).toContain(
      'V-4:focus_group_not_available',
    );
  });

  it('V-4: cardio allowed when in focus, or coach + lose weight', () => {
    const withBike = (groups: MuscleGroup[]) =>
      plan({ focus_groups: groups, items: [...MAIN.slice(0, 6).map((id) => item(id)), item('bike', 1, null, 600)] });
    const r1 = validatePlan(
      withBike(['chest', 'triceps', 'cardio']),
      ctx({ effectiveFocus: { mode: 'user', groups: ['chest', 'triceps', 'cardio'] } }),
    );
    expect(r1.results.find((x) => x.check === 'V-4')!.passed).toBe(true);
    const r2 = validatePlan(
      withBike(['chest', 'triceps']),
      ctx({ effectiveFocus: { mode: 'coach' }, goal: 'lose_weight' }),
    );
    expect(r2.results.find((x) => x.check === 'V-4')!.passed).toBe(true);
  });

  it('V-5: coach focus on a group trained within 48 h; passes when relaxed or user mode', () => {
    const c = ctx({ effectiveFocus: { mode: 'coach' }, groupsTrainedWithin48h: new Set(['chest']) });
    expect(failed(validatePlan(plan(), c))).toContain('V-5:trained_within_48h');
    expect(failed(validatePlan(plan(), { ...c, rule48hRelaxed: true }))).not.toContain('V-5:trained_within_48h');
    expect(failed(validatePlan(plan(), ctx({ groupsTrainedWithin48h: new Set(['chest']) })))).toEqual([]);
  });

  it('V-6: card type mismatch, field mismatch, out of bounds', () => {
    const mismatch = plan({
      items: [
        ...MAIN.slice(0, 7).map((id) => item(id)),
        { ...item('close_grip'), card_type: 'timed', reps: null, time_per_set_s: 30 },
      ],
    });
    expect(failed(validatePlan(mismatch, ctx()))).toContain('V-6:card_type_mismatch');
    const fields = plan({
      items: [...MAIN.slice(0, 7).map((id) => item(id)), { ...item('close_grip'), time_per_set_s: 30 }],
    });
    expect(failed(validatePlan(fields, ctx()))).toContain('V-6:fields_mismatch');
    const timedFields = plan({
      items: [...MAIN.slice(0, 7).map((id) => item(id)), { ...item('plank', 3, null, 30), reps: 5 }],
    });
    expect(
      failed(
        validatePlan(timedFields, ctx({ effectiveFocus: { mode: 'user', groups: ['chest', 'triceps', 'core'] } })),
      ),
    ).toContain('V-6:fields_mismatch');
    expect(
      failed(validatePlan(plan({ items: [...MAIN.slice(0, 7).map((id) => item(id)), item('close_grip', 11)] }), ctx())),
    ).toContain('V-6:out_of_bounds');
    expect(
      failed(
        validatePlan(plan({ items: [...MAIN.slice(0, 7).map((id) => item(id)), item('close_grip', 3, 51)] }), ctx()),
      ),
    ).toContain('V-6:out_of_bounds');
    const timedBounds = plan({ items: [...MAIN.slice(0, 7).map((id) => item(id)), item('plank', 3, null, 4)] });
    expect(
      failed(
        validatePlan(timedBounds, ctx({ effectiveFocus: { mode: 'user', groups: ['chest', 'triceps', 'core'] } })),
      ),
    ).toContain('V-6:out_of_bounds');
  });

  it('V-7: progression mismatch, start out of range, hold start, newbie minimum sets', () => {
    const target: ProgressionTarget = {
      exercise_id: 'bench',
      action: 'step_up',
      sets: 3,
      reps: 12,
      time_per_set_s: null,
      replaces: null,
    };
    expect(failed(validatePlan(plan(), ctx({ progressionTargets: new Map([['bench', target]]) })))).toContain(
      'V-7:progression_mismatch',
    );
    expect(
      failed(
        validatePlan(
          plan({ items: [item('bench', 3, 12), ...MAIN.slice(1).map((id) => item(id))] }),
          ctx({ progressionTargets: new Map([['bench', target]]) }),
        ),
      ),
    ).not.toContain('V-7:progression_mismatch');
    expect(
      failed(validatePlan(plan({ items: [item('bench', 3, 13), ...MAIN.slice(1).map((id) => item(id))] }), ctx())),
    ).toContain('V-7:start_out_of_range');
    expect(failed(validatePlan(plan(), ctx({ experience: 'newbie' })))).toEqual([]);
    expect(
      failed(
        validatePlan(
          plan({ items: [item('bench', 4), ...MAIN.slice(1).map((id) => item(id))] }),
          ctx({ experience: 'newbie' }),
        ),
      ),
    ).toContain('V-7:start_out_of_range');
    const core = ctx({ effectiveFocus: { mode: 'user', groups: ['chest', 'triceps', 'core'] } });
    expect(
      failed(
        validatePlan(plan({ items: [...MAIN.slice(0, 7).map((id) => item(id)), item('plank', 3, null, 30)] }), core),
      ),
    ).not.toContain('V-7:start_out_of_range');
    expect(
      failed(
        validatePlan(plan({ items: [...MAIN.slice(0, 7).map((id) => item(id)), item('plank', 3, null, 40)] }), core),
      ),
    ).toContain('V-7:start_out_of_range');
  });

  it('V-7: continuous cardio needs 1 set of 300–1800 s', () => {
    const c = ctx({ effectiveFocus: { mode: 'user', groups: ['chest', 'triceps', 'cardio'] } });
    const mk = (sets: number, t: number) =>
      plan({
        focus_groups: ['chest', 'triceps', 'cardio'],
        items: [...MAIN.slice(0, 6).map((id) => item(id)), item('bike', sets, null, t)],
      });
    expect(failed(validatePlan(mk(1, 600), c))).toEqual([]);
    expect(failed(validatePlan(mk(2, 600), c))).toContain('V-7:cardio_out_of_range');
    expect(failed(validatePlan(mk(1, 200), c))).toContain('V-7:cardio_out_of_range');
  });

  it('V-7: request override direction (whole plan and item), new exercise baseline', () => {
    const lighter = {
      intent_id: 1,
      intent: {
        type: 'adjust_volume' as const,
        direction: 'lighter' as const,
        scope: 'whole_plan' as const,
        target_ref: null,
        reason: 'health' as const,
      },
    };
    const target: ProgressionTarget = {
      exercise_id: 'bench',
      action: 'hold',
      sets: 3,
      reps: 10,
      time_per_set_s: null,
      replaces: null,
    };
    const base = { currentIntents: [lighter], progressionTargets: new Map([['bench', target]]) };
    // Every item must move lighter; 3 × 10 is not lighter than the new-exercise baseline 3 × 8.
    expect(failed(validatePlan(plan({ applied_intents: [1] }), ctx(base)))).toContain('V-7:override_wrong_direction');
    const lighterItems = plan({
      applied_intents: [1],
      items: MAIN.map((id) => item(id, 2, 8))
        .concat([item('squat', 2, 7)])
        .slice(0, 8),
    });
    const r = validatePlan(
      {
        ...lighterItems,
        items: [item('bench', 2, 10), ...MAIN.slice(1).map((id) => item(id, 3, 7)), item('squat', 2, 8)],
      },
      ctx({ ...base, effectiveFocus: { mode: 'user', groups: ['chest', 'triceps', 'legs'] }, sessionLengthMin: 30 }),
    );
    expect(r.results.find((x) => x.check === 'V-7')).toMatchObject({ passed: true });
    // Out of hard bounds is a wrong direction too.
    const tooLow = plan({
      applied_intents: [1],
      items: [item('bench', 0, 10), ...MAIN.slice(1).map((id) => item(id, 3, 7))],
    });
    expect(failed(validatePlan(tooLow, ctx(base)))).toContain('V-7:override_wrong_direction');
    // Harder on a hold.
    const harder = { intent_id: 1, intent: { ...lighter.intent, direction: 'harder' as const } };
    const core = {
      effectiveFocus: { mode: 'user' as const, groups: ['chest', 'triceps', 'core'] as MuscleGroup[] },
      currentIntents: [harder],
    };
    const holdHarder = plan({
      applied_intents: [1],
      items: [...MAIN.slice(0, 7).map((id) => item(id, 3, 9)), item('plank', 3, null, 40)],
    });
    expect(validatePlan(holdHarder, ctx(core)).results.find((x) => x.check === 'V-7')!.passed).toBe(true);
    const holdSame = plan({
      applied_intents: [1],
      items: [...MAIN.slice(0, 7).map((id) => item(id, 3, 9)), item('plank', 3, null, 30)],
    });
    expect(failed(validatePlan(holdSame, ctx(core)))).toContain('V-7:override_wrong_direction');
    const holdTarget: ProgressionTarget = {
      exercise_id: 'plank',
      action: 'hold',
      sets: 3,
      reps: null,
      time_per_set_s: 40,
      replaces: null,
    };
    const holdHarderTarget = plan({
      applied_intents: [1],
      items: [...MAIN.slice(0, 7).map((id) => item(id, 3, 9)), item('plank', 3, null, 50)],
    });
    expect(
      validatePlan(
        holdHarderTarget,
        ctx({ ...core, progressionTargets: new Map([['plank', holdTarget]]) }),
      ).results.find((x) => x.check === 'V-7')!.passed,
    ).toBe(true);
  });

  it('V-8: below and above the window', () => {
    expect(failed(validatePlan(plan({ items: MAIN.slice(0, 6).map((id) => item(id)) }), ctx()))).toContain(
      'V-8:below_window',
    );
    const r = validatePlan(
      plan({ items: [...MAIN.map((id) => item(id)), item('squat')] }),
      ctx({ effectiveFocus: { mode: 'user', groups: ['chest', 'triceps', 'legs'] }, sessionLengthMin: 45 }),
    );
    expect(r.results.find((x) => x.check === 'V-8')).toMatchObject({
      passed: false,
      detail_code: 'above_window',
      values: { total_s: 2760, min_s: 2295, max_s: 2700 },
    });
  });

  it('V-8 edit mode (D-04): input 120 s over, output 60 s over → passes; worse → fails', () => {
    const inputItems = MAIN.map((id, i) => ({
      ref: i + 1,
      exerciseId: id,
      sets: 3,
      reps: 10,
      timePerSetS: null,
      origin: 'agent' as const,
    }));
    const edit = (totalS: number) => ctx({ mode: 'edit', inputPlan: { items: inputItems, totalS } });
    // Output: 8 × 240 + one 3 × 10 card with seconds_per_rep defaults (240) = 2760 = 60 over.
    const out = plan({ items: [...MAIN.map((id) => item(id)), item('squat')] });
    const legs = { effectiveFocus: { mode: 'user' as const, groups: ['chest', 'triceps', 'legs'] as MuscleGroup[] } };
    expect(validatePlan(out, { ...edit(2820), ...legs }).results.find((x) => x.check === 'V-8')!.passed).toBe(true);
    expect(validatePlan(out, { ...edit(2720), ...legs }).results.find((x) => x.check === 'V-8')!.passed).toBe(false);
    expect(validatePlan(out, { ...edit(2500), ...legs }).results.find((x) => x.check === 'V-8')!.passed).toBe(false);
  });

  it('V-9: too similar after reset; relaxes to the new candidates available (D-05)', () => {
    expect(failed(validatePlan(plan(), ctx({ reset: { discardedExerciseIds: MAIN.slice(0, 5) } })))).toContain(
      'V-9:too_similar_after_reset',
    );
    expect(failed(validatePlan(plan(), ctx({ reset: { discardedExerciseIds: MAIN.slice(0, 4) } })))).toEqual([]);
    // Only one candidate is new: one new exercise is enough.
    const fewNew = new Map([...byId].filter(([id]) => MAIN.includes(id) || id === 'squat'));
    const c = ctx({
      candidates: fewNew,
      reset: { discardedExerciseIds: MAIN },
      effectiveFocus: { mode: 'user', groups: ['chest', 'triceps', 'legs'] },
    });
    expect(
      validatePlan(plan({ items: [...MAIN.slice(0, 7).map((id) => item(id)), item('squat')] }), c).results.find(
        (x) => x.check === 'V-9',
      )!.passed,
    ).toBe(true);
  });

  it('V-10: schema failure skips the other checks', () => {
    const r = validatePlan({ ...plan(), extra: 1 }, ctx());
    expect(r.plan).toBeNull();
    expect(failed(r)[0]).toBe('V-10:schema');
    expect(r.results.filter((x) => x.detail_code === 'not_run')).toHaveLength(10);
    expect(failed(validatePlan(null, ctx()))[0]).toBe('V-10:schema');
  });

  it('V-10: item count, duplicates, intent reporting', () => {
    expect(failed(validatePlan({ ...plan(), items: [] }, ctx()))[0]).toBe('V-10:item_count');
    expect(failed(validatePlan({ ...plan(), items: Array.from({ length: 13 }, () => item('bench')) }, ctx()))[0]).toBe(
      'V-10:item_count',
    );
    expect(
      failed(
        validatePlan(plan({ items: [item('bench'), item('bench'), ...MAIN.slice(2).map((id) => item(id))] }), ctx()),
      ),
    ).toContain('V-10:duplicate_exercise');
    const swap = {
      intent_id: 3,
      intent: { type: 'remove_exercise' as const, target_ref: null, target_term: 'squats' },
    };
    const area = { intent_id: 4, intent: { type: 'avoid_body_area' as const, body_areas: ['knees' as const] } };
    expect(failed(validatePlan(plan({ applied_intents: [9] }), ctx({ currentIntents: [swap] })))).toContain(
      'V-10:unknown_intent',
    );
    expect(
      failed(
        validatePlan(
          plan({ applied_intents: [3], unapplied_intents: [{ intent_id: 3, reason: 'time' }] }),
          ctx({ currentIntents: [swap] }),
        ),
      ),
    ).toContain('V-10:intent_reported_twice');
    expect(failed(validatePlan(plan(), ctx({ currentIntents: [swap, area] })))).toContain('V-10:intent_unreported');
    expect(
      failed(
        validatePlan(
          plan({ unapplied_intents: [{ intent_id: 3, reason: 'not_available' }] }),
          ctx({ currentIntents: [swap, area] }),
        ),
      ),
    ).toEqual([]);
  });

  describe('V-11 user edits (FR-53, D-16)', () => {
    const inputItems = MAIN.map((id, i) => ({
      ref: i + 1,
      exerciseId: id,
      sets: 3,
      reps: 10,
      timePerSetS: null,
      origin: (i === 1 ? 'user_edit' : 'agent') as 'agent' | 'user_edit',
    }));
    const edit = (over: Partial<ValidationContext> = {}) =>
      ctx({ mode: 'edit', inputPlan: { items: inputItems, totalS: 2520 }, ...over });

    it('passes when the user edit is kept; generate mode never checks', () => {
      expect(failed(validatePlan(plan(), edit()))).toEqual([]);
    });

    it('fails when a user edit changed or was removed', () => {
      const changed = plan({ items: MAIN.map((id) => (id === 'push_up' ? item(id, 3, 12) : item(id))) });
      expect(failed(validatePlan(changed, edit()))).toContain('V-11:user_edit_changed');
      const removed = plan({ items: [...MAIN.filter((id) => id !== 'push_up').map((id) => item(id)), item('fly2')] });
      expect(
        failed(
          validatePlan(
            removed,
            edit({
              candidates: new Map([...byId, ['fly2', ex('fly2')]]),
              exercisesById: new Map([...byId, ['fly2', ex('fly2')]]),
            }),
          ),
        ),
      ).toContain('V-11:user_edit_removed');
    });

    it('exception (a): an applied intent targets it', () => {
      const swap = {
        intent_id: 1,
        intent: { type: 'swap_exercise' as const, target_ref: 2, target_term: null, replacement_term: null },
      };
      const swapped = plan({
        applied_intents: [1],
        items: MAIN.map((id) => (id === 'push_up' ? item('squat') : item(id))),
      });
      const legs = { effectiveFocus: { mode: 'user' as const, groups: ['chest', 'triceps', 'legs'] as MuscleGroup[] } };
      expect(
        validatePlan(swapped, edit({ currentIntents: [swap], ...legs })).results.find((x) => x.check === 'V-11')!
          .passed,
      ).toBe(true);
      const reorder = { intent_id: 1, intent: { type: 'reorder' as const, target_ref: 2, new_position: 1 } };
      const volume = {
        intent_id: 1,
        intent: {
          type: 'adjust_volume' as const,
          direction: 'lighter' as const,
          scope: 'item' as const,
          target_ref: 2,
          reason: 'preference' as const,
        },
      };
      const lighter = plan({
        applied_intents: [1],
        items: MAIN.map((id) => (id === 'push_up' ? item(id, 2, 10) : item(id))),
      });
      for (const intent of [reorder, volume]) {
        expect(
          validatePlan(lighter, edit({ currentIntents: [intent] })).results.find((x) => x.check === 'V-11')!.passed,
        ).toBe(true);
      }
      // Unapplied intents do not exempt it.
      expect(validatePlan(lighter, edit({ currentIntents: [volume] }))).toMatchObject({ passed: false });
      const remove = { intent_id: 1, intent: { type: 'remove_exercise' as const, target_ref: null, target_term: 'x' } };
      expect(
        failed(
          validatePlan(
            plan({ applied_intents: [1], items: MAIN.map((id) => (id === 'push_up' ? item(id, 3, 12) : item(id))) }),
            edit({ currentIntents: [remove] }),
          ),
        ),
      ).toContain('V-11:user_edit_changed');
    });

    it('exception (b): it now fails V-2, V-3 or V-4 because of session requests', () => {
      const without = plan({ items: [...MAIN.filter((id) => id !== 'push_up').map((id) => item(id)), item('squat')] });
      const legs = { effectiveFocus: { mode: 'user' as const, groups: ['chest', 'triceps', 'legs'] as MuscleGroup[] } };
      expect(
        validatePlan(without, edit({ avoidedBodyAreas: new Set(['wrists']), ...legs })).results.find(
          (x) => x.check === 'V-11',
        )!.passed,
      ).toBe(true);
      const benchEdit = inputItems.map((i) => ({
        ...i,
        origin: (i.exerciseId === 'bench' ? 'user_edit' : 'agent') as 'agent' | 'user_edit',
      }));
      const noBench = plan({ items: [...MAIN.filter((id) => id !== 'bench').map((id) => item(id)), item('squat')] });
      expect(
        validatePlan(
          noBench,
          edit({ inputPlan: { items: benchEdit, totalS: 2520 }, availableEquipment: new Set(), ...legs }),
        ).results.find((x) => x.check === 'V-11')!.passed,
      ).toBe(true);
      expect(
        validatePlan(
          plan({
            focus_groups: ['triceps'],
            items: MAIN.filter((id) => id !== 'push_up')
              .map((id) => item(id))
              .concat([item('squat')]),
          }),
          edit({ effectiveFocus: { mode: 'user', groups: ['triceps', 'legs'] } }),
        ).results.find((x) => x.check === 'V-11')!.passed,
      ).toBe(true);
      // Unknown exercise in the input plan is simply compared.
      const ghost = [
        ...inputItems,
        { ref: 9, exerciseId: 'ghost', sets: 3, reps: 10, timePerSetS: null, origin: 'user_edit' as const },
      ];
      expect(failed(validatePlan(plan(), edit({ inputPlan: { items: ghost, totalS: 2520 } })))).toContain(
        'V-11:user_edit_removed',
      );
    });

    it('exception (c): an applied whole-plan volume change may change its numbers', () => {
      const whole = {
        intent_id: 1,
        intent: {
          type: 'adjust_volume' as const,
          direction: 'lighter' as const,
          scope: 'whole_plan' as const,
          target_ref: null,
          reason: 'health' as const,
        },
      };
      const p = plan({ applied_intents: [1], items: MAIN.map((id) => item(id, 2, 8)) });
      expect(
        validatePlan(p, edit({ currentIntents: [whole], sessionLengthMin: 30 })).results.find(
          (x) => x.check === 'V-11',
        )!.passed,
      ).toBe(true);
      // Session intents count as applied too.
      expect(
        validatePlan(p, edit({ sessionIntents: [{ ...whole, applied: true }], sessionLengthMin: 30 })).results.find(
          (x) => x.check === 'V-11',
        )!.passed,
      ).toBe(true);
      expect(
        validatePlan(p, edit({ sessionIntents: [{ ...whole, applied: false }], sessionLengthMin: 30 })).results.find(
          (x) => x.check === 'V-11',
        )!.passed,
      ).toBe(false);
    });

    it('V-7 exempts unchanged user edits in edit mode', () => {
      const userEdited = inputItems.map((i) => (i.exerciseId === 'push_up' ? { ...i, reps: 20 } : i));
      const p = plan({ items: MAIN.map((id) => (id === 'push_up' ? item(id, 3, 20) : item(id))) });
      expect(failed(validatePlan(p, edit({ inputPlan: { items: userEdited, totalS: 2520 } })))).toEqual([]);
      expect(failed(validatePlan(p, ctx()))).toContain('V-7:start_out_of_range');
    });
  });
});

describe('EV-1 validator robustness', () => {
  it('an exercise unknown to the reference data fails V-1 and is skipped by the other checks', () => {
    const ghostCtx = ctx({ candidates: new Map([...byId, ['ghost', ex('ghost')]]) });
    const r = validatePlan(plan({ items: [...MAIN.slice(0, 7).map((id) => item(id)), item('ghost')] }), ghostCtx);
    expect(failed(r)).toEqual([]);
    const r2 = validatePlan(plan({ items: [...MAIN.slice(0, 7).map((id) => item(id)), item('ghost')] }), ctx());
    expect(failed(r2)).toEqual(['V-1:not_in_candidates']);
  });

  it('V-7: lighter on a new hold uses the starting hold as the baseline', () => {
    const lighter = {
      intent_id: 1,
      intent: {
        type: 'adjust_volume' as const,
        direction: 'lighter' as const,
        scope: 'whole_plan' as const,
        target_ref: null,
        reason: 'health' as const,
      },
    };
    const c = ctx({
      currentIntents: [lighter],
      effectiveFocus: { mode: 'user', groups: ['chest', 'triceps', 'core'] },
      sessionLengthMin: 30,
    });
    const p = plan({
      applied_intents: [1],
      items: [...MAIN.slice(0, 6).map((id) => item(id, 3, 7)), item('plank', 3, null, 20)],
    });
    expect(validatePlan(p, c).results.find((x) => x.check === 'V-7')!.passed).toBe(true);
  });

  it('V-11: an applied swap without a target ref exempts nothing', () => {
    const swap = {
      intent_id: 1,
      intent: { type: 'swap_exercise' as const, target_ref: null, target_term: 'x', replacement_term: null },
    };
    const inputItems = MAIN.map((id, i) => ({
      ref: i + 1,
      exerciseId: id,
      sets: 3,
      reps: 10,
      timePerSetS: null,
      origin: (i === 1 ? 'user_edit' : 'agent') as 'agent' | 'user_edit',
    }));
    const changed = plan({
      applied_intents: [1],
      items: MAIN.map((id) => (id === 'push_up' ? item(id, 3, 12) : item(id))),
    });
    expect(
      failed(
        validatePlan(
          changed,
          ctx({ mode: 'edit', currentIntents: [swap], inputPlan: { items: inputItems, totalS: 2520 } }),
        ),
      ),
    ).toContain('V-11:user_edit_changed');
  });
});

describe('EV-1 malformed numbers', () => {
  it('missing numbers fail V-6 and count as zero for V-7 overrides and V-8', () => {
    const lighter = {
      intent_id: 1,
      intent: {
        type: 'adjust_volume' as const,
        direction: 'lighter' as const,
        scope: 'whole_plan' as const,
        target_ref: null,
        reason: 'health' as const,
      },
    };
    const broken = [
      { ...item('bench'), reps: null },
      { ...item('push_up'), card_type: 'timed' as const, reps: null, time_per_set_s: null },
      ...MAIN.slice(2).map((id) => item(id, 3, 7)),
    ];
    const r = validatePlan(plan({ applied_intents: [1], items: broken }), ctx({ currentIntents: [lighter] }));
    expect(failed(r)).toEqual(
      expect.arrayContaining(['V-6:card_type_mismatch', 'V-7:override_wrong_direction', 'V-8:below_window']),
    );
  });
});

describe('EV-1 V-11 unapplied intents', () => {
  it('an unapplied intent targeting a user edit does not exempt it', () => {
    const volume = {
      intent_id: 1,
      intent: {
        type: 'adjust_volume' as const,
        direction: 'lighter' as const,
        scope: 'item' as const,
        target_ref: 2,
        reason: 'preference' as const,
      },
    };
    const inputItems = MAIN.map((id, i) => ({
      ref: i + 1,
      exerciseId: id,
      sets: 3,
      reps: 10,
      timePerSetS: null,
      origin: (i === 1 ? 'user_edit' : 'agent') as 'agent' | 'user_edit',
    }));
    const p = plan({
      unapplied_intents: [{ intent_id: 1, reason: 'time' }],
      items: MAIN.map((id) => (id === 'push_up' ? item(id, 2, 10) : item(id))),
    });
    expect(
      failed(
        validatePlan(
          p,
          ctx({ mode: 'edit', currentIntents: [volume], inputPlan: { items: inputItems, totalS: 2520 } }),
        ),
      ),
    ).toContain('V-11:user_edit_changed');
  });
});

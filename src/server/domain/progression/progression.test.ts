import { describe, expect, it } from 'vitest';
import { ex, workout } from '../../../../tests/fixtures/domain';
import type { CompletedWorkout, Exercise } from '../types';
import { computeTargets, holdTargetFor, type ProgressionInput } from './progression';

const now = new Date('2026-11-10T12:00:00Z');

function setup(pool: Exercise[], history: CompletedWorkout[], over: Partial<ProgressionInput> = {}): ProgressionInput {
  const all = [...pool, ...(over.exercisesById ? [] : [])];
  return {
    goal: 'build_muscle',
    experience: 'moderately_regular',
    history,
    pool,
    exercisesById: new Map(all.map((e) => [e.id, e])),
    availableEquipment: new Set(['dumbbells']),
    avoidedBodyAreas: new Set(),
    ...over,
  };
}
const w = (
  daysAgo: number,
  difficulty: 'easy' | 'just_right' | 'hard',
  id: string,
  sets: number,
  reps: number | null,
  time: number | null = null,
) => workout({ daysAgo, difficulty, items: [{ id, sets, reps, time }] }, now);

const pushUp = ex('push_up', { harderVersionId: 'archer', easierVersionId: 'knee_push_up' });
const archer = ex('archer', { level: 'expert' });
const knee = ex('knee_push_up');
const plank = ex('plank', { cardType: 'timed', timedKind: 'hold' });
const byId = (...e: Exercise[]) => new Map(e.map((x) => [x.id, x]));

describe('EV-7 progression', () => {
  it('EV-7 1: continuous cardio → no target', () => {
    const bike = ex('bike', { cardType: 'timed', timedKind: 'continuous' });
    expect(
      computeTargets(setup([bike], [w(2, 'easy', 'bike', 1, null, 600), w(4, 'easy', 'bike', 1, null, 600)])),
    ).toEqual([]);
    expect(holdTargetFor(bike, setup([bike], [w(2, 'easy', 'bike', 1, null, 600)]))).toBeNull();
  });

  it('EV-7 2: no history → no target', () => {
    expect(computeTargets(setup([pushUp], []))).toEqual([]);
  });

  it('EV-7 3: one appearance → hold', () => {
    expect(computeTargets(setup([pushUp], [w(2, 'just_right', 'push_up', 3, 10)]))).toEqual([
      { exercise_id: 'push_up', action: 'hold', sets: 3, reps: 10, time_per_set_s: null, replaces: null },
    ]);
  });

  it('EV-7 4: two not-Hard → step_up 3 × 12', () => {
    const t = computeTargets(setup([pushUp], [w(2, 'just_right', 'push_up', 3, 10), w(5, 'easy', 'push_up', 3, 10)]));
    expect(t[0]).toMatchObject({ action: 'step_up', sets: 3, reps: 12 });
  });

  it('EV-7 5: two not-Hard at 14 → 15 (cap)', () => {
    const t = computeTargets(setup([pushUp], [w(2, 'easy', 'push_up', 3, 14), w(5, 'easy', 'push_up', 3, 14)]));
    expect(t[0]).toMatchObject({ action: 'step_up', reps: 15 });
  });

  it('EV-7 6: at the cap with a harder version → harder_version at goal minimum', () => {
    const t = computeTargets(
      setup([pushUp], [w(2, 'easy', 'push_up', 3, 15), w(5, 'easy', 'push_up', 3, 15)], {
        exercisesById: byId(pushUp, archer),
      }),
    );
    expect(t).toEqual([
      { exercise_id: 'archer', action: 'harder_version', sets: 3, reps: 8, time_per_set_s: null, replaces: 'push_up' },
    ]);
  });

  it('EV-7 7: harder version needs missing equipment → hold at the cap', () => {
    const a = ex('archer', { requiredEquipment: ['rings'] });
    const t = computeTargets(
      setup([pushUp], [w(2, 'easy', 'push_up', 3, 15), w(5, 'easy', 'push_up', 3, 15)], {
        exercisesById: byId(pushUp, a),
      }),
    );
    expect(t[0]).toMatchObject({ exercise_id: 'push_up', action: 'hold', reps: 15 });
  });

  it('EV-7 8: harder version stresses an avoided area → hold', () => {
    const a = ex('archer', { bodyAreasStressed: ['wrists'] });
    const t = computeTargets(
      setup([pushUp], [w(2, 'easy', 'push_up', 3, 15), w(5, 'easy', 'push_up', 3, 15)], {
        exercisesById: byId(pushUp, a),
        avoidedBodyAreas: new Set(['wrists']),
      }),
    );
    expect(t[0]).toMatchObject({ action: 'hold' });
  });

  it('EV-7 9: no harder version (or inactive) → hold', () => {
    const plain = ex('plain');
    expect(
      computeTargets(setup([plain], [w(2, 'easy', 'plain', 3, 15), w(5, 'easy', 'plain', 3, 15)]))[0],
    ).toMatchObject({ action: 'hold' });
    const inactive = ex('archer', { isActive: false });
    expect(
      computeTargets(
        setup([pushUp], [w(2, 'easy', 'push_up', 3, 15), w(5, 'easy', 'push_up', 3, 15)], {
          exercisesById: byId(pushUp, inactive),
        }),
      )[0],
    ).toMatchObject({ action: 'hold' });
  });

  it('EV-7 10: hold 3 × 50 s → 60 s; at 60 s → harder (hold card) or hold', () => {
    expect(
      computeTargets(setup([plank], [w(2, 'easy', 'plank', 3, null, 50), w(4, 'easy', 'plank', 3, null, 50)]))[0],
    ).toMatchObject({
      action: 'step_up',
      time_per_set_s: 60,
      reps: null,
    });
    const side = ex('side_plank', { cardType: 'timed', timedKind: 'hold' });
    const p = { ...plank, harderVersionId: 'side_plank' };
    expect(
      computeTargets(
        setup([p], [w(2, 'easy', 'plank', 3, null, 60), w(4, 'easy', 'plank', 3, null, 60)], {
          exercisesById: byId(p, side),
        }),
      )[0],
    ).toEqual({
      exercise_id: 'side_plank',
      action: 'harder_version',
      sets: 3,
      reps: null,
      time_per_set_s: 30,
      replaces: 'plank',
    });
    expect(
      computeTargets(setup([plank], [w(2, 'easy', 'plank', 3, null, 60), w(4, 'easy', 'plank', 3, null, 60)]))[0],
    ).toMatchObject({ action: 'hold', time_per_set_s: 60 });
  });

  it('EV-7 11: two Hard at 10 → 8; at 7 → 6; holds step back 10 s to a 15 s floor', () => {
    expect(
      computeTargets(setup([pushUp], [w(2, 'hard', 'push_up', 3, 10), w(5, 'hard', 'push_up', 3, 10)]))[0],
    ).toMatchObject({ action: 'step_back', reps: 8 });
    expect(
      computeTargets(setup([pushUp], [w(2, 'hard', 'push_up', 3, 7), w(5, 'hard', 'push_up', 3, 7)]))[0],
    ).toMatchObject({ action: 'step_back', reps: 6 });
    expect(
      computeTargets(setup([plank], [w(2, 'hard', 'plank', 3, null, 20), w(5, 'hard', 'plank', 3, null, 20)]))[0],
    ).toMatchObject({ time_per_set_s: 15 });
  });

  it('EV-7 12: two Hard at 6 with an easier version: its own rule result, else rulebook start', () => {
    const hist = [w(2, 'hard', 'push_up', 3, 6), w(5, 'hard', 'push_up', 3, 6)];
    expect(computeTargets(setup([pushUp], hist, { exercisesById: byId(pushUp, knee) }))).toEqual([
      {
        exercise_id: 'knee_push_up',
        action: 'easier_version',
        sets: 3,
        reps: 8,
        time_per_set_s: null,
        replaces: 'push_up',
      },
    ]);
    const withKneeHistory = [...hist, w(20, 'just_right', 'knee_push_up', 3, 12)];
    expect(computeTargets(setup([pushUp], withKneeHistory, { exercisesById: byId(pushUp, knee) }))).toEqual([
      {
        exercise_id: 'knee_push_up',
        action: 'easier_version',
        sets: 3,
        reps: 12,
        time_per_set_s: null,
        replaces: 'push_up',
      },
    ]);
    const kneeHold = ex('knee_push_up', { cardType: 'timed', timedKind: 'hold' });
    expect(
      computeTargets(setup([pushUp], hist, { exercisesById: byId(pushUp, kneeHold), experience: 'newbie' }))[0],
    ).toMatchObject({
      time_per_set_s: 20,
      reps: null,
    });
  });

  it('EV-7 13: two Hard at 6, no easier version → hold', () => {
    const plain = ex('plain');
    expect(computeTargets(setup([plain], [w(2, 'hard', 'plain', 3, 6), w(5, 'hard', 'plain', 3, 6)]))[0]).toMatchObject(
      { action: 'hold', reps: 6 },
    );
  });

  it('EV-7 14: Hard then Just right → hold', () => {
    expect(
      computeTargets(setup([pushUp], [w(2, 'just_right', 'push_up', 3, 10), w(5, 'hard', 'push_up', 3, 10)]))[0],
    ).toMatchObject({ action: 'hold' });
  });

  it('EV-7 15: goal changed (4 sets → lose weight) clamps sets to 3', () => {
    expect(
      computeTargets(setup([pushUp], [w(2, 'just_right', 'push_up', 4, 10)], { goal: 'lose_weight' }))[0],
    ).toMatchObject({ sets: 3 });
  });

  it('EV-7 16: a deleted workout no longer counts', () => {
    // Only one appearance remains after the other workout was deleted → hold, not step_up.
    expect(computeTargets(setup([pushUp], [w(2, 'easy', 'push_up', 3, 10)]))[0]).toMatchObject({ action: 'hold' });
  });

  it('EV-7 17: direct-edited numbers in a completed workout are used', () => {
    expect(
      computeTargets(setup([pushUp], [w(2, 'easy', 'push_up', 3, 9), w(5, 'easy', 'push_up', 3, 10)]))[0],
    ).toMatchObject({ reps: 11 });
  });

  it('a switch target replaces the version’s own target; two switches to one version: first wins', () => {
    const other = ex('incline_push_up', { harderVersionId: 'archer' });
    const hist = [
      workout(
        {
          daysAgo: 2,
          difficulty: 'easy',
          items: [
            { id: 'push_up', reps: 15 },
            { id: 'incline_push_up', reps: 15 },
            { id: 'archer', reps: 9 },
          ],
        },
        now,
      ),
      workout(
        {
          daysAgo: 5,
          difficulty: 'easy',
          items: [
            { id: 'push_up', reps: 15 },
            { id: 'incline_push_up', reps: 15 },
            { id: 'archer', reps: 9 },
          ],
        },
        now,
      ),
    ];
    const t = computeTargets(setup([archer, pushUp, other], hist, { exercisesById: byId(pushUp, archer, other) }));
    expect(t).toEqual([
      { exercise_id: 'archer', action: 'harder_version', sets: 3, reps: 8, time_per_set_s: null, replaces: 'push_up' },
      { exercise_id: 'incline_push_up', action: 'hold', sets: 3, reps: 15, time_per_set_s: null, replaces: null },
    ]);
  });

  it('holdTargetFor returns the latest numbers, null without history', () => {
    expect(holdTargetFor(pushUp, setup([pushUp], [w(2, 'easy', 'push_up', 3, 15)]))).toMatchObject({
      action: 'hold',
      reps: 15,
    });
    expect(holdTargetFor(plank, setup([plank], [w(2, 'easy', 'plank', 3, null, 40)]))).toMatchObject({
      time_per_set_s: 40,
      reps: null,
    });
    expect(holdTargetFor(pushUp, setup([pushUp], []))).toBeNull();
  });

  it('a hold-card switch duplicate keeps the time numbers', () => {
    const p1 = ex('p1', { cardType: 'timed', timedKind: 'hold', harderVersionId: 'side' });
    const p2 = ex('p2', { cardType: 'timed', timedKind: 'hold', harderVersionId: 'side' });
    const side = ex('side', { cardType: 'timed', timedKind: 'hold' });
    const hist = [0, 1].map((i) =>
      workout(
        {
          daysAgo: 2 + i * 3,
          difficulty: 'easy',
          items: [
            { id: 'p1', time: 60 },
            { id: 'p2', time: 60 },
          ],
        },
        now,
      ),
    );
    const t = computeTargets(setup([p1, p2], hist, { exercisesById: byId(p1, p2, side) }));
    expect(t.find((x) => x.exercise_id === 'p2')).toMatchObject({ action: 'hold', time_per_set_s: 60, reps: null });
  });
});

import { describe, expect, it } from 'vitest';
import { ex, workout } from '../../../../tests/fixtures/domain';
import type { Exercise } from '../types';
import {
  applyVersionSwitches,
  availableEquipmentFor,
  buildCandidates,
  canFill,
  sortCandidates,
  type CandidateInput,
} from './candidate-filter';

const now = new Date('2026-11-10T12:00:00Z');

const pool: Exercise[] = [
  ex('db_bench', { muscleGroup: 'chest', requiredEquipment: ['dumbbells', 'flat_bench'] }),
  ex('push_up', { muscleGroup: 'chest' }),
  ex('fly', { muscleGroup: 'chest', mechanic: 'isolation', requiredEquipment: ['dumbbells'] }),
  ex('squat', { muscleGroup: 'legs', bodyAreasStressed: ['knees', 'lower_back'] }),
  ex('glute_bridge', { muscleGroup: 'legs' }),
  ex('pistol', { muscleGroup: 'legs', level: 'expert' }),
  ex('row', { muscleGroup: 'back', requiredEquipment: ['dumbbells'] }),
  ex('plank', { muscleGroup: 'core', cardType: 'timed', timedKind: 'hold' }),
  ex('bike', {
    muscleGroup: 'cardio',
    cardType: 'timed',
    timedKind: 'continuous',
    requiredEquipment: ['stationary_bike'],
  }),
];

const input = (over: Partial<CandidateInput> = {}): CandidateInput => ({
  exercises: pool,
  profileEquipment: ['dumbbells', 'flat_bench', 'stationary_bike'],
  experience: 'newbie',
  goal: 'build_muscle',
  sessionLengthMin: 30,
  focus: { mode: 'coach' },
  intents: [],
  history: [],
  now,
  rule48hHours: 48,
  ...over,
});
const ids = (r: { candidates: Exercise[] }) => r.candidates.map((e) => e.id);

describe('FR-25 candidate filter', () => {
  it('step 1: an equipment_today override replaces the profile list; unavailable removes from it', () => {
    expect([
      ...availableEquipmentFor(
        ['dumbbells', 'flat_bench'],
        [{ type: 'equipment_today', available: ['dumbbells', 'kettlebells'], unavailable: ['kettlebells'] }],
      ),
    ]).toEqual(['dumbbells']);
    expect([
      ...availableEquipmentFor(
        ['dumbbells', 'flat_bench'],
        [{ type: 'equipment_today', available: [], unavailable: ['flat_bench'] }],
      ),
    ]).toEqual(['dumbbells']);
    const r = buildCandidates(
      input({ intents: [{ type: 'equipment_today', available: ['dumbbells'], unavailable: [] }] }),
    );
    expect(ids(r)).not.toContain('db_bench');
    expect(ids(r)).toContain('fly');
  });

  it('step 1: bodyweight is always kept', () => {
    expect(ids(buildCandidates(input({ profileEquipment: [] })))).toEqual([
      'push_up',
      'glute_bridge',
      'squat',
      'plank',
    ]);
  });

  it('step 2: level by experience', () => {
    expect(ids(buildCandidates(input()))).not.toContain('pistol');
    expect(ids(buildCandidates(input({ experience: 'experienced' })))).toContain('pistol');
  });

  it('step 3: one overlapping body area removes the exercise', () => {
    const r = buildCandidates(input({ intents: [{ type: 'avoid_body_area', body_areas: ['knees'] }] }));
    expect(ids(r)).not.toContain('squat');
    expect([...r.avoidedBodyAreas]).toEqual(['knees']);
  });

  it('step 4: user focus without cardio drops cardio; with cardio keeps it', () => {
    expect(ids(buildCandidates(input({ focus: { mode: 'user', groups: ['chest', 'core'] } })))).toEqual([
      'db_bench',
      'push_up',
      'fly',
      'plank',
    ]);
    expect(ids(buildCandidates(input({ focus: { mode: 'user', groups: ['cardio'] } })))).toEqual(['bike']);
  });

  it('step 4: coach + lose weight keeps cardio; coach + build muscle drops it', () => {
    expect(ids(buildCandidates(input({ goal: 'lose_weight' })))).toContain('bike');
    expect(ids(buildCandidates(input()))).not.toContain('bike');
  });

  it('step 4: change_focus overrides the planner focus', () => {
    const r = buildCandidates(
      input({
        focus: { mode: 'user', groups: ['chest'] },
        intents: [{ type: 'change_focus', muscle_groups: ['legs'] }],
      }),
    );
    expect(r.effectiveFocus).toEqual({ mode: 'user', groups: ['legs'] });
    expect(ids(r)).toEqual(['glute_bridge', 'squat']);
  });

  it('step 4: coach mode removes groups trained within 48 h when the rest can fill', () => {
    const big = [...pool, ...Array.from({ length: 8 }, (_, i) => ex(`back_${i}`, { muscleGroup: 'back' }))];
    const r = buildCandidates(
      input({ exercises: big, history: [workout({ hoursAgo: 20, items: [{ id: 'push_up', group: 'chest' }] }, now)] }),
    );
    expect(r.excludedBy48h).toEqual(['chest']);
    expect(r.rule48hRelaxed).toBe(false);
    expect(ids(r)).not.toContain('push_up');
  });

  it('step 4: relaxes the 48 h rule when the pool cannot fill (bodyweight user, all trained yesterday)', () => {
    const history = [
      workout(
        {
          hoursAgo: 20,
          items: [
            { id: 'push_up', group: 'chest' },
            { id: 'squat', group: 'legs' },
            { id: 'plank', group: 'core' },
          ],
        },
        now,
      ),
    ];
    const r = buildCandidates(input({ profileEquipment: [], history }));
    expect(r.rule48hRelaxed).toBe(true);
    expect(ids(r)).toEqual(['push_up', 'glute_bridge', 'squat', 'plank']);
  });

  it('step 4: cardio trained within 48 h is removed for a lose-weight coach plan', () => {
    const big = [...pool, ...Array.from({ length: 8 }, (_, i) => ex(`back_${i}`, { muscleGroup: 'back' }))];
    const r = buildCandidates(
      input({
        goal: 'lose_weight',
        exercises: big,
        history: [workout({ hoursAgo: 5, items: [{ id: 'bike', group: 'cardio', time: 600 }] }, now)],
      }),
    );
    expect(ids(r)).not.toContain('bike');
  });

  it('step 5: deterministic sort by group, mechanic, name', () => {
    const shuffled = [...pool].reverse();
    expect(ids({ candidates: sortCandidates(shuffled) })).toEqual(ids({ candidates: sortCandidates(pool) }));
    expect(sortCandidates([ex('b', { name: 'Same' }), ex('a', { name: 'Same' })]).map((e) => e.id)).toEqual(['a', 'b']);
  });

  it('canFill counts the 8 longest cards at the top of the range', () => {
    // build muscle top: 4 × 12 × 3 + 3 × 60 + 30 = 354 s; 30 min needs 1530 − 600 = 930 s.
    expect(canFill([ex('a'), ex('b')], 'build_muscle', 30)).toBe(false);
    expect(canFill([ex('a'), ex('b'), ex('c')], 'build_muscle', 30)).toBe(true);
    // hold: 4 × 60 + 180 + 30 = 450; continuous: 1800 + 30 = 1830
    expect(
      canFill(
        [ex('h', { cardType: 'timed', timedKind: 'hold' }), ex('h2', { cardType: 'timed', timedKind: 'hold' })],
        'build_muscle',
        30,
      ),
    ).toBe(false);
    expect(canFill([ex('c', { cardType: 'timed', timedKind: 'continuous' })], 'build_muscle', 30)).toBe(true);
  });
});

describe('PRD §8.9 version switches', () => {
  it('adds a harder version above the level filter and drops the original', () => {
    const r = buildCandidates(input());
    const harder = ex('archer_push_up', { muscleGroup: 'chest', level: 'expert' });
    const out = applyVersionSwitches(r, [{ replaces: 'push_up', version: harder }], 'build_muscle');
    expect(out.candidates.map((e) => e.id)).toContain('archer_push_up');
    expect(out.candidates.map((e) => e.id)).not.toContain('push_up');
    expect(out.dropped).toEqual([]);
  });

  it('a harder version failing focus is not added', () => {
    const r = buildCandidates(input({ focus: { mode: 'user', groups: ['chest'] } }));
    const out = applyVersionSwitches(
      r,
      [{ replaces: 'push_up', version: ex('pistol2', { muscleGroup: 'legs' }) }],
      'build_muscle',
    );
    expect(out.candidates.map((e) => e.id)).toContain('push_up');
    expect(out.dropped).toEqual(['push_up']);
  });

  it('in coach mode a version in a group trained within 48 h is dropped', () => {
    const big = [...pool, ...Array.from({ length: 8 }, (_, i) => ex(`back_${i}`, { muscleGroup: 'back' }))];
    const r = buildCandidates(
      input({ exercises: big, history: [workout({ hoursAgo: 20, items: [{ id: 'squat', group: 'legs' }] }, now)] }),
    );
    const out = applyVersionSwitches(
      r,
      [{ replaces: 'row', version: ex('lunge', { muscleGroup: 'legs' }) }],
      'build_muscle',
    );
    expect(out.dropped).toEqual(['row']);
  });
});

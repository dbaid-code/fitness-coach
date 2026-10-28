import { describe, expect, it } from 'vitest';
import type { PlanItemRow } from '@/server/db/repositories/plan-item.repo';
import type { PlanRow } from '@/server/db/repositories/plan.repo';
import { ex, routine } from '../../../../tests/fixtures/domain';
import type { ReferenceData } from '../reference-data.service';
import { toPlanDto } from './plan.mapper';

const ref: ReferenceData = {
  exercises: new Map([['bench_press', ex('bench_press', { name: 'Bench Press' })]]),
  exerciseNames: new Map([['old_row', { name: 'Old Row', instructions: [] }]]),
  routines: new Map([
    ['warmup_a', routine('warmup_a', { name: 'Push warm-up' })],
    ['cooldown_a', routine('cooldown_a', { name: 'Stretch' })],
  ]),
  equipment: [],
  activeEquipmentIds: new Set(),
  datasetVersion: 'exercises.v1',
  loadedAt: 0,
};

const now = new Date('2026-10-26T06:00:00Z');
const plan = {
  id: '00000000-0000-4000-8000-000000000001',
  status: 'draft',
  version: 1,
  sessionLengthMin: 30,
  focusMode: 'user',
  focusGroups: ['chest'],
  focusReason: 'user_selected',
  focusRestDays: null,
  totalTimeS: 1830,
  textEditCount: 1,
  createdAt: now,
  lastChangedAt: now,
  acceptedAt: null,
  expiresAt: new Date(now.getTime() + 12 * 3600_000),
} as unknown as PlanRow;

const item = (position: number, over: Partial<PlanItemRow>): PlanItemRow =>
  ({
    id: `00000000-0000-4000-8000-00000000001${position}`,
    position,
    kind: 'exercise',
    cardType: 'reps',
    exerciseId: null,
    routineId: null,
    sets: 3,
    reps: 10,
    timePerSetS: null,
    totalTimeS: 239,
    origin: 'agent',
    ...over,
  }) as PlanItemRow;

const items = [
  item(3, { kind: 'cooldown', cardType: 'activity', routineId: 'cooldown_a', sets: null, reps: null, totalTimeS: 300 }),
  item(2, { exerciseId: 'bench_press' }),
  item(4, { exerciseId: 'old_row' }),
  item(1, { kind: 'warmup', cardType: 'activity', routineId: 'warmup_a', sets: null, reps: null, totalTimeS: 300 }),
];

describe('FR-46 plan mapper', () => {
  const dto = toPlanDto(plan, items, ref);

  it('FR-46: names come from the reference data, never from agent output', () => {
    expect(dto.items.map((i) => i.name)).toEqual(['Push warm-up', 'Bench Press', 'Stretch', 'Old Row']);
    expect(JSON.stringify(dto)).not.toMatch(/sentinel|AGENT/);
  });
  it('FR-42: items in position order; activity items have no time model or group', () => {
    expect(dto.items.map((i) => i.position)).toEqual([1, 2, 3, 4]);
    expect(dto.items[0]).toMatchObject({ time_model: null, muscle_group: null });
    expect(dto.items[1]).toMatchObject({
      muscle_group: 'chest',
      time_model: { seconds_per_rep: 3, rest_s: 60, setup_s: 30 },
    });
  });
  it('FR-45: whole minutes per card; total rounded from exact seconds; over_time', () => {
    expect(dto.items[1]!.total_time_min).toBe(4);
    expect(dto.total_time_min).toBe(31);
    expect(dto.over_time).toBe(true);
    expect(dto.text_edits_remaining).toBe(4);
  });
  it('FR-40: header from stored focus', () => {
    expect(dto.header).toEqual({ code: 'HEADER_USER', params: { groups: ['chest'], t: 30 } });
  });
});

import { describe, expect, it } from 'vitest';
import {
  HARD_BOUNDS,
  MAX_PHOTO_SCANS_PER_DAY,
  MAX_PLAN_GENERATIONS_PER_DAY,
  MAX_TEXT_EDITS_PER_PLAN,
} from '@/shared/constants';
import { adminSql } from '../helpers/db';

const def = async (name: string) => {
  const [row] = await adminSql`select pg_get_constraintdef(oid) as d from pg_constraint where conname = ${name}`;
  return row!.d as string;
};

describe('FR-50 constants match the DB check constraints', () => {
  it('hard bounds', async () => {
    expect(await def('ck_plan_items__sets')).toContain(`>= ${HARD_BOUNDS.sets.min}`);
    expect(await def('ck_plan_items__sets')).toContain(`<= ${HARD_BOUNDS.sets.max}`);
    expect(await def('ck_plan_items__reps')).toContain(`<= ${HARD_BOUNDS.reps.max}`);
    expect(await def('ck_plan_items__time')).toContain(`>= ${HARD_BOUNDS.timePerSetS.min}`);
    expect(await def('ck_plan_items__time')).toContain(`<= ${HARD_BOUNDS.timePerSetS.max}`);
  });
  it('limits', async () => {
    expect(await def('ck_plans__edits')).toContain(`<= ${MAX_TEXT_EDITS_PER_PLAN}`);
    expect(await def('ck_usage_counters__plans')).toContain(`<= ${MAX_PLAN_GENERATIONS_PER_DAY}`);
    expect(await def('ck_usage_counters__scans')).toContain(`<= ${MAX_PHOTO_SCANS_PER_DAY}`);
  });
  it('FR-10: profiles has no age, sex, height or weight column', async () => {
    const cols =
      await adminSql`select column_name from information_schema.columns where table_schema = 'app' and table_name = 'profiles'`;
    expect(
      cols.map((c) => c.column_name).filter((c: string) => /^(age|sex|gender|height|weight|birth)/.test(c)),
    ).toEqual([]);
  });
});

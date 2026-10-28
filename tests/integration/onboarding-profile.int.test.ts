import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { POST as onboarding } from '@/app/api/v1/onboarding/route';
import { GET as getProfile, PUT as putProfile } from '@/app/api/v1/profile/route';
import { PUT as putEquipment } from '@/app/api/v1/profile/equipment/route';
import { GET as getEquipment } from '@/app/api/v1/equipment/route';
import { adminSql, truncateUserData } from '../helpers/db';
import { callRoute } from '../helpers/call-route';
import { createUser, type TestUser } from '../helpers/users';

const body = (over: Record<string, unknown> = {}) => ({
  name: 'Asha',
  goal: 'build_muscle',
  experience: 'newbie',
  days_per_week: 3,
  equipment_ids: ['dumbbells', 'flat_bench'],
  timezone: 'Asia/Kolkata',
  ...over,
});

describe('F-04 onboarding, profile and equipment', () => {
  let u: TestUser;
  beforeEach(async () => {
    await truncateUserData();
    u = await createUser();
  });
  afterAll(truncateUserData);

  it('API-01 creates the profile and selection (FR-10, FR-20)', async () => {
    const r = await callRoute(onboarding, { method: 'POST', user: u, body: body() });
    expect(r.status).toBe(201);
    expect(r.json.data.profile).toMatchObject({
      name: 'Asha',
      goal: 'build_muscle',
      experience: 'newbie',
      days_per_week: 3,
      timezone: 'Asia/Kolkata',
      last_session_length_min: null,
      equipment_ids: ['dumbbells', 'flat_bench'],
    });
    const rows = await adminSql`select equipment_id from app.user_equipment where user_id = ${u.id} order by 1`;
    expect(rows.map((x) => x.equipment_id)).toEqual(['dumbbells', 'flat_bench']);
  });

  it('FR-25: zero items allowed; second call → 409 PROFILE_EXISTS', async () => {
    expect((await callRoute(onboarding, { method: 'POST', user: u, body: body({ equipment_ids: [] }) })).status).toBe(
      201,
    );
    expect((await callRoute(onboarding, { method: 'POST', user: u, body: body() })).json.error.code).toBe(
      'PROFILE_EXISTS',
    );
  });

  it('inactive or unknown IDs → 422; unknown timezone → 400; duplicates → 400', async () => {
    const bad = await callRoute(onboarding, { method: 'POST', user: u, body: body({ equipment_ids: ['hoverboard'] }) });
    expect(bad.status).toBe(422);
    expect(bad.json.error.details).toEqual([
      { path: 'equipment_ids', issue: 'hoverboard is not an active equipment id' },
    ]);
    const tz = await callRoute(onboarding, { method: 'POST', user: u, body: body({ timezone: 'Mars/Olympus' }) });
    expect(tz.json.error.details).toEqual([{ path: 'timezone', issue: 'unknown time zone' }]);
    expect(
      (
        await callRoute(onboarding, {
          method: 'POST',
          user: u,
          body: body({ equipment_ids: ['dumbbells', 'dumbbells'] }),
        })
      ).status,
    ).toBe(400);
    expect((await callRoute(onboarding, { method: 'POST', user: u, body: body({ age: 30 }) })).status).toBe(400);
  });

  it('API-02/03: read and update every field (FR-11)', async () => {
    await callRoute(onboarding, { method: 'POST', user: u, body: body() });
    const upd = await callRoute(putProfile, {
      method: 'PUT',
      user: u,
      body: {
        name: 'Asha K',
        goal: 'lose_weight',
        experience: 'experienced',
        days_per_week: 5,
        timezone: 'America/New_York',
      },
    });
    expect(upd.json.data.profile).toMatchObject({
      name: 'Asha K',
      goal: 'lose_weight',
      experience: 'experienced',
      days_per_week: 5,
      timezone: 'America/New_York',
    });
    expect((await callRoute(getProfile, { user: u })).json.data.profile.name).toBe('Asha K');
  });

  it('API-04 replaces the selection, in sort order; API-05 lists the 62 active items with a reference cache header', async () => {
    await callRoute(onboarding, { method: 'POST', user: u, body: body() });
    const r = await callRoute(putEquipment, {
      method: 'PUT',
      user: u,
      body: { equipment_ids: ['stair_climber', 'barbell'] },
    });
    expect(r.json.data.equipment_ids).toEqual(['barbell', 'stair_climber']);
    const list = await callRoute(getEquipment, { user: u });
    expect(list.json.data.items).toHaveLength(62); // D-53
    expect(list.json.data.items[0]).toEqual({ id: 'dumbbells', name: 'Dumbbells' });
    expect(list.headers.get('cache-control')).toBe('private, max-age=86400');
  });

  it('profile endpoints need a profile (403 ONBOARDING_REQUIRED)', async () => {
    expect((await callRoute(getProfile, { user: u })).json.error.code).toBe('ONBOARDING_REQUIRED');
  });
});

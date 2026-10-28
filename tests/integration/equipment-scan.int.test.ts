import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/v1/equipment-scans/route';
import { adminSql, truncateUserData } from '../helpers/db';
import { callRoute } from '../helpers/call-route';
import { fakeAgents } from '../helpers/fake-agents';
import { jpegFixture, pdfFixture, scanForm } from '../helpers/images';
import { createUser, type TestUser } from '../helpers/users';

async function send(user: TestUser, form: FormData, key = crypto.randomUUID()) {
  const req = new Request('http://x', { method: 'POST', body: form });
  const contentType = req.headers.get('content-type')!;
  const rawBody = new Uint8Array(await req.arrayBuffer());
  return callRoute(POST, {
    method: 'POST',
    user,
    rawBody,
    headers: { 'Content-Type': contentType },
    idempotencyKey: key,
  });
}
const scansUsed = async (u: TestUser) =>
  (await adminSql`select coalesce(sum(photo_scans), 0)::int as n from app.usage_counters where user_id = ${u.id}`)[0]!
    .n;

describe('F-05 equipment photo scan (API-06)', () => {
  let u: TestUser;
  beforeEach(async () => {
    await truncateUserData();
    fakeAgents.reset();
    u = await createUser({ onboard: true });
  });
  afterAll(truncateUserData);

  it('FR-21/22/23: profile edit unions with the saved selection; threshold drops low confidence; nothing saved', async () => {
    const before = await adminSql`select equipment_id from app.user_equipment where user_id = ${u.id} order by 1`;
    const r = await send(u, scanForm([jpegFixture(), jpegFixture(1200, 900)]));
    expect(r.status).toBe(200);
    const d = r.json.data;
    expect(d.outcome).toBe('detected');
    expect(d.detected.map((x: any) => x.equipment_id)).toEqual(['dumbbells', 'adjustable_bench']); // stability ball 0.55 dropped
    expect(d.status).toEqual({ code: 'PHOTO_PARTIAL', params: { n: 2 } });
    for (const row of before) expect(d.proposed_selection).toContain(row.equipment_id);
    expect(d.photo_scans_remaining_today).toBe(4);
    expect(await adminSql`select equipment_id from app.user_equipment where user_id = ${u.id} order by 1`).toEqual(
      before,
    );
    const [ev] =
      await adminSql`select properties from app.app_events where user_id = ${u.id} and event_type = 'photo_scan_completed'`;
    expect(ev!.properties).toMatchObject({ context: 'profile_edit', photo_count: 2, detected_count: 2 });
  });

  it('FR-21: onboarding (no profile yet) replaces the selection and uses the body timezone', async () => {
    const fresh = await createUser({ onboard: false });
    const r = await send(fresh, scanForm([jpegFixture()], { context: 'onboarding', timezone: 'Asia/Kolkata' }));
    expect(r.json.data.proposed_selection).toEqual(['dumbbells', 'adjustable_bench']);
    expect((await send(fresh, scanForm([jpegFixture()], { context: 'profile_edit' }))).json.error.code).toBe(
      'ONBOARDING_REQUIRED',
    );
  });

  it('FR-22: unknown IDs never appear; no detections → PHOTO_NONE, selection null, still counted', async () => {
    fakeAgents.set({ ag1: { detections: [{ equipment_id: 'dumbbells', confidence: 0.4 }] } });
    const r = await send(u, scanForm([jpegFixture()]));
    expect(r.json.data).toMatchObject({
      outcome: 'none',
      detected: [],
      proposed_selection: null,
      status: { code: 'PHOTO_NONE' },
    });
    expect(await scansUsed(u)).toBe(1);
  });

  it('D-12 / §8.11: API error and refusal → PHOTO_NONE and not counted', async () => {
    fakeAgents.set({ ag1: 'api_error' });
    expect((await send(u, scanForm([jpegFixture()]))).json.data.status.code).toBe('PHOTO_NONE');
    fakeAgents.set({ ag1: 'refusal' });
    expect((await send(u, scanForm([jpegFixture()]))).json.data.status.code).toBe('PHOTO_NONE');
    expect(await scansUsed(u)).toBe(0);
  });

  it('S-3 validation: PDF posing as .jpg, 6 files, 1.6 MB file, 9000 px header, bad context', async () => {
    const pdf = await send(u, scanForm([pdfFixture()]));
    expect(pdf.status).toBe(400);
    expect(pdf.json.error.details[0]).toEqual({ path: 'photos.0', issue: 'unsupported image type' });
    expect((await send(u, scanForm(Array.from({ length: 6 }, () => jpegFixture())))).status).toBe(400);
    expect((await send(u, scanForm([jpegFixture(1568, 1176, 1_600_000)]))).status).toBe(413);
    expect((await send(u, scanForm([jpegFixture(9000, 1000)]))).status).toBe(400);
    expect((await send(u, scanForm([jpegFixture()], { context: 'gym' }))).status).toBe(400);
    expect(fakeAgents.calls('ag1_equipment_vision')).toHaveLength(0);
  });

  it('FR-81: the 6th scan of the local day → 429 PHOTO_LIMIT', async () => {
    for (let i = 0; i < 5; i++) expect((await send(u, scanForm([jpegFixture()]))).status).toBe(200);
    const r = await send(u, scanForm([jpegFixture()]));
    expect(r.status).toBe(429);
    expect(r.json.error).toMatchObject({ code: 'LIMIT_REACHED', message_code: 'PHOTO_LIMIT' });
  });

  it('D-06: same key and files → replay; same key, other files → 422', async () => {
    const key = crypto.randomUUID();
    const a = await send(u, scanForm([jpegFixture()]), key);
    const b = await send(u, scanForm([jpegFixture()]), key);
    expect(b.json).toEqual(a.json);
    expect(fakeAgents.calls('ag1_equipment_vision')).toHaveLength(1);
    expect((await send(u, scanForm([jpegFixture(1000, 800)]), key)).status).toBe(422);
  });
});

describe('D-01 / FR-24 photo privacy', () => {
  afterAll(truncateUserData);

  it('FR-24: no file write, no Storage call, no image bytes in agent_logs or any other table', async () => {
    await truncateUserData();
    fakeAgents.reset();
    const u = await createUser({ onboard: true });
    const fs = (await import('node:fs')).default;
    const spies = [
      vi.spyOn(fs, 'writeFileSync'),
      vi.spyOn(fs, 'writeFile'),
      vi.spyOn(fs, 'createWriteStream'),
      vi.spyOn(fs.promises, 'writeFile'),
      vi.spyOn(fs.promises, 'appendFile'),
    ];
    const realFetch = globalThis.fetch;
    const storageCalls: string[] = [];
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.includes('/storage/v1/')) storageCalls.push(url);
      return realFetch(input, init);
    });
    const r = await send(u, scanForm([jpegFixture(), jpegFixture(800, 600, 20_000)]));
    fetchSpy.mockRestore();
    expect(r.status).toBe(200);
    for (const s of spies) expect(s).not.toHaveBeenCalled();
    expect(storageCalls).toEqual([]);
    const [log] =
      await adminSql`select request from app.agent_logs where user_id = ${u.id} and agent = 'ag1_equipment_vision'`;
    expect(log!.request.photos).toEqual([
      { type: 'image', bytes: 4096, width: 1568, height: 1176 },
      { type: 'image', bytes: 20_000, width: 800, height: 600 },
    ]);
    const dump =
      JSON.stringify(await adminSql`select * from app.agent_logs`) +
      JSON.stringify(await adminSql`select * from app.idempotency_keys`) +
      JSON.stringify(await adminSql`select * from app.app_events`);
    expect(dump).not.toMatch(/[A-Za-z0-9+/]{200,}/);
    expect(dump).not.toContain(Buffer.from(jpegFixture()).toString('base64').slice(0, 60));
  });
});

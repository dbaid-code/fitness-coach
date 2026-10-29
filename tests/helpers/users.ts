// Test users via the local Supabase Admin API (testing-strategy.md §3).
import { createClient } from '@supabase/supabase-js';
import { adminSql } from './db';
import { testEmail } from './emails';

export type TestUser = { id: string; email: string; password: string };

export const admin = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

export async function createUser(
  opts: {
    onboard?: boolean;
    timezone?: string;
    goal?: 'build_muscle' | 'lose_weight' | 'stay_fit';
    experience?: 'newbie' | 'moderately_regular' | 'experienced';
    daysPerWeek?: number;
    equipment?: string[];
  } = {},
): Promise<TestUser> {
  const email = testEmail('u');
  const password = `pw-${crypto.randomUUID()}`;
  const { data, error } = await admin().auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw error ?? new Error('createUser failed');
  const id = data.user.id;
  if (opts.onboard) {
    await adminSql`
      insert into app.profiles (user_id, name, goal, experience, days_per_week, timezone, onboarding_completed_at)
      values (${id}, 'Test User', ${opts.goal ?? 'build_muscle'}, ${opts.experience ?? 'moderately_regular'},
              ${opts.daysPerWeek ?? 3}, ${opts.timezone ?? 'Asia/Kolkata'}, now())`;
    const equipment =
      opts.equipment ??
      (await adminSql<{ id: string }[]>`select id from app.equipment where is_active`).map((r) => r.id);
    for (const e of equipment)
      await adminSql`insert into app.user_equipment (user_id, equipment_id) values (${id}, ${e})`;
  }
  return { id, email, password };
}

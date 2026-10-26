// EV-6 (testing-strategy.md §3): searches every text, text[] and jsonb column of every `app` table except
// agent_logs and idempotency_keys for the given phrases.
import { adminSql } from './db';

const EXCLUDED = new Set(['agent_logs', 'idempotency_keys']);

export async function scanForPhrases(
  phrases: string[],
): Promise<Array<{ table: string; column: string; phrase: string }>> {
  const cols = await adminSql<{ table_name: string; column_name: string; data_type: string }[]>`
    select table_name, column_name, data_type from information_schema.columns
     where table_schema = 'app' and data_type in ('text', 'ARRAY', 'jsonb', 'character varying')`;
  const hits: Array<{ table: string; column: string; phrase: string }> = [];
  for (const c of cols) {
    if (EXCLUDED.has(c.table_name)) continue;
    for (const phrase of phrases) {
      const rows = await adminSql.unsafe(
        `select 1 from app."${c.table_name}" where "${c.column_name}"::text ilike $1 limit 1`,
        [`%${phrase}%`],
      );
      if (rows.length) hits.push({ table: c.table_name, column: c.column_name, phrase });
    }
  }
  return hits;
}

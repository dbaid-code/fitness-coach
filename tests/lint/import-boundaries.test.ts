import { ESLint } from 'eslint';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// F-01 acceptance 5: importing @/server from src/features fails lint.
const lint = async (filePath: string, code: string) => {
  const eslint = new ESLint({ cwd: process.cwd() });
  const [result] = await eslint.lintText(code, { filePath });
  return result!.messages.map((m) => m.ruleId);
};

describe('F-01 import boundaries', () => {
  const fixture = readFileSync('tests/fixtures/lint/src/features/demo/bad-import.ts', 'utf8');

  it('src/features may not import src/server', async () => {
    expect(await lint('src/features/demo/bad-import.ts', fixture)).toContain('no-restricted-imports');
  });

  it('src/shared may not import React', async () => {
    expect(
      await lint('src/shared/demo.ts', "import { useState } from 'react';\nexport const x = useState;\n"),
    ).toContain('no-restricted-imports');
  });

  it('domain engines may not import Drizzle', async () => {
    expect(
      await lint('src/server/domain/demo.ts', "import { sql } from 'drizzle-orm';\nexport const x = sql;\n"),
    ).toContain('no-restricted-imports');
  });

  it('the browser may not query tables through Supabase', async () => {
    expect(
      await lint(
        'src/features/demo/query.ts',
        "declare const supabase: any;\nexport const q = supabase.from('plans');\n",
      ),
    ).toContain('no-restricted-syntax');
  });

  it('server code may import server code', async () => {
    expect(
      await lint('src/server/services/demo.ts', "import { env } from '@/server/config/env';\nexport const x = env;\n"),
    ).not.toContain('no-restricted-imports');
  });
}, 60_000);

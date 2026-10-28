import { describe, expect, it } from 'vitest';
import { checkGate, manifestFiles, manifestHash } from './manifest';

describe('D-38 eval manifest and gate', () => {
  it('D-38: covers every prompt, the agent config, the rulebook and the seed data', () => {
    const files = manifestFiles();
    expect(files).toContain('src/server/agents/agent-config.ts');
    expect(files).toContain('src/server/agents/input-guard/prompt.v1.md');
    expect(files).toContain('src/server/agents/workout-planner/prompt.v1.md');
    expect(files).toContain('src/server/agents/equipment-vision/prompt.v1.md');
    expect(files).toContain('src/server/domain/rulebook/rulebook.v3.ts');
    expect(files).toContain('data/seed/exercises.v2.json');
    expect(manifestHash()).toMatch(/^[0-9a-f]{64}$/);
  });

  it('D-38: the gate fails on a stale hash, a failed suite or a missing file', () => {
    const ok = {
      manifest_hash: 'h',
      run_id: 'r',
      suites: Object.fromEntries(['EV-1', 'EV-2', 'EV-3', 'EV-4', 'EV-5'].map((k) => [k, { passed: true }])),
    };
    expect(checkGate(ok, 'h')).toEqual([]);
    expect(checkGate(ok, 'other')).toHaveLength(1);
    expect(checkGate({ ...ok, suites: { ...ok.suites, 'EV-5': { passed: false } } }, 'h')).toEqual([
      'EV-5 did not pass in run r',
    ]);
    expect(checkGate(null, 'h')).toHaveLength(1);
  });
});

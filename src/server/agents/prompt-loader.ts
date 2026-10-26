import 'server-only';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { AGENT_CONFIG, type AgentId } from './agent-config';

// Prompts are static files with {{PLACEHOLDER}} tokens for static data only (agent-runtime.md §3).
const DIRS: Record<AgentId, string> = {
  ag1_equipment_vision: 'equipment-vision',
  ag2_input_guard: 'input-guard',
  ag3_workout_planner: 'workout-planner',
};

export type SystemPrompt = { text: string; sha256: string; version: string };

const cache = new Map<string, SystemPrompt>();

export function readPromptFile(agent: AgentId): string {
  const version = AGENT_CONFIG[agent].promptVersion.split('.').pop()!; // 'v1'
  return readFileSync(path.join(process.cwd(), 'src/server/agents', DIRS[agent], `prompt.${version}.md`), 'utf8');
}

/** Renders once per (agent, static-data key); every request on one version sends byte-identical text. */
export function loadSystemPrompt(agent: AgentId, placeholders: Record<string, string>, cacheKey = ''): SystemPrompt {
  const key = `${agent}|${cacheKey}`;
  const hit = cache.get(key);
  if (hit) return hit;
  let text = readPromptFile(agent);
  for (const [name, value] of Object.entries(placeholders)) text = text.split(`{{${name}}}`).join(value);
  const left = text.match(/\{\{[A-Z_]+\}\}/);
  if (left) throw new Error(`Unrendered placeholder ${left[0]} in ${agent} prompt`);
  const prompt = {
    text,
    sha256: createHash('sha256').update(text).digest('hex'),
    version: AGENT_CONFIG[agent].promptVersion,
  };
  cache.set(key, prompt);
  return prompt;
}

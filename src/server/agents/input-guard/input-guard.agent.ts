import 'server-only';
import { fenceUserText } from '@/lib/security/prompt-input';
import { BODY_AREAS, MUSCLE_GROUPS } from '@/shared/constants';
import type { AgentDefinition } from '../run-agent';
import { loadSystemPrompt } from '../prompt-loader';
import { makeInputGuardOutput, type InputGuardOutput } from './input-guard.schema';

// AG-2 Input Guard: the ONLY agent that sees user text (agent-ag2-input-guard.md).
export type InputGuardInput = {
  mode: 'note' | 'edit';
  planItems: Array<{ ref: number; name: string; muscle_group: string }>;
  text: string; // normalizeUserText already applied by the service
  equipment: Array<{ id: string; name: string }>; // active, by sort_order
  datasetVersion: string;
};

export function userContentText(input: InputGuardInput): string {
  return `${JSON.stringify({ mode: input.mode, plan_items: input.planItems })}\n${fenceUserText(input.text)}`;
}

const schemas = new Map<string, ReturnType<typeof makeInputGuardOutput>>();

export function inputGuardAgent(
  input: Pick<InputGuardInput, 'equipment' | 'datasetVersion'>,
): AgentDefinition<InputGuardInput, InputGuardOutput> {
  const ids = input.equipment.map((e) => e.id) as [string, ...string[]];
  let schema = schemas.get(input.datasetVersion);
  if (!schema) {
    schema = makeInputGuardOutput(ids);
    schemas.set(input.datasetVersion, schema);
  }
  return {
    id: 'ag2_input_guard',
    schema,
    system: () =>
      loadSystemPrompt(
        'ag2_input_guard',
        {
          MUSCLE_GROUPS: MUSCLE_GROUPS.join(', '),
          BODY_AREAS: BODY_AREAS.join(', '),
          EQUIPMENT_LIST: input.equipment.map((e) => `${e.id} | ${e.name}`).join('\n'),
        },
        input.datasetVersion,
      ),
    buildUserContent: (i) => [{ type: 'text', text: userContentText(i) }],
    // The raw text is allowed in agent_logs only (30 days).
    redactForLog: (i) => ({ mode: i.mode, plan_items: i.planItems, user_text: i.text }),
    freeTextLogFields: ['user_text'],
  };
}

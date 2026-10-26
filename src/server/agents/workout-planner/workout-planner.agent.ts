import 'server-only';
import { MUSCLE_GROUPS } from '@/shared/constants';
import { WorkoutPlannerOutput } from '@/shared/schemas/domain/workout-plan';
import { renderRulebookForPrompt, RULEBOOK_VERSION } from '@/server/domain/rulebook/rulebook.v1';
import type { AgentDefinition } from '../run-agent';
import { loadSystemPrompt } from '../prompt-loader';
import { contextForLog, renderContext, type PlannerContext } from './render-context';

// AG-3 Workout Planner (agent-ag3-workout-planner.md): IDs and numbers only, from code-built candidates.
export const workoutPlannerAgent: AgentDefinition<PlannerContext, WorkoutPlannerOutput> = {
  id: 'ag3_workout_planner',
  schema: WorkoutPlannerOutput,
  system: () =>
    loadSystemPrompt(
      'ag3_workout_planner',
      { RULEBOOK: renderRulebookForPrompt(), MUSCLE_GROUPS: MUSCLE_GROUPS.join(', ') },
      RULEBOOK_VERSION,
    ),
  buildUserContent: (c) => [{ type: 'text', text: renderContext(c) }],
  redactForLog: (c) => contextForLog(c),
};

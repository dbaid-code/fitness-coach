'use client';

import type { QueryClient } from '@tanstack/react-query';
import type { PlanDto, PlannerBootstrap } from '@/shared/schemas/api/plans';

/** Every plan mutation response replaces ['plan', id] and the planner's active plan (frontend-architecture.md §4). */
export function setActivePlan(qc: QueryClient, plan: PlanDto | null): void {
  if (plan) qc.setQueryData(['plan', plan.id], plan);
  const active = plan && (plan.status === 'draft' || plan.status === 'accepted') ? plan : null;
  qc.setQueryData<PlannerBootstrap>(['planner'], (old) => (old ? { ...old, active_plan: active } : old));
}

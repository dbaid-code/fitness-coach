'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import type { PlannerBootstrap } from '@/shared/schemas/api/plans';

export function usePlanner(initialData: PlannerBootstrap) {
  return useQuery({
    queryKey: ['planner'],
    queryFn: () => api<PlannerBootstrap>('GET', '/api/v1/planner'),
    initialData,
  });
}

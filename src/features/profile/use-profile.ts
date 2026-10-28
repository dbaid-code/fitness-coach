'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import type { ProfileDto } from '@/shared/schemas/api/profile';

export function useProfile(initialData: ProfileDto) {
  return useQuery({
    queryKey: ['profile'],
    queryFn: async () => (await api<{ profile: ProfileDto }>('GET', '/api/v1/profile')).profile,
    initialData,
  });
}

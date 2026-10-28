'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import type { HistoryPage } from '@/shared/schemas/api/plans';

export function useHistory(initial: HistoryPage) {
  return useInfiniteQuery({
    queryKey: ['history'],
    queryFn: ({ pageParam }) =>
      api<HistoryPage>('GET', `/api/v1/history${pageParam ? `?cursor=${encodeURIComponent(pageParam)}` : ''}`),
    initialPageParam: null as string | null,
    getNextPageParam: (p) => p.next_cursor,
    initialData: { pages: [initial], pageParams: [null] },
  });
}

import { QueryClient } from '@tanstack/react-query';

// frontend-architecture.md §4
export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: 1, refetchOnWindowFocus: true, staleTime: 30_000 },
      mutations: { retry: 0 },
    },
  });
}

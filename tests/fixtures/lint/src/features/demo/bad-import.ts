// Lint fixture (project-foundation.md §13.5): client feature code importing server code must fail lint.
import { env } from '@/server/config/env';

export const leaked = env.APP_ENV;

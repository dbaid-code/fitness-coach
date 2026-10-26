import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { env } from '@/server/config/env';
import { SDK_MAX_RETRIES } from './agent-config';

// One instance per server instance; never constructed when AGENTS_MODE=fake (agent-runtime.md §2).
let client: Anthropic | null = null;

export function anthropic(): Anthropic {
  client ??= new Anthropic({
    apiKey: env.ANTHROPIC_API_KEY,
    baseURL: env.ANTHROPIC_API_BASE_URL, // explicit, so a stray ANTHROPIC_BASE_URL can't redirect calls
    maxRetries: SDK_MAX_RETRIES,
  });
  return client;
}

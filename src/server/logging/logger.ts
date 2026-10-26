import 'server-only';
import { scrubSecrets } from '@/lib/security/secrets';
import { sanitizeErrorMessage, sanitizeErrorStack } from '@/lib/security/redaction';
import { SERVER_ERROR_MESSAGE_MAX, SERVER_ERROR_STACK_MAX_BYTES } from '@/server/config/app-config';

// One JSON line per call (observability-and-metrics.md §2). LogFields is closed: request bodies,
// notes, edit text and photos can never be passed.
export type LogFields = {
  request_id: string;
  route?: string;
  method?: string;
  status?: number;
  latency_ms?: number;
  user_id?: string | null;
  agent?: string;
  outcome?: string;
  error_name?: string;
  error_code?: string;
};

type Level = 'info' | 'warn' | 'error';

function write(level: Level, msg: string, fields: LogFields & { err?: unknown }): void {
  const { err, ...rest } = fields;
  const line: Record<string, unknown> = {
    level,
    msg,
    time: new Date().toISOString(),
    app_env: process.env.APP_ENV,
    ...rest,
  };
  if (err instanceof Error) {
    line.error_name ??= err.name;
    line.error_message = sanitizeErrorMessage(err.message, { maxChars: SERVER_ERROR_MESSAGE_MAX });
    if (err.stack) line.stack = sanitizeErrorStack(err.stack, { maxBytes: SERVER_ERROR_STACK_MAX_BYTES });
  }
  const text = scrubSecrets(JSON.stringify(line));
  if (level === 'error') console.error(text);
  else if (level === 'warn') console.warn(text);
  else console.log(text);
}

export const logger = {
  info: (msg: string, fields: LogFields) => write('info', msg, fields),
  warn: (msg: string, fields: LogFields) => write('warn', msg, fields),
  error: (msg: string, fields: LogFields & { err?: unknown }) => write('error', msg, fields),
};

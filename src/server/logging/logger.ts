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

function write(
  level: Level,
  msg: string,
  fields: LogFields & { err?: unknown },
  bodyStrings: readonly string[] = [],
): void {
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
    line.error_message = sanitizeErrorMessage(err.message, { maxChars: SERVER_ERROR_MESSAGE_MAX, bodyStrings });
    if (err.stack) line.stack = sanitizeErrorStack(err.stack, { maxBytes: SERVER_ERROR_STACK_MAX_BYTES, bodyStrings });
  }
  const text = scrubSecrets(JSON.stringify(line));
  if (level === 'error') console.error(text);
  else if (level === 'warn') console.warn(text);
  else console.log(text);
}

export const logger = {
  info: (msg: string, fields: LogFields) => write('info', msg, fields),
  warn: (msg: string, fields: LogFields) => write('warn', msg, fields),
  /** `bodyStrings` (collectBodyStrings of the request body) are cut out of the error message and stack. */
  error: (msg: string, fields: LogFields & { err?: unknown }, bodyStrings?: readonly string[]) =>
    write('error', msg, fields, bodyStrings),
};

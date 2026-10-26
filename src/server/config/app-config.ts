import 'server-only';

// Server-only numbers (configuration-and-constants.md §3, engineering doc Appendix B).
export const RULE_48H_HOURS = 48;
export const FREQUENCY_MIN_COMPLETED = 3;
export const FREQUENCY_WINDOW_DAYS = 14;
export const HISTORY_SUMMARY_MAX_WORKOUTS = 5;
export const HISTORY_SUMMARY_DAYS = 28;

export const GENERATION_DEADLINE_MS = 20_000;
export const SCAN_DEADLINE_MS = 30_000;
export const DB_WRITE_RESERVE_MS = 1_500; // time kept back from the deadline for tx 2

export const IDEMPOTENCY_TTL_MIN = 60;
export const INFLIGHT_WINDOW_S = 60;
export const RESET_CONTEXT_WINDOW_HOURS = 12;
export const EVENT_CLIENT_TIME_SKEW_HOURS = 24;

export const REFERENCE_CACHE_TTL_S = 600;
export const DB_POOL_MAX = 5;
export const DB_CONNECT_TIMEOUT_S = 10;
export const HEALTH_DB_TIMEOUT_MS = 2_000;

export const SERVER_ERROR_MESSAGE_MAX = 500;
export const SERVER_ERROR_STACK_MAX_BYTES = 4_096;

// S-3 (D-43): body caps, read with readBodyWithLimit before parsing.
export const API_JSON_BODY_MAX_BYTES = 32_768;
export const API_MULTIPART_BODY_MAX_BYTES = 4_259_840; // 4 MiB + 64 KiB

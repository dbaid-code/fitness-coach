// Route lists shared by proxy.ts, layouts and the log-in form.
export const APP_PATHS = ['/onboarding', '/plan', '/history', '/profile'] as const;
/** S-4 (D-44): the only post-auth destinations. */
export const SAFE_NEXT_PREFIXES = ['/plan', '/onboarding', '/history', '/profile', '/update-password'] as const;

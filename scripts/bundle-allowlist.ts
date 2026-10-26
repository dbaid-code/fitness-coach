// Known-benign library code removed before the client-bundle scan (security plan §4).
//
// The scan deliberately matches bare key prefixes (CLIENT_BUNDLE_FORBIDDEN_PATTERNS), so a leaked prefix
// check from env.ts is caught. @supabase/supabase-js ships one such check in browser code to tell the two
// new key types apart: `k.startsWith("sb_publishable_") || k.startsWith("sb_secret_")`. Only that exact
// paired expression (same variable, publishable first; minified or not) is exempt. Anything else that
// contains the prefix, including a lone `startsWith("sb_secret_")`, still fails the scan.
const SUPABASE_KEY_TYPE_CHECK =
  /([A-Za-z_$][\w$]*)\.startsWith\((["'`])sb_publishable_\2\)\s*\|\|\s*\1\.startsWith\(\2sb_secret_\2\)/g;

export function stripKnownLibrarySnippets(source: string): string {
  return source.replace(SUPABASE_KEY_TYPE_CHECK, '/*supabase-js key-type check*/');
}

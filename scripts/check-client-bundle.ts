// Fails if a client bundle contains a secret marker (security-and-privacy.md §4; security plan §4).
// Runs in CI after `pnpm build`.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { CLIENT_BUNDLE_FORBIDDEN_PATTERNS, findSecrets } from '../src/lib/security/secrets';
import { stripKnownLibrarySnippets } from './bundle-allowlist';

const root = '.next/static';

function* jsFiles(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* jsFiles(path);
    else if (path.endsWith('.js')) yield path;
  }
}

let failures = 0;
let scanned = 0;
try {
  for (const file of jsFiles(root)) {
    scanned++;
    const found = findSecrets(stripKnownLibrarySnippets(readFileSync(file, 'utf8')), CLIENT_BUNDLE_FORBIDDEN_PATTERNS);
    if (found.length > 0) {
      failures++;
      console.error(`${file}: ${found.join(', ')}`);
    }
  }
} catch (err) {
  console.error(`Cannot scan ${root}; run pnpm build first.`, err);
  process.exit(1);
}

if (scanned === 0) {
  console.error(`No client bundles found under ${root}.`);
  process.exit(1);
}
if (failures > 0) process.exit(1);
console.warn(`check-client-bundle: ${scanned} files clean.`);

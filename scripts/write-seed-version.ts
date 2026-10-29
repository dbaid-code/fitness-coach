// Rewrites src/server/config/dataset-version.ts from the committed seed files (D-57).
// Usage: pnpm seed:version
import { writeFileSync } from 'node:fs';
import { datasetVersionFile } from './seed/hash';
import { loadSeed } from './seed/load';

writeFileSync('src/server/config/dataset-version.ts', datasetVersionFile(loadSeed()));
console.warn('Wrote src/server/config/dataset-version.ts');

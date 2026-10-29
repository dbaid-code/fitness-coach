// Uploads exercise images to the public `exercise-images` bucket (reference-data-seed.md §7).
// Usage: pnpm seed:images --env local|dev|prod  (NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY for that env)
// Besides account deletion, the only user of the secret key.
import { createClient } from '@supabase/supabase-js';
import { loadSeed } from './seed/load';
import { RequestError, storageRequestError, withRetry } from './seed/retry';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) {
  console.error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY for the target environment.');
  process.exit(1);
}

// One exercise at a time took 10.5 minutes for 900 of the 1,356 images from a GitHub runner to ap-south-1.
const CONCURRENCY = 4;

const seed = loadSeed();
const commit = seed.exercises.source.commit;
const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const bucket = supabase.storage.from('exercise-images');

type Exercise = (typeof seed.exercises.exercises)[number];

let uploaded = 0;
let skipped = 0;
async function syncExercise(e: Exercise) {
  const existing = await withRetry(`List ${e.id}`, async () => {
    const { data, error } = await bucket.list(e.id);
    if (error) throw storageRequestError(`List failed for ${e.id}`, error);
    return data;
  });
  const sizes = new Map(existing.map((o) => [o.name, (o.metadata as { size?: number } | null)?.size]));
  for (const path of e.image_paths) {
    const name = path.split('/').pop()!;
    const bytes = await withRetry(`Download ${path}`, async () => {
      const res = await fetch(`https://raw.githubusercontent.com/yuhonas/free-exercise-db/${commit}/exercises/${path}`);
      if (!res.ok) throw new RequestError(`Download failed (${res.status}) for ${path}`, res.status);
      return new Uint8Array(await res.arrayBuffer());
    });
    if (sizes.get(name) === bytes.byteLength) {
      skipped++;
      continue;
    }
    await withRetry(`Upload ${path}`, async () => {
      const { error } = await bucket.upload(`${e.id}/${name}`, bytes, {
        contentType: 'image/jpeg',
        cacheControl: '31536000',
        upsert: true,
      });
      if (error) throw storageRequestError(`Upload failed for ${path}`, error);
    });
    uploaded++;
  }
}

const queue = seed.exercises.exercises.filter((x) => x.is_active && x.image_paths.length > 0);
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    for (let e = queue.shift(); e; e = queue.shift()) {
      try {
        await syncExercise(e);
      } catch (err) {
        queue.length = 0; // stop the other workers after their current exercise
        throw err;
      }
    }
  }),
);
console.warn(`Images: ${uploaded} uploaded, ${skipped} unchanged.`);

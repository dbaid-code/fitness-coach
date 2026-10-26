// Uploads exercise images to the public `exercise-images` bucket (reference-data-seed.md §7).
// Usage: pnpm seed:images --env local|dev|prod  (NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY for that env)
// Besides account deletion, the only user of the secret key.
import { createClient } from '@supabase/supabase-js';
import { loadSeed } from './seed/load';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) {
  console.error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY for the target environment.');
  process.exit(1);
}

const seed = loadSeed();
const commit = seed.exercises.source.commit;
const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const bucket = supabase.storage.from('exercise-images');

let uploaded = 0;
let skipped = 0;
for (const e of seed.exercises.exercises.filter((x) => x.is_active && x.image_paths.length > 0)) {
  const { data: existing } = await bucket.list(e.id);
  const sizes = new Map((existing ?? []).map((o) => [o.name, (o.metadata as { size?: number } | null)?.size]));
  for (const path of e.image_paths) {
    const name = path.split('/').pop()!;
    const res = await fetch(`https://raw.githubusercontent.com/yuhonas/free-exercise-db/${commit}/exercises/${path}`);
    if (!res.ok) throw new Error(`Download failed (${res.status}) for ${path}`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (sizes.get(name) === bytes.byteLength) {
      skipped++;
      continue;
    }
    const { error } = await bucket.upload(`${e.id}/${name}`, bytes, {
      contentType: 'image/jpeg',
      cacheControl: '31536000',
      upsert: true,
    });
    if (error) throw new Error(`Upload failed for ${path}: ${error.message}`);
    uploaded++;
  }
}
console.warn(`Images: ${uploaded} uploaded, ${skipped} unchanged.`);

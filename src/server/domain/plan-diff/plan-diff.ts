// Edit-mode highlights (FR-52; §8.8). Removed items cannot be highlighted; warm-up/cool-down never are.
export type MainItem = { exerciseId: string; sets: number; reps: number | null; timePerSetS: number | null };

/** Indices into `after` that changed: new exercise, new numbers, or the target of an applied reorder. */
export function changedItems(before: MainItem[], after: MainItem[], appliedReorderTargets: Set<string>): Set<number> {
  const prev = new Map(before.map((i) => [i.exerciseId, i]));
  const changed = new Set<number>();
  after.forEach((item, idx) => {
    const old = prev.get(item.exerciseId);
    if (
      !old ||
      old.sets !== item.sets ||
      old.reps !== item.reps ||
      old.timePerSetS !== item.timePerSetS ||
      appliedReorderTargets.has(item.exerciseId)
    ) {
      changed.add(idx);
    }
  });
  return changed;
}

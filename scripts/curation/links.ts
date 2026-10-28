// Version links (reference-data-seed.md §5; validate.ts check 4). The LLM drafts each batch of 20 on its own, so A can
// name B as easier without B naming A as harder. This turns the drafted links into symmetric, acyclic chains.

export type VersionLinks = { id: string; easier_version_id: string | null; harder_version_id: string | null };

/**
 * Candidate edges (easier → harder) come from both fields. Edges both ends agree on win, then one-sided ones,
 * each in id order; an edge is kept only while both slots are free and it adds no cycle. Self-links and
 * unknown ids are dropped.
 */
export function reconcileVersionLinks<T extends VersionLinks>(rows: T[]): T[] {
  const ids = new Set(rows.map((r) => r.id));
  const votes = new Map<string, number>();
  const vote = (lo: string | null, hi: string | null) => {
    if (!lo || !hi || lo === hi || !ids.has(lo) || !ids.has(hi)) return;
    const key = `${lo}\u0000${hi}`;
    votes.set(key, (votes.get(key) ?? 0) + 1);
  };
  for (const r of rows) {
    vote(r.easier_version_id, r.id);
    vote(r.id, r.harder_version_id);
  }
  const edges = [...votes.entries()]
    .map(([key, n]) => {
      const [lo, hi] = key.split('\u0000') as [string, string];
      return { lo, hi, n };
    })
    .sort((a, b) => b.n - a.n || a.lo.localeCompare(b.lo, 'en') || a.hi.localeCompare(b.hi, 'en'));

  const harder = new Map<string, string>();
  const easier = new Map<string, string>();
  const reaches = (from: string, to: string) => {
    for (let at: string | undefined = from; at; at = harder.get(at)) if (at === to) return true;
    return false;
  };
  for (const { lo, hi } of edges) {
    if (harder.has(lo) || easier.has(hi) || reaches(hi, lo)) continue;
    harder.set(lo, hi);
    easier.set(hi, lo);
  }
  return rows.map((r) => ({
    ...r,
    easier_version_id: easier.get(r.id) ?? null,
    harder_version_id: harder.get(r.id) ?? null,
  }));
}

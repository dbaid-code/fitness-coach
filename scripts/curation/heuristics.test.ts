import { describe, expect, it } from 'vitest';
import type { RawExercise } from '../seed/schemas';
import { guardBodyweight } from './heuristics';

const raw = (name: string, equipment: string | null) => ({ id: name, name, equipment }) as unknown as RawExercise;

describe('F-02 curation bodyweight guard', () => {
  it('keeps a drafted equipment list, and [] for exercises the source calls bodyweight', () => {
    expect(guardBodyweight(raw('Hammer Curls', 'dumbbell'), ['dumbbells'])).toEqual(['dumbbells']);
    expect(guardBodyweight(raw('Push-Ups', 'body only'), [])).toEqual([]);
    expect(guardBodyweight(raw('Plank', null), [])).toEqual([]);
  });

  it('a drafted [] for equipment the source names falls back to the deterministic mapping', () => {
    expect(guardBodyweight(raw('Hammer Curls', 'dumbbell'), [])).toEqual(['dumbbells']);
  });

  it('an unmappable machine becomes null (inactive), not bodyweight', () => {
    expect(guardBodyweight(raw('Ab Crunch Machine', 'machine'), [])).toBeNull();
  });

  it('D-53: a drafted [] stands when the source says "other" (assumed-available items such as cones)', () => {
    expect(guardBodyweight(raw('Lateral Cone Hops', 'other'), [])).toEqual([]);
  });
});

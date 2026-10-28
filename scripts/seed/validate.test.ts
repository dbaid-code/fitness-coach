import { describe, expect, it } from 'vitest';
import { loadSeed } from './load';
import { validateSeed } from './validate';

describe('F-02 seed validation', () => {
  const seed = loadSeed();

  it('the committed seed files pass', () => {
    expect(validateSeed(seed, 'h\n' + Array.from({ length: 100 }, () => 'x,"yes",""').join('\n')).errors).toEqual([]);
  });

  it('FR-20: an active equipment list longer than MAX_EQUIPMENT_IDS fails', () => {
    const broken = structuredClone(seed);
    broken.equipment.items.find((i) => i.id === 'exercise_mat')!.is_active = true;
    expect(validateSeed(broken, null).errors).toContain('equipment: 63 active items exceed MAX_EQUIPMENT_IDS (62)');
  });

  it('reports asymmetric chains, unknown equipment and short routines', () => {
    const broken = structuredClone(seed);
    const ex = broken.exercises.exercises.find((e) => e.id === 'Pushups')!;
    ex.harder_version_id = 'Plank';
    ex.required_equipment = ['spaceship'];
    broken.routines.routines[0]!.moves[0]!.duration_s = 30;
    const { errors } = validateSeed(broken, null);
    expect(errors).toEqual(
      expect.arrayContaining([
        'exercise Pushups: harder_version_id Plank is not symmetric',
        'exercise Pushups: unknown or inactive equipment spaceship',
        expect.stringMatching(/moves sum to 270/),
        'review-sample.v2.csv is missing',
      ]),
    );
  });
});

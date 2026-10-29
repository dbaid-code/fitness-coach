// Deterministic curation rules (reference-data-seed.md §5, `--heuristic` mode). Used when no Anthropic key
// is available; produces the same columns as the LLM path so the owner's 10% review covers both.
// Rules are deliberately conservative: an exercise whose equipment cannot be mapped to the original 30-item
// master list is made inactive rather than guessed.
import type { BodyArea, MuscleGroup } from '../../src/shared/constants';
import type { RawExercise, SeedExercise } from '../seed/schemas';

const has = (n: string, re: RegExp) => re.test(n);

function bench(n: string): string[] {
  if (has(n, /bent.?over|standing|upright/)) return [];
  if (has(n, /incline|decline|seated|preacher/)) return ['adjustable_bench'];
  if (has(n, /bench|lying|pullover|skull|prone|flye|\bfly\b|chest.?supported|floor press/)) {
    return has(n, /floor press/) ? [] : ['flat_bench'];
  }
  return [];
}

function rack(n: string): string[] {
  return has(n, /squat|military press|standing.*press|push press|good morning|lunge|rack|shrug/) ? ['squat_rack'] : [];
}

const MACHINES: Array<[RegExp, string | null]> = [
  [/smith/, 'smith_machine'],
  [/hack squat/, null],
  [/calf press on the leg press|leg press/, 'leg_press_machine'],
  [/leg extension/, 'leg_extension_machine'],
  [/leg curl/, 'leg_curl_machine'],
  [/chest press|machine bench press/, 'chest_press_machine'],
  [/shoulder press|military press/, 'shoulder_press_machine'],
  [/butterfly|pec deck|reverse machine flyes/, 'pec_deck'],
  [/high row|iso row/, 'seated_row_machine'],
  [/treadmill/, 'treadmill'],
  [/bicycling|bike/, 'stationary_bike'],
  [/rowing/, 'rowing_machine'],
  [/elliptical/, 'elliptical'],
  [/stairmaster|step mill/, 'stair_climber'],
];

/** Exercises with equipment "other" or "body only" that need a listed item. */
const NAMED: Array<[RegExp, string[] | null]> = [
  [/band assisted pull/, ['pull_up_bar', 'resistance_bands']],
  [
    /weighted|sled|chain|suspended|box|cone|hurdle|battling|heavy bag|plate|trap bar|sledgehammer|rope climb|london bridge|otis|wrist roller|ab roller|drop push|svend|hyperextension|back extension|bodyweight mid row|inverted row with straps|balance board|skating|prowler|^bicycling$|ring dip|donkey calf|platform hamstring|bench sprint|quick leap|glute.?ham|clock push|close-grip push-up off of a dumbbell/,
    null,
  ],
  [/pull.?up|chin|muscle.?up|one handed hang|hanging/, ['pull_up_bar']],
  [/knee hip raise on parallel bars|parallel bar dip|dips - chest version|^dips/, ['dip_station']],
  [/bench dip/, ['flat_bench']],
  [/rope jumping|jump rope/, ['jump_rope']],
  [/exercise ball|physioball|stability ball|bosu/, ['stability_ball']],
  [/smr/, ['foam_roller']],
];

/** Required equipment, or null when it cannot be mapped (→ inactive). */
export function requiredEquipment(raw: RawExercise): string[] | null {
  const n = raw.name.toLowerCase();
  const named = NAMED.find(([re]) => re.test(n));
  switch (raw.equipment) {
    case 'dumbbell':
      return ['dumbbells', ...(has(n, /exercise ball/) ? ['stability_ball'] : bench(n))];
    case 'barbell':
      return ['barbell', ...bench(n), ...rack(n)].filter((v, i, a) => a.indexOf(v) === i);
    case 'e-z curl bar':
      return ['ez_curl_bar', ...bench(n)];
    case 'kettlebells':
      return ['kettlebells'];
    case 'bands':
      return ['resistance_bands'];
    case 'medicine ball':
      return ['medicine_ball'];
    case 'exercise ball':
      return ['stability_ball'];
    case 'foam roll':
      return ['foam_roller'];
    case 'cable':
      if (has(n, /pulldown|pull-down|lat pull/)) return ['lat_pulldown_machine'];
      if (has(n, /seated cable row|seated row/)) return ['seated_row_machine'];
      return ['cable_machine', ...(has(n, /incline|decline|bench|lying/) ? bench(n) : [])];
    case 'machine': {
      const m = MACHINES.find(([re]) => re.test(n));
      return m && m[1] ? [m[1]] : null;
    }
    case 'other':
      if (raw.category === 'stretching') return [];
      return named ? named[1] : null;
    default:
      // 'body only' or missing
      if (named) return named[1];
      if (has(n, /\bbox\b/)) return null;
      return has(n, /\bbench\b/) ? ['flat_bench'] : [];
  }
}

const AREA_RULES: Array<[BodyArea, RegExp, MuscleGroup[] | null]> = [
  [
    'knees',
    /squat|lunge|leg press|step.?up|jump|hop|bound|leg extension|split|pistol|sprint|skip|run|jog|stair|step mill|burpee|high knees|skater|mountain climber|carioca|elliptical|bicycl|bike|rowing/,
    null,
  ],
  [
    'lower_back',
    /deadlift|good morning|bent.?over|t-bar|row|hyperextension|back extension|superman|clean|swing|barbell.*squat|squat.*barbell|front squat|zercher|sit-up|jackknife|leg raise/,
    null,
  ],
  ['hips', /deadlift|lunge|squat|bridge|hip|good morning|swing|kick|abduct|adduct|split|leg raise|step.?up/, null],
  [
    'shoulders',
    /press|push.?up|dip|raise|fly|flye|pull.?up|chin|upright row|pullover|handstand|overhead|bench|crossover|pec|snatch|jerk|arnold/,
    ['chest', 'shoulders', 'triceps', 'back'],
  ],
  ['elbows', /curl|extension|skull|pushdown|kickback|dip|close.?grip|french|tate|jm press/, ['biceps', 'triceps']],
  ['wrists', /push.?up|plank|wrist|front squat|clean|handstand|mountain climber|burpee|crawl|forearm/, null],
  ['ankles', /calf|jump|hop|skip|run|jog|sprint|bound|rope|jack|high knees|skater|step mill|stair/, null],
  ['neck', /neck|crunch|sit.?up|shrug/, null],
  [
    'upper_back',
    /shrug|row|pull.?up|chin|pulldown|face pull|rear delt|reverse fly|reverse flye/,
    ['back', 'shoulders'],
  ],
];

export function bodyAreasStressed(raw: RawExercise, group: MuscleGroup | null): BodyArea[] {
  const n = raw.name.toLowerCase();
  const areas = new Set<BodyArea>();
  for (const [area, re, groups] of AREA_RULES) {
    if (re.test(n) && (!groups || (group !== null && groups.includes(group)))) areas.add(area);
  }
  if (raw.category === 'plyometrics') {
    areas.add('knees');
    areas.add('ankles');
  }
  // Exclude leg curl/extension false positives on the elbows rule.
  if (group === 'legs') areas.delete('elbows');
  return [...areas];
}

const HOLDS = new Set(['Plank', 'Side_Bridge', 'One_Handed_Hang', 'Isometric_Chest_Squeezes']);

export function cardShape(raw: RawExercise): { card_type: 'reps' | 'timed'; timed_kind: 'hold' | 'continuous' | null } {
  if (raw.category === 'cardio') return { card_type: 'timed', timed_kind: 'continuous' };
  if (HOLDS.has(raw.id) || raw.category === 'stretching') return { card_type: 'timed', timed_kind: 'hold' };
  return { card_type: 'reps', timed_kind: null };
}

export function mechanicFor(raw: RawExercise): 'compound' | 'isolation' {
  if (raw.mechanic) return raw.mechanic;
  if (raw.category === 'cardio' || raw.category === 'plyometrics') return 'compound';
  return raw.secondaryMuscles.length > 0 ? 'compound' : 'isolation';
}

/** Hand-picked progressions (symmetric, acyclic); the validator rejects anything else. */
export const CHAINS: Array<string[]> = [
  ['Incline_Push-Up', 'Pushups', 'Push-Ups_With_Feet_Elevated'],
  ['Band_Assisted_Pull-Up', 'Pullups'],
  ['Butt_Lift_Bridge', 'Single_Leg_Glute_Bridge'],
  ['Bodyweight_Squat', 'Freehand_Jump_Squat'],
  ['Crunches', 'Tuck_Crunch'],
];

export function chainLinks(): Map<string, { easier: string | null; harder: string | null }> {
  const links = new Map<string, { easier: string | null; harder: string | null }>();
  for (const chain of CHAINS) {
    chain.forEach((id, i) => links.set(id, { easier: chain[i - 1] ?? null, harder: chain[i + 1] ?? null }));
  }
  return links;
}

type CustomRow = Pick<SeedExercise, 'id' | 'name' | 'instructions' | 'body_areas_stressed'>;

/**
 * Custom bodyweight biceps row: free-exercise-db has no biceps exercise without equipment, and the
 * coverage rule (§8.6) needs one per group. Flagged for the owner's M1 review.
 */
/**
 * Custom bodyweight back row: with LLM curation, Inverted Row correctly needs a bar in a rack and Superman is a
 * stretching-category source row, so free-exercise-db has no active bodyweight beginner back exercise. The coverage
 * rule (§8.6) needs one per group. Flagged for the owner's review.
 */
export const CUSTOM_BACK: CustomRow[] = [
  {
    id: 'gc_floor_back_extension_hold',
    name: 'Floor Back Extension Hold',
    body_areas_stressed: ['lower_back'],
    instructions: [
      'Lie face down on the floor with your arms by your sides, palms facing down.',
      'Squeeze your shoulder blades together and lift your chest a few centimetres off the floor.',
      'Keep your neck long and your eyes on the floor; your legs stay down.',
      'Hold the position for the set time, breathing steadily, then lower slowly.',
    ],
  },
];

export const CUSTOM_BICEPS: CustomRow[] = [
  {
    id: 'gc_towel_biceps_curl_hold',
    name: 'Towel Biceps Curl Hold',
    body_areas_stressed: ['elbows'],
    instructions: [
      'Stand on the middle of a gym towel and hold one end in each hand, palms up.',
      'Bend your elbows to about 90 degrees, keeping them by your sides.',
      'Pull up hard against the towel without moving, as if curling it.',
      'Hold the effort for the set time, breathing steadily, then relax.',
    ],
  },
];

/**
 * Limited-equipment pools (option A, owner 2026-10-29): the first full eval run judged plans for bodyweight, band and
 * home-cardio users poorly balanced (EV-2). free-exercise-db has no bodyweight row, pike push-up, band row or band
 * curl, so these custom rows fill shoulders, back and biceps. Door, towel and floor are assumed available (D-53).
 * Flagged for the owner's review.
 */
export type CustomFullRow = CustomRow &
  Pick<SeedExercise, 'muscle_group' | 'mechanic' | 'level' | 'force' | 'primary_muscles' | 'required_equipment'>;

export const CUSTOM_LIMITED: CustomFullRow[] = [
  {
    id: 'gc_pike_push_up',
    name: 'Pike Push-Up',
    muscle_group: 'shoulders',
    mechanic: 'compound',
    level: 'intermediate',
    force: 'push',
    primary_muscles: ['shoulders'],
    required_equipment: [],
    body_areas_stressed: ['shoulders', 'wrists', 'elbows'],
    instructions: [
      'Start in a push-up position, then walk your feet in and lift your hips so your body makes an upside-down V.',
      'Keep your arms straight, hands shoulder-width apart, head between your arms.',
      'Bend your elbows to lower the top of your head towards the floor between your hands.',
      'Press back up to straight arms, keeping your hips high throughout.',
    ],
  },
  {
    id: 'gc_floor_y_raise',
    name: 'Floor Y Raise',
    muscle_group: 'shoulders',
    mechanic: 'isolation',
    level: 'beginner',
    force: 'pull',
    primary_muscles: ['shoulders'],
    required_equipment: [],
    body_areas_stressed: ['shoulders', 'upper_back'],
    instructions: [
      'Lie face down with your arms stretched overhead in a Y shape, thumbs pointing up.',
      'Keep your forehead resting on the floor or just above it.',
      'Squeeze your shoulder blades and lift both arms a few centimetres off the floor.',
      'Pause for a second at the top, then lower your arms slowly.',
    ],
  },
  {
    id: 'gc_door_frame_towel_row',
    name: 'Door Frame Towel Row',
    muscle_group: 'back',
    mechanic: 'compound',
    level: 'beginner',
    force: 'pull',
    primary_muscles: ['middle back'],
    required_equipment: [],
    body_areas_stressed: ['shoulders', 'elbows'],
    instructions: [
      'Loop a towel around a sturdy door frame or post and hold one end in each hand.',
      'Walk your feet towards the frame and lean back until your arms are straight and your body is in a line.',
      'Pull your chest towards your hands, squeezing your shoulder blades together.',
      'Lower yourself back slowly until your arms are straight. Stand more upright to make it easier.',
    ],
  },
  {
    id: 'gc_floor_w_pull',
    name: 'Floor W Pull',
    muscle_group: 'back',
    mechanic: 'isolation',
    level: 'beginner',
    force: 'pull',
    primary_muscles: ['middle back'],
    required_equipment: [],
    body_areas_stressed: ['upper_back', 'lower_back'],
    instructions: [
      'Lie face down with your arms stretched overhead, a little off the floor.',
      'Pull your elbows down towards your ribs so your arms make a W, squeezing your shoulder blades.',
      'Keep your chest slightly lifted and your eyes on the floor.',
      'Reach your arms back overhead slowly and repeat.',
    ],
  },
  {
    id: 'gc_band_bent_over_row',
    name: 'Band Bent-Over Row',
    muscle_group: 'back',
    mechanic: 'compound',
    level: 'beginner',
    force: 'pull',
    primary_muscles: ['middle back'],
    required_equipment: ['resistance_bands'],
    body_areas_stressed: ['lower_back', 'elbows'],
    instructions: [
      'Stand on the middle of a band with your feet hip-width apart and hold one end in each hand.',
      'Bend at your hips with a slight knee bend until your back is at about 45 degrees, back flat.',
      'Pull your hands towards your lower ribs, elbows close to your body.',
      'Lower your hands slowly until your arms are straight.',
    ],
  },
  {
    id: 'gc_band_biceps_curl',
    name: 'Band Biceps Curl',
    muscle_group: 'biceps',
    mechanic: 'isolation',
    level: 'beginner',
    force: 'pull',
    primary_muscles: ['biceps'],
    required_equipment: ['resistance_bands'],
    body_areas_stressed: ['elbows'],
    instructions: [
      'Stand on the middle of a band with your feet hip-width apart and hold one end in each hand, palms forward.',
      'Keep your elbows by your sides.',
      'Curl your hands up towards your shoulders.',
      'Lower slowly until your arms are straight.',
    ],
  },
];

/** Bodyweight cardio rows added by curation (source = 'custom'). */
export const CUSTOM_CARDIO: CustomRow[] = [
  {
    id: 'gc_jumping_jacks',
    name: 'Jumping Jacks',
    body_areas_stressed: ['knees', 'ankles'],
    instructions: [
      'Stand tall with your feet together and your arms by your sides.',
      'Jump your feet out to the sides while raising your arms overhead.',
      'Jump back to the start, bringing your arms down.',
      'Keep a steady rhythm and land softly on the balls of your feet.',
    ],
  },
  {
    id: 'gc_high_knees',
    name: 'High Knees',
    body_areas_stressed: ['knees', 'ankles', 'hips'],
    instructions: [
      'Stand with your feet hip-width apart.',
      'Run in place, driving one knee up toward hip height, then the other.',
      'Pump your arms in time with your legs.',
      'Stay on the balls of your feet and keep your chest up.',
    ],
  },
  {
    id: 'gc_butt_kicks',
    name: 'Butt Kicks',
    body_areas_stressed: ['knees', 'ankles'],
    instructions: [
      'Stand with your feet hip-width apart.',
      'Jog in place, bringing each heel up toward your glutes.',
      'Keep your knees pointing down and your arms moving.',
      'Keep a quick, light rhythm.',
    ],
  },
  {
    id: 'gc_mountain_climbers',
    name: 'Mountain Climbers (cardio)',
    body_areas_stressed: ['wrists', 'shoulders', 'knees'],
    instructions: [
      'Start in a high plank with your hands under your shoulders.',
      'Drive one knee toward your chest, then switch legs quickly.',
      'Keep your hips level and your core braced.',
      'Breathe steadily and keep the pace you can hold.',
    ],
  },
  {
    id: 'gc_burpees',
    name: 'Burpees',
    body_areas_stressed: ['knees', 'ankles', 'wrists', 'shoulders', 'lower_back'],
    instructions: [
      'Stand with your feet shoulder-width apart.',
      'Squat down and place your hands on the floor.',
      'Jump your feet back into a plank, then jump them back in.',
      'Stand up and jump lightly with your arms overhead.',
      'Repeat at a pace you can keep.',
    ],
  },
  {
    id: 'gc_jogging_in_place',
    name: 'Jogging in Place',
    body_areas_stressed: ['knees', 'ankles'],
    instructions: [
      'Stand tall with relaxed shoulders.',
      'Jog in place, lifting your feet a little off the floor.',
      'Swing your arms naturally.',
      'Land softly and breathe steadily.',
    ],
  },
  {
    id: 'gc_skater_hops',
    name: 'Skater Hops',
    body_areas_stressed: ['knees', 'ankles', 'hips'],
    instructions: [
      'Stand on your right foot with a slight bend in the knee.',
      'Hop sideways to land on your left foot, swinging your right leg behind you.',
      'Hop back to the right in the same way.',
      'Keep your chest up and land softly.',
    ],
  },
  {
    id: 'gc_shadow_boxing',
    name: 'Shadow Boxing',
    body_areas_stressed: ['shoulders'],
    instructions: [
      'Stand in a boxing stance with your hands up by your face.',
      'Throw light, controlled punches: jabs, crosses and hooks.',
      'Stay light on your feet and move around.',
      'Keep your core tight and breathe out with each punch.',
    ],
  },
];

/**
 * Backstop for a drafted [] (nothing needed) on an exercise whose source names specific equipment: the
 * deterministic mapping decides instead, giving its equipment list or null (unmappable → inactive). The source's
 * "other" is exempt: D-53 assumes cones, hurdles, ankle straps, heavy bags and the like are available, so []
 * is a legitimate answer there.
 */
export function guardBodyweight(raw: RawExercise, drafted: string[]): string[] | null {
  if (drafted.length > 0 || raw.equipment === null || raw.equipment === 'body only' || raw.equipment === 'other') {
    return drafted;
  }
  return requiredEquipment(raw);
}

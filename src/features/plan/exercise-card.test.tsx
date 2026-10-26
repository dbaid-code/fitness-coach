// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { PlanItemDto } from '@/shared/schemas/api/plans';
import { ExerciseCard } from './exercise-card';

const item: PlanItemDto = {
  id: '00000000-0000-4000-8000-000000000002',
  position: 2,
  kind: 'exercise',
  card_type: 'reps',
  exercise_id: 'bench_press',
  routine_id: null,
  name: 'Bench Press',
  muscle_group: 'chest',
  sets: 4,
  reps: 10,
  time_per_set_s: null,
  total_time_s: 330,
  total_time_min: 6,
  origin: 'agent',
  time_model: { seconds_per_rep: 3, rest_s: 60, setup_s: 30 },
};

describe('FR-41 exercise card', () => {
  it('FR-41: shows sets, reps and minutes; never rest, weight, intensity, speed or incline', () => {
    const { container } = render(
      <ExerciseCard item={item} number={1} draft onOpenHowTo={() => {}} onToggleControls={() => {}} />,
    );
    expect(screen.getByText('4 sets · 10 reps')).toBeInTheDocument();
    expect(screen.getByText('6 min')).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/rest|weight|kg|lb|intensity|speed|incline/i);
  });
  it('D-34: draft rows have the sliders button; accepted rows do not', () => {
    const { rerender } = render(
      <ExerciseCard item={item} number={1} draft onOpenHowTo={() => {}} onToggleControls={() => {}} />,
    );
    expect(screen.getByRole('button', { name: 'Change Bench Press' })).toHaveAttribute('aria-expanded', 'false');
    rerender(<ExerciseCard item={item} number={1} draft={false} onOpenHowTo={() => {}} onToggleControls={() => {}} />);
    expect(screen.queryByRole('button', { name: 'Change Bench Press' })).toBeNull();
  });
  it('timed cards show seconds per set', () => {
    render(
      <ExerciseCard
        item={{ ...item, card_type: 'timed', reps: null, time_per_set_s: 30 }}
        number={1}
        draft={false}
        onOpenHowTo={() => {}}
      />,
    );
    expect(screen.getByText('4 sets · 30 s each')).toBeInTheDocument();
  });
});

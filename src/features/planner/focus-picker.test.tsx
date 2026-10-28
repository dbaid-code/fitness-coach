// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import type { MuscleGroup } from '@/shared/constants';
import { FocusPicker, toggleGroup } from './focus-picker';

function Harness() {
  const [groups, setGroups] = useState<MuscleGroup[]>([]);
  return <FocusPicker groups={groups} onChange={setGroups} />;
}

describe('FR-31 focus picker', () => {
  it('FR-31: keeps canonical order and removes groups', () => {
    expect(toggleGroup(['legs'], 'chest', true)).toEqual(['chest', 'legs']);
    expect(toggleGroup(['chest', 'legs'], 'chest', false)).toEqual(['legs']);
  });

  it('FR-31: coach chooses ↔ groups', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const coach = screen.getByRole('button', { name: 'Let coach choose' });
    expect(coach).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: 'Chest' }));
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(coach).toHaveAttribute('aria-pressed', 'false');
    await user.click(screen.getByRole('button', { name: 'Chest' }));
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(coach).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: 'Legs' }));
    await user.click(coach);
    expect(screen.getByRole('button', { name: 'Legs' })).toHaveAttribute('aria-pressed', 'false');
  });
});

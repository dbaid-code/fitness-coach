import { describe, expect, it } from 'vitest';
import type { CompletedWorkout } from '../types';
import { calendarDaysBetween, dayLabel, daysSinceTrained, historySummary, localDate, recencyStrip } from './recency';

const w = (completedAt: string, groups: CompletedWorkout['mainItems'][number]['muscleGroup'][]): CompletedWorkout => ({
  planId: completedAt,
  completedAt: new Date(completedAt),
  difficulty: 'just_right',
  focusGroups: groups,
  mainItems: groups.map((g, i) => ({
    exerciseId: `${g}_${i}`,
    muscleGroup: g,
    cardType: 'reps',
    sets: 3,
    reps: 10,
    timePerSetS: null,
  })),
});

const IST = 'Asia/Kolkata';
const NY = 'America/New_York';
const now = new Date('2026-11-10T06:30:00Z'); // 12:00 IST, 01:30 NY

describe('FR-32 recency', () => {
  it('localDate and calendar days', () => {
    expect(localDate(now, IST)).toBe('2026-11-10');
    expect(localDate(now, NY)).toBe('2026-11-10');
    expect(calendarDaysBetween('2026-11-08', '2026-11-10')).toBe(2);
  });

  it('dayLabel', () => {
    expect(dayLabel(0)).toBe('today');
    expect(dayLabel(1)).toBe('yesterday');
    expect(dayLabel(5)).toBe('5 days ago');
  });

  it('no history → none_ever', () => {
    expect(recencyStrip([], now, IST)).toEqual({
      strip: { code: 'RECENCY_STRIP', params: { variant: 'none_ever' } },
      groups: [],
    });
  });

  it('only old history → none_recent (D-29)', () => {
    expect(recencyStrip([w('2026-10-21T06:00:00Z', ['legs'])], now, IST).strip.params).toEqual({
      variant: 'none_recent',
    });
  });

  it('one workout today and one yesterday', () => {
    const r = recencyStrip([w('2026-11-10T03:00:00Z', ['chest']), w('2026-11-09T05:00:00Z', ['legs'])], now, IST);
    expect(r.strip.params).toEqual({ variant: 'entries', groups: ['chest', 'legs'], labels: ['today', 'yesterday'] });
  });

  it('label flips at local midnight (23:30 yesterday vs 00:30 today, IST)', () => {
    const lateYesterday = w('2026-11-09T18:00:00Z', ['back']); // 23:30 IST on the 9th
    const earlyToday = w('2026-11-09T19:00:00Z', ['core']); // 00:30 IST on the 10th
    const r = recencyStrip([lateYesterday, earlyToday], now, IST);
    expect(r.groups).toEqual([
      { group: 'core', days_ago: 0, label: 'today' },
      { group: 'back', days_ago: 1, label: 'yesterday' },
    ]);
  });

  it('same instants in New York are both "yesterday"', () => {
    const r = recencyStrip([w('2026-11-09T18:00:00Z', ['back']), w('2026-11-09T19:00:00Z', ['core'])], now, NY);
    expect(r.groups.map((g) => g.label)).toEqual(['yesterday', 'yesterday']);
    expect(r.groups.map((g) => g.group)).toEqual(['back', 'core']); // ties in MUSCLE_GROUPS order
  });

  it('most recent days_ago per group; 13 days in, 14 out', () => {
    const r = recencyStrip(
      [
        w('2026-10-28T06:00:00Z', ['chest']),
        w('2026-11-06T06:00:00Z', ['chest', 'legs']),
        w('2026-10-27T06:00:00Z', ['back']),
      ],
      now,
      IST,
    );
    expect(r.groups).toEqual(
      [
        { group: 'chest', days_ago: 4, label: '4 days ago' },
        { group: 'legs', days_ago: 4, label: '4 days ago' },
        { group: 'back', days_ago: 14, label: '14 days ago' },
      ].filter((g) => g.days_ago < 14),
    );
    expect(daysSinceTrained([w('2026-10-27T06:00:00Z', ['back'])], now, IST).back).toBe(14);
  });

  it('daysSinceTrained is null for untrained groups', () => {
    const d = daysSinceTrained([w('2026-11-08T06:00:00Z', ['legs'])], now, IST);
    expect(d.legs).toBe(2);
    expect(d.chest).toBeNull();
  });

  it('historySummary: ≤ 5 within 28 days, newest first, names resolved', () => {
    const hist = [
      w('2026-11-01T06:00:00Z', ['chest']),
      w('2026-10-01T06:00:00Z', ['legs']), // > 28 days
      ...['02', '03', '04', '05', '06'].map((d) => w(`2026-11-${d}T06:00:00Z`, ['back'])),
    ];
    const s = historySummary(hist, now, IST, new Map([['back_0', 'Row']]), { max: 5, days: 28 });
    expect(s).toHaveLength(5);
    expect(s[0]!.days_ago).toBe(4);
    expect(s[0]!.items[0]).toEqual({ exercise_id: 'back_0', name: 'Row', sets: 3, reps: 10, time_per_set_s: null });
    const s2 = historySummary([w('2026-11-09T06:00:00Z', ['chest'])], now, IST, new Map(), { max: 5, days: 28 });
    expect(s2[0]!.items[0]!.name).toBe('chest_0');
  });
});

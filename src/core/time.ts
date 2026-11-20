/** Time model, see PRD §3.1. The simulation counts absolute game minutes; day 0 is a Monday. */
export const MINUTES_PER_DAY = 1440;
export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

export type Speed = 0 | 1 | 2 | 4;

export const dayOf = (minute: number): number => Math.floor(minute / MINUTES_PER_DAY);
export const minuteOfDay = (minute: number): number => ((minute % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
export const weekdayOf = (minute: number): number => dayOf(minute) % 7;
export const hourOf = (minute: number): number => Math.floor(minuteOfDay(minute) / 60);

export const at = (day: number, hour: number, min = 0): number => day * MINUTES_PER_DAY + hour * 60 + min;

export function formatClock(minute: number): string {
  const m = minuteOfDay(minute);
  const hh = String(Math.floor(m / 60)).padStart(2, '0');
  const mm = String(m % 60).padStart(2, '0');
  return `${WEEKDAYS[weekdayOf(minute)]} ${hh}:${mm}`;
}

/** 1x = 1 real second -> 3 game minutes. */
export function gameMinutesPerRealSecond(speed: Speed): number {
  return speed * 3;
}

export function isNight(minuteOfDayValue: number): boolean {
  const m = minuteOfDay(minuteOfDayValue);
  return m >= 22 * 60 || m < 6 * 60;
}

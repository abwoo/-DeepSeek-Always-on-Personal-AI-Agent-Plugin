import type { ManagedAction } from '@abwoo/always-on-client';
export function intervalSeconds(value: string) {
  const seconds = Number(value) * 60;
  if (!Number.isSafeInteger(seconds) || seconds < 60 || seconds > 31536000)
    throw Error('Enter an interval from 1 minute to 365 days, in whole seconds.');
  return seconds;
}
export function taskTiming(
  kind: 'every' | 'once' | 'daily',
  value: string,
  date: Date,
  zone = Intl.DateTimeFormat().resolvedOptions().timeZone,
): Extract<ManagedAction, { action: 'task.create' }>['data']['timing'] {
  if (kind === 'every') return { kind: 'every', every_seconds: intervalSeconds(value) };
  if (!Number.isFinite(date.getTime())) throw Error('Choose a valid date and time.');
  if (kind === 'once') {
    if (date.getTime() <= Date.now()) throw Error('Choose a future time for a one-time task.');
    return { kind: 'at', at: date.toISOString() };
  }
  return {
    kind: 'daily',
    daily: {
      time: `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`,
      time_zone: zone,
    },
  };
}

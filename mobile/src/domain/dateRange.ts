export type DateRange = {start: number; end: number};

function two(n: number) {
  return String(n).padStart(2, '0');
}

export function startOfDay(ms: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Exclusivo: início do dia seguinte. */
export function endOfDayExclusive(ms: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
}

export function dayLabel(ms: number): string {
  const d = new Date(ms);
  return `${two(d.getDate())}/${two(d.getMonth() + 1)}`;
}

export function rangeLabel(range: DateRange): string {
  const last = range.end - 1;
  return `${dayLabel(range.start)} – ${dayLabel(last)}`;
}

export function inDateRange(iso: string, range: DateRange): boolean {
  const t = new Date(iso).getTime();
  return Number.isFinite(t) && t >= range.start && t < range.end;
}

export function normalizeRange(fromMs: number, toMs: number): DateRange {
  const a = startOfDay(fromMs);
  const b = startOfDay(toMs);
  return a <= b
    ? {start: a, end: endOfDayExclusive(b)}
    : {start: b, end: endOfDayExclusive(a)};
}

export function sameCalendarDay(a: number, b: number): boolean {
  return startOfDay(a) === startOfDay(b);
}

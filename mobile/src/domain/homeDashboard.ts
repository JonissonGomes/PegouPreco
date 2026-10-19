import {resolveCategory} from '@/domain/productCategory';
import {isFiscalList, isFiscalLog} from '@/domain/fiscal';
import {
  economyAgainstAverage,
  pointsFromLists,
  pointsFromLogs,
} from '@/domain/purchaseInsights';
import type {PriceLog, Product, ShoppingList} from '@/data/types';

export type HomePeriodDays = 7 | 30 | 90;
export type SpendSpan = 'week' | 'month' | 'quarter';

function two(n: number) {
  return String(n).padStart(2, '0');
}

function dayMonth(ms: number) {
  const date = new Date(ms);
  return `${two(date.getDate())}/${two(date.getMonth() + 1)}`;
}

/** Texto do centro do anel: semana, mês ou trimestre. */
export function spendSpanLabel(
  anchor: Date,
  span: SpendSpan,
  now = Date.now(),
): string {
  if (span === 'month') {
    const name = anchor.toLocaleDateString('pt-BR', {month: 'long'});
    return name.charAt(0).toUpperCase() + name.slice(1);
  }
  if (span === 'quarter') {
    const startMonth = Math.floor(anchor.getMonth() / 3) * 3;
    const start = new Date(anchor.getFullYear(), startMonth, 1).getTime();
    const end = new Date(anchor.getFullYear(), startMonth + 3, 0).getTime();
    return `${dayMonth(start)} - ${dayMonth(end)}`;
  }
  const range = calendarRange(anchor, 'week', now);
  return `${dayMonth(range.start)} - ${dayMonth(range.end - 1)}`;
}

export function calendarRange(
  anchor: Date,
  span: SpendSpan,
  now = Date.now(),
): {start: number; end: number} {
  const year = anchor.getFullYear();
  const month = anchor.getMonth();
  if (span === 'quarter') {
    const startMonth = Math.floor(month / 3) * 3;
    return {
      start: new Date(year, startMonth, 1).getTime(),
      end: new Date(year, startMonth + 3, 1).getTime(),
    };
  }
  if (span === 'month') {
    return {
      start: new Date(year, month, 1).getTime(),
      end: new Date(year, month + 1, 1).getTime(),
    };
  }
  const monthStart = new Date(year, month, 1).getTime();
  const monthEnd = new Date(year, month + 1, 1).getTime();
  const end = now >= monthStart && now < monthEnd ? now + 1 : monthEnd;
  return {start: Math.max(monthStart, end - 7 * 86400000), end};
}

export type CategorySlice = {
  category: string;
  total: number;
};

export type HomeDash = {
  spent: number;
  savings: number;
  purchaseCount: number;
  categories: CategorySlice[];
  recent: ShoppingList[];
  purchases: ShoppingList[];
  markets: {id: number; name: string}[];
  categoryNames: string[];
  trend: {label: string; total: number}[];
};

type ListRow = {
  productId?: number;
  productName?: string;
  quantity?: number;
  retailPrice?: number;
};

function rowsOf(list: ShoppingList): ListRow[] {
  try {
    const parsed = JSON.parse(list.itemsJson) as ListRow[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function rowCategory(row: ListRow, products: Product[]) {
  const named = products.find(p => p.id === row.productId)?.category;
  return resolveCategory(named, row.productName || '');
}

function inPeriod(list: ShoppingList, sinceMs: number, untilMs = Infinity) {
  const t = new Date(list.finishedAt).getTime();
  return Number.isFinite(t) && t >= sinceMs && t < untilMs;
}

export function buildHomeDash(
  lists: ShoppingList[],
  products: Product[],
  periodDays: HomePeriodDays,
  marketId: number | null,
  selected: string[],
  logs: PriceLog[] = [],
  now = Date.now(),
  range?: {start: number; end: number},
): HomeDash {
  const sinceMs = range?.start ?? now - periodDays * 24 * 60 * 60 * 1000;
  const untilMs = range?.end ?? Infinity;
  const receipts = lists.filter(isFiscalList);
  const inWindow = receipts.filter(l => inPeriod(l, sinceMs, untilMs));

  const markets = new Map<number, string>();
  for (const list of inWindow) {
    if (list.marketId == null) continue;
    markets.set(list.marketId, list.marketName || 'Mercado');
  }

  const byMarket =
    marketId == null
      ? inWindow
      : inWindow.filter(l => l.marketId === marketId);

  const categoryNames = new Set<string>();
  for (const list of byMarket) {
    for (const row of rowsOf(list)) {
      categoryNames.add(rowCategory(row, products));
    }
  }

  const picked = selected.filter(Boolean);
  const matched =
    picked.length === 0
      ? byMarket
      : byMarket.filter(list =>
          rowsOf(list).some(row => picked.includes(rowCategory(row, products))),
        );

  const byCat = new Map<string, number>();
  let spent = 0;
  for (const list of matched) {
    const rows = rowsOf(list);
    if (!rows.length) {
      spent += list.subtotal;
      continue;
    }
    for (const row of rows) {
      const cat = rowCategory(row, products);
      if (picked.length > 0 && !picked.includes(cat)) continue;
      const line = (row.quantity ?? 1) * (row.retailPrice ?? 0);
      spent += line;
      byCat.set(cat, (byCat.get(cat) ?? 0) + line);
    }
  }

  const slices = [...byCat.entries()]
    .map(([name, total]) => ({category: name, total: Number(total.toFixed(2))}))
    .sort((a, b) => b.total - a.total);

  const recent = [...matched].sort(
    (a, b) =>
      new Date(b.finishedAt).getTime() - new Date(a.finishedAt).getTime(),
  );

  const purchases = pointsFromLists(matched, products);
  const references = [
    ...purchases,
    ...pointsFromLogs(logs.filter(isFiscalLog), products),
  ];
  const economy = economyAgainstAverage(purchases, references, sinceMs);

  return {
    spent: Number(spent.toFixed(2)),
    savings: economy.saved,
    purchaseCount: matched.length,
    categories: slices,
    recent: recent.slice(0, 5),
    purchases: recent,
    markets: [...markets.entries()].map(([id, name]) => ({id, name})),
    categoryNames: [...categoryNames].sort((a, b) => a.localeCompare(b, 'pt-BR')),
    trend: spendTrend(matched, periodDays, now, range),
  };
}

function monthBuckets(lists: ShoppingList[], startMs: number, endMs: number) {
  const buckets: {label: string; total: number; from: number; to: number}[] = [];
  const cursor = new Date(startMs);
  cursor.setDate(1);
  cursor.setHours(0, 0, 0, 0);
  while (cursor.getTime() < endMs && buckets.length < 8) {
    const from = cursor.getTime();
    const next = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    const label = cursor
      .toLocaleDateString('pt-BR', {month: 'short'})
      .replace('.', '');
    buckets.push({label, total: 0, from, to: next.getTime()});
    cursor.setMonth(cursor.getMonth() + 1);
  }
  for (const list of lists) {
    const at = new Date(list.finishedAt).getTime();
    const bucket = buckets.find(item => at >= item.from && at < item.to);
    if (bucket) bucket.total += list.subtotal;
  }
  return buckets.map(item => ({
    label: item.label,
    total: Number(item.total.toFixed(2)),
  }));
}

function spendTrend(
  lists: ShoppingList[],
  _periodDays: number,
  now: number,
  range?: {start: number; end: number},
) {
  const start = range?.start ?? now - _periodDays * 86400000;
  const end = range?.end ?? now + 1;
  const span = Math.max(end - start, 1);
  if (span > 45 * 86400000) return monthBuckets(lists, start, end);

  const buckets = span <= 10 * 86400000 ? 7 : 4;
  const size = span / buckets;
  const totals = Array.from({length: buckets}, () => 0);
  for (const list of lists) {
    const at = new Date(list.finishedAt).getTime();
    if (!Number.isFinite(at) || at < start || at >= end) continue;
    const index = Math.min(buckets - 1, Math.max(0, Math.floor((at - start) / size)));
    totals[index] += list.subtotal;
  }
  return totals.map((total, index) => {
    const at = new Date(start + size * index + size / 2);
    const label =
      span <= 10 * 86400000
        ? at.toLocaleDateString('pt-BR', {weekday: 'narrow'})
        : dayMonth(at.getTime());
    return {label, total: Number(total.toFixed(2))};
  });
}

export type WeekdayCandidate = {
  category: string;
  todayAvg: number;
  usualAvg: number;
};

/** Categoria relativamente mais barata no dia da semana, com base nas notas. */
export function weekdayBuyCandidates(
  lists: ShoppingList[],
  products: Product[],
  now = new Date(),
): WeekdayCandidate[] {
  const day = now.getDay();
  const stats = new Map<
    string,
    {all: number; allN: number; today: number; todayN: number}
  >();
  for (const list of lists.filter(isFiscalList)) {
    const at = new Date(list.finishedAt);
    if (Number.isNaN(at.getTime())) continue;
    const onDay = at.getDay() === day;
    for (const row of rowsOf(list)) {
      const category = rowCategory(row, products);
      if (!category || category === 'Outros') continue;
      const price = Number(row.retailPrice ?? 0);
      if (!(price > 0)) continue;
      const current = stats.get(category) ?? {all: 0, allN: 0, today: 0, todayN: 0};
      current.all += price;
      current.allN += 1;
      if (onDay) {
        current.today += price;
        current.todayN += 1;
      }
      stats.set(category, current);
    }
  }
  const ranked: WeekdayCandidate[] = [];
  for (const [category, stat] of stats) {
    if (stat.todayN < 1) continue;
    ranked.push({
      category,
      todayAvg: Number((stat.today / stat.todayN).toFixed(2)),
      usualAvg: Number((stat.all / stat.allN).toFixed(2)),
    });
  }
  ranked.sort(
    (a, b) => a.todayAvg / a.usualAvg - b.todayAvg / b.usualAvg,
  );
  return ranked.slice(0, 6);
}

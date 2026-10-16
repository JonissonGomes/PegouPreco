import {resolveCategory} from '@/domain/productCategory';
import {isFiscalList, isFiscalLog} from '@/domain/fiscal';
import {
  economyAgainstAverage,
  pointsFromLists,
  pointsFromLogs,
} from '@/domain/purchaseInsights';
import type {PriceLog, Product, ShoppingList} from '@/data/types';

export type HomePeriodDays = 7 | 30 | 90;

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
  const named = products.find(p => p.id === row.productId)?.category?.trim();
  if (named && named !== 'Outros') return named;
  return resolveCategory(named, row.productName || '');
}

function inPeriod(list: ShoppingList, sinceMs: number) {
  const t = new Date(list.finishedAt).getTime();
  return Number.isFinite(t) && t >= sinceMs;
}

export function buildHomeDash(
  lists: ShoppingList[],
  products: Product[],
  periodDays: HomePeriodDays,
  marketId: number | null,
  selected: string[],
  logs: PriceLog[] = [],
  now = Date.now(),
): HomeDash {
  const sinceMs = now - periodDays * 24 * 60 * 60 * 1000;
  const receipts = lists.filter(isFiscalList);
  const inWindow = receipts.filter(l => inPeriod(l, sinceMs));

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
    trend: spendTrend(matched, periodDays, now),
  };
}

function spendTrend(lists: ShoppingList[], periodDays: number, now: number) {
  const buckets = periodDays <= 7 ? 7 : periodDays <= 30 ? 4 : 6;
  const span = periodDays * 86400000;
  const size = span / buckets;
  const start = now - span;
  const totals = Array.from({length: buckets}, () => 0);
  for (const list of lists) {
    const t = new Date(list.finishedAt).getTime();
    if (!Number.isFinite(t)) continue;
    const index = Math.min(buckets - 1, Math.max(0, Math.floor((t - start) / size)));
    totals[index] += list.subtotal;
  }
  return totals.map((total, index) => {
    const at = new Date(start + size * index + size / 2);
    const label =
      periodDays <= 7
        ? at.toLocaleDateString('pt-BR', {weekday: 'narrow'})
        : at.toLocaleDateString('pt-BR', {month: 'short'}).replace('.', '');
    return {label, total: Number(total.toFixed(2))};
  });
}

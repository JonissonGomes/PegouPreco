import {guessCategory} from '@/domain/productCategory';
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
  markets: {id: number; name: string}[];
  categoryNames: string[];
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
  if (named) return named;
  return guessCategory(row.productName || '');
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
  category: string | null,
  logs: PriceLog[] = [],
  now = Date.now(),
): HomeDash {
  const sinceMs = now - periodDays * 24 * 60 * 60 * 1000;
  const inWindow = lists.filter(l => inPeriod(l, sinceMs));

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

  const matched =
    category == null
      ? byMarket
      : byMarket.filter(list =>
          rowsOf(list).some(row => rowCategory(row, products) === category),
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
      if (category && cat !== category) continue;
      const line = (row.quantity ?? 1) * (row.retailPrice ?? 0);
      spent += line;
      byCat.set(cat, (byCat.get(cat) ?? 0) + line);
    }
  }

  const categories = [...byCat.entries()]
    .map(([name, total]) => ({category: name, total: Number(total.toFixed(2))}))
    .sort((a, b) => b.total - a.total);

  const recent = [...matched].sort(
    (a, b) =>
      new Date(b.finishedAt).getTime() - new Date(a.finishedAt).getTime(),
  );

  const purchases = pointsFromLists(matched, products);
  const references = [...purchases, ...pointsFromLogs(logs, products)];
  const economy = economyAgainstAverage(purchases, references, sinceMs);

  return {
    spent: Number(spent.toFixed(2)),
    savings: economy.saved,
    purchaseCount: matched.length,
    categories,
    recent: recent.slice(0, 5),
    markets: [...markets.entries()].map(([id, name]) => ({id, name})),
    categoryNames: [...categoryNames].sort((a, b) => a.localeCompare(b, 'pt-BR')),
  };
}

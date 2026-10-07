import {isCommunityPrice} from '@/domain/compare';
import {effectiveUnitPrice, lineTotal} from '@/domain/pricing';
import type {
  CartItem,
  Market,
  PriceLog,
  Product,
  ShoppingList,
} from '@/data/types';

export type CategorySpend = {
  category: string;
  total: number;
  itemCount: number;
};

export type CategorySaveEst = {
  category: string;
  saveEst: number;
};

export type InsightPeriod = 'week' | 'month' | 'all';

export type MarketCheapRank = {
  marketId: number;
  marketName: string;
  winCount: number;
  productCount: number;
  topCategories: string[];
};

export type CategoryMarketWin = {
  category: string;
  marketId: number;
  marketName: string;
  winCount: number;
};

export function lifetimeSavings(lists: ShoppingList[]): number {
  return lists.reduce((sum, l) => sum + (l.savings ?? 0), 0);
}

/** Economia em listas finalizadas desde `since` (ex.: últimos 3 meses). */
export function savingsSince(lists: ShoppingList[], since: Date): number {
  const t = since.getTime();
  return lists
    .filter(l => new Date(l.finishedAt).getTime() >= t)
    .reduce((sum, l) => sum + (l.savings ?? 0), 0);
}

export function monthsAgo(n: number, now = new Date()): Date {
  const d = new Date(now);
  d.setMonth(d.getMonth() - n);
  return d;
}

export function periodStart(period: InsightPeriod, now = new Date()): Date | null {
  if (period === 'all') return null;
  const d = new Date(now);
  if (period === 'week') {
    d.setDate(d.getDate() - 7);
    return d;
  }
  d.setMonth(d.getMonth() - 1);
  return d;
}

export type InsightMarketScope = {
  marketIds: Set<number>;
  /** Favoritos parciais vs raio 25 km (todos / nenhum marcado). */
  mode: 'favorites' | 'radius';
  label: string;
};

/**
 * Escopo de Insights pela localização:
 * - alguns favoritos marcados → só esses mercados;
 * - todos os do raio marcados (ou nenhum) → mercados a até `radiusKm`.
 */
export function resolveInsightMarketScope(args: {
  markets: Market[];
  favoriteMarketIds: number[];
  nearbyMarketIds: number[];
  radiusKm: number;
}): InsightMarketScope {
  const nearby = [...new Set(args.nearbyMarketIds)];
  const nearbySet = new Set(nearby);
  const favs = args.favoriteMarketIds.filter(
    id => nearbySet.has(id) || args.markets.some(m => m.id === id),
  );
  const allNearbyMarked =
    nearby.length > 0 && nearby.every(id => favs.includes(id));

  if (favs.length > 0 && !allNearbyMarked) {
    return {
      marketIds: new Set(favs),
      mode: 'favorites',
      label:
        favs.length === 1
          ? '1 mercado marcado'
          : `${favs.length} mercados marcados`,
    };
  }

  return {
    marketIds: nearbySet,
    mode: 'radius',
    label:
      nearby.length > 0
        ? `Raio ${args.radiusKm} km · ${nearby.length} mercados`
        : `Raio ${args.radiusKm} km`,
  };
}

export function filterLogsByMarketScope(
  logs: PriceLog[],
  scopeIds: Set<number>,
): PriceLog[] {
  if (!scopeIds.size) return [];
  return logs.filter(l => l.marketId != null && scopeIds.has(l.marketId));
}

export function filterListsByMarketScope(
  lists: ShoppingList[],
  scopeIds: Set<number>,
): ShoppingList[] {
  if (!scopeIds.size) return [];
  return lists.filter(l => l.marketId != null && scopeIds.has(l.marketId));
}

/**
 * Ranking de mercados mais baratos com base em preços comunitários validados.
 * Conta quantas vezes cada mercado tem o menor preço de um produto no período.
 */
export function rankCheapestMarkets(
  logs: PriceLog[],
  markets: Market[],
  products: Product[],
  period: InsightPeriod = 'week',
  now = new Date(),
): MarketCheapRank[] {
  const start = periodStart(period, now);
  const community = logs.filter(l => {
    if (!isCommunityPrice(l, now)) return false;
    if (l.marketId == null) return false;
    if (start && new Date(l.capturedAt).getTime() < start.getTime()) {
      return false;
    }
    return true;
  });

  const byProduct = new Map<number, PriceLog[]>();
  for (const l of community) {
    const arr = byProduct.get(l.productId) ?? [];
    arr.push(l);
    byProduct.set(l.productId, arr);
  }

  const wins = new Map<number, number>();
  const catWins = new Map<number, Map<string, number>>();

  for (const [productId, plist] of byProduct) {
    if (plist.length < 1) continue;
    const best = plist.reduce((a, b) =>
      a.retailPrice <= b.retailPrice ? a : b,
    );
    const mid = best.marketId!;
    wins.set(mid, (wins.get(mid) ?? 0) + 1);
    const cat =
      products.find(p => p.id === productId)?.category?.trim() || 'Outros';
    const mCats = catWins.get(mid) ?? new Map<string, number>();
    mCats.set(cat, (mCats.get(cat) ?? 0) + 1);
    catWins.set(mid, mCats);
  }

  return [...wins.entries()]
    .map(([marketId, winCount]) => {
      const m = markets.find(x => x.id === marketId);
      const cats = [...(catWins.get(marketId)?.entries() ?? [])]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([c]) => c);
      return {
        marketId,
        marketName: m?.name ?? 'Mercado',
        winCount,
        productCount: winCount,
        topCategories: cats,
      };
    })
    .sort((a, b) => b.winCount - a.winCount);
}

/** Por categoria: mercado que mais venceu (menor preço) no período. */
export function rankCategoryMarketWins(
  logs: PriceLog[],
  markets: Market[],
  products: Product[],
  period: InsightPeriod = 'week',
  now = new Date(),
): CategoryMarketWin[] {
  const start = periodStart(period, now);
  const community = logs.filter(l => {
    if (!isCommunityPrice(l, now)) return false;
    if (l.marketId == null) return false;
    if (start && new Date(l.capturedAt).getTime() < start.getTime()) {
      return false;
    }
    return true;
  });

  const byProduct = new Map<number, PriceLog[]>();
  for (const l of community) {
    const arr = byProduct.get(l.productId) ?? [];
    arr.push(l);
    byProduct.set(l.productId, arr);
  }

  const catBest = new Map<string, Map<number, number>>();
  for (const [productId, plist] of byProduct) {
    const best = plist.reduce((a, b) =>
      a.retailPrice <= b.retailPrice ? a : b,
    );
    const cat =
      products.find(p => p.id === productId)?.category?.trim() || 'Outros';
    const mid = best.marketId!;
    const m = catBest.get(cat) ?? new Map<number, number>();
    m.set(mid, (m.get(mid) ?? 0) + 1);
    catBest.set(cat, m);
  }

  const out: CategoryMarketWin[] = [];
  for (const [category, mWins] of catBest) {
    let bestId = -1;
    let bestN = 0;
    for (const [id, n] of mWins) {
      if (n > bestN) {
        bestN = n;
        bestId = id;
      }
    }
    if (bestId < 0) continue;
    out.push({
      category,
      marketId: bestId,
      marketName: markets.find(m => m.id === bestId)?.name ?? 'Mercado',
      winCount: bestN,
    });
  }
  return out.sort((a, b) => b.winCount - a.winCount);
}

export function categorySpendFromCart(
  cart: CartItem[],
  products: Product[],
): CategorySpend[] {
  const byCat = new Map<string, {total: number; itemCount: number}>();
  const catOf = (productId: number) =>
    products.find(p => p.id === productId)?.category ?? 'Outros';

  for (const item of cart) {
    const category = catOf(item.productId);
    const prev = byCat.get(category) ?? {total: 0, itemCount: 0};
    prev.total += lineTotal(item);
    prev.itemCount += 1;
    byCat.set(category, prev);
  }

  return [...byCat.entries()]
    .map(([category, v]) => ({
      category,
      total: Number(v.total.toFixed(2)),
      itemCount: v.itemCount,
    }))
    .sort((a, b) => b.total - a.total);
}

/** Economia potencial por categoria: preço no carrinho vs menor log comunitário. */
export function categorySavingsPotential(
  cart: CartItem[],
  products: Product[],
  logs: PriceLog[],
  now = new Date(),
): CategorySaveEst[] {
  const community = logs.filter(l => isCommunityPrice(l, now));
  const catOf = (productId: number) =>
    products.find(p => p.id === productId)?.category ?? 'Outros';
  const byCat = new Map<string, number>();

  for (const item of cart) {
    const category = catOf(item.productId);
    const cartUnit = effectiveUnitPrice(item);
    const perProduct = community.filter(l => l.productId === item.productId);
    if (!perProduct.length) continue;
    const cheapest = perProduct.reduce((min, l) =>
      l.retailPrice < min.retailPrice ? l : min,
    );
    const diff = (cartUnit - cheapest.retailPrice) * item.quantity;
    if (diff <= 0) continue;
    byCat.set(category, (byCat.get(category) ?? 0) + diff);
  }

  return [...byCat.entries()]
    .map(([category, saveEst]) => ({
      category,
      saveEst: Number(saveEst.toFixed(2)),
    }))
    .sort((a, b) => b.saveEst - a.saveEst);
}

import {resolveCategory} from '@/domain/productCategory';
import type {InsightPeriod} from '@/domain/homeInsights';
import {periodStart} from '@/domain/homeInsights';
import type {Market, PriceLog, Product, ShoppingList} from '@/data/types';

export type InsightAverage = {
  category: string;
  avg: number;
  marketName: string;
};

export type RisingItem = {
  productId: number;
  name: string;
  previous: number;
  latest: number;
  pct: number;
};

export type WhereToBuy = {
  category: string;
  marketName: string;
  when: string;
};

export type InsightBoard = {
  saved: number;
  bestMarket: string | null;
  bestDetail: string;
  averages: InsightAverage[];
  rising: RisingItem[];
  places: WhereToBuy[];
};

const WEEKDAYS = [
  'domingo',
  'segunda',
  'terça',
  'quarta',
  'quinta',
  'sexta',
  'sábado',
];

type Line = {
  productId: number;
  name: string;
  category: string;
  unit: number;
  qty: number;
  at: number;
  marketId: number | null;
};

function linesOf(lists: ShoppingList[], products: Product[]): Line[] {
  const out: Line[] = [];
  for (const list of lists) {
    let rows: Array<Record<string, unknown>> = [];
    try {
      const parsed = JSON.parse(list.itemsJson) as Array<Record<string, unknown>>;
      rows = Array.isArray(parsed) ? parsed : [];
    } catch {
      rows = [];
    }
    const at = new Date(list.finishedAt).getTime();
    for (const row of rows) {
      const unit = Number(row.retailPrice ?? 0);
      const qty = Number(row.quantity ?? 0);
      if (!(unit > 0) || !(qty > 0)) continue;
      const productId = Number(row.productId ?? 0);
      const name = String(row.productName ?? '');
      const stored = products.find(p => p.id === productId)?.category;
      out.push({
        productId,
        name,
        category: resolveCategory(stored, name),
        unit,
        qty,
        at: Number.isFinite(at) ? at : 0,
        marketId: list.marketId,
      });
    }
  }
  return out;
}

function inPeriod(at: number, start: Date | null) {
  return !start || at >= start.getTime();
}

function marketName(markets: Market[], id: number | null) {
  if (id == null) return 'Mercado';
  return markets.find(m => m.id === id)?.name ?? 'Mercado';
}

function weekdayHint(rows: Line[]): string {
  const byDay = new Map<number, {sum: number; n: number}>();
  for (const row of rows) {
    if (!row.at) continue;
    const day = new Date(row.at).getDay();
    const bucket = byDay.get(day) ?? {sum: 0, n: 0};
    bucket.sum += row.unit;
    bucket.n += 1;
    byDay.set(day, bucket);
  }
  if (byDay.size < 2) return 'ainda sem um dia mais barato';
  let bestDay = -1;
  let bestAvg = Infinity;
  let total = 0;
  let count = 0;
  for (const [day, bucket] of byDay) {
    const avg = bucket.sum / bucket.n;
    total += bucket.sum;
    count += bucket.n;
    if (bucket.n >= 2 && avg < bestAvg) {
      bestAvg = avg;
      bestDay = day;
    }
  }
  if (bestDay < 0 || !(count > 0)) return 'ainda sem um dia mais barato';
  const overall = total / count;
  if (bestAvg >= overall * 0.95) return 'preço parecido na semana';
  return `mais barato na ${WEEKDAYS[bestDay]}`;
}

export function buildInsightBoard(args: {
  lists: ShoppingList[];
  logs: PriceLog[];
  products: Product[];
  markets: Market[];
  period: InsightPeriod;
  now?: Date;
}): InsightBoard {
  const start = periodStart(args.period, args.now ?? new Date());
  const bought = linesOf(args.lists, args.products).filter(row =>
    inPeriod(row.at, start),
  );
  const logs = args.logs.filter(
    log => log.retailPrice > 0 && inPeriod(new Date(log.capturedAt).getTime(), start),
  );

  const saved = savedAgainstPeers(bought, logs);
  const averages = categoryAverages(logs, args.products, args.markets);
  const places = whereToBuy(bought, averages);
  const rising = risingItems(args.logs, args.products);
  const best = cheapestMarket(averages);

  return {
    saved,
    bestMarket: best?.name ?? averages[0]?.marketName ?? null,
    bestDetail: best?.detail ?? '',
    averages: averages.slice(0, 4),
    rising: rising.slice(0, 4),
    places: places.slice(0, 4),
  };
}

function savedAgainstPeers(bought: Line[], logs: PriceLog[]) {
  const peers = new Map<number, {sum: number; n: number}>();
  for (const log of logs) {
    const bucket = peers.get(log.productId) ?? {sum: 0, n: 0};
    bucket.sum += log.retailPrice;
    bucket.n += 1;
    peers.set(log.productId, bucket);
  }
  let saved = 0;
  for (const row of bought) {
    const bucket = peers.get(row.productId);
    if (!bucket || bucket.n < 2) continue;
    const avg = (bucket.sum - row.unit) / (bucket.n - 1);
    const diff = (avg - row.unit) * row.qty;
    if (diff > 0) saved += diff;
  }
  return Number(saved.toFixed(2));
}

function categoryAverages(
  logs: PriceLog[],
  products: Product[],
  markets: Market[],
): InsightAverage[] {
  const byCat = new Map<string, {sum: number; n: number}>();
  const byCatMarket = new Map<string, Map<number, {sum: number; n: number}>>();
  for (const log of logs) {
    const product = products.find(p => p.id === log.productId);
    const category = resolveCategory(product?.category, product?.name || '');
    const bucket = byCat.get(category) ?? {sum: 0, n: 0};
    bucket.sum += log.retailPrice;
    bucket.n += 1;
    byCat.set(category, bucket);
    if (log.marketId == null) continue;
    const marketsOf = byCatMarket.get(category) ?? new Map();
    const marketBucket = marketsOf.get(log.marketId) ?? {sum: 0, n: 0};
    marketBucket.sum += log.retailPrice;
    marketBucket.n += 1;
    marketsOf.set(log.marketId, marketBucket);
    byCatMarket.set(category, marketsOf);
  }
  return [...byCat.entries()]
    .map(([category, bucket]) => {
      let bestId: number | null = null;
      let bestAvg = Infinity;
      for (const [id, marketBucket] of byCatMarket.get(category) ?? []) {
        const avg = marketBucket.sum / marketBucket.n;
        if (avg < bestAvg) {
          bestAvg = avg;
          bestId = id;
        }
      }
      return {
        category,
        avg: Number((bucket.sum / bucket.n).toFixed(2)),
        marketName: marketName(markets, bestId),
      };
    })
    .sort((a, b) => b.avg - a.avg);
}

function whereToBuy(bought: Line[], averages: InsightAverage[]): WhereToBuy[] {
  const byCat = new Map<string, Line[]>();
  for (const row of bought) {
    const list = byCat.get(row.category) ?? [];
    list.push(row);
    byCat.set(row.category, list);
  }
  const categories = new Set([...byCat.keys(), ...averages.map(item => item.category)]);
  const out: WhereToBuy[] = [];
  for (const category of categories) {
    if (category === 'Outros') continue;
    const avg = averages.find(item => item.category === category);
    const rows = byCat.get(category) ?? [];
    out.push({
      category,
      marketName: avg?.marketName ?? 'Sem mercado comparado',
      when: weekdayHint(rows),
    });
  }
  return out.sort(
    (a, b) =>
      (byCat.get(b.category)?.length ?? 0) - (byCat.get(a.category)?.length ?? 0),
  );
}

function cheapestMarket(averages: InsightAverage[]) {
  const counts = new Map<string, number>();
  for (const item of averages) {
    counts.set(item.marketName, (counts.get(item.marketName) ?? 0) + 1);
  }
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const top = ranked[0];
  if (!top) return null;
  const cats = averages
    .filter(item => item.marketName === top[0])
    .slice(0, 2)
    .map(item => item.category);
  const detail =
    ranked.length < 2
      ? 'Só há preços deste mercado. Outra nota mostra a diferença.'
      : cats.length
        ? `Menor média em ${cats.join(' e ')}`
        : '';
  return {name: top[0], detail};
}

function risingItems(logs: PriceLog[], products: Product[]): RisingItem[] {
  const byProduct = new Map<number, PriceLog[]>();
  for (const log of logs) {
    if (!(log.retailPrice > 0)) continue;
    const list = byProduct.get(log.productId) ?? [];
    list.push(log);
    byProduct.set(log.productId, list);
  }
  const out: RisingItem[] = [];
  for (const [productId, plist] of byProduct) {
    if (plist.length < 2) continue;
    const ordered = [...plist].sort(
      (a, b) => new Date(a.capturedAt).getTime() - new Date(b.capturedAt).getTime(),
    );
    const latest = ordered[ordered.length - 1].retailPrice;
    const earlier = ordered.slice(0, -1);
    const previous = earlier.reduce((sum, log) => sum + log.retailPrice, 0) / earlier.length;
    if (!(previous > 0) || latest <= previous * 1.08) continue;
    const product = products.find(p => p.id === productId);
    out.push({
      productId,
      name: product?.name || 'Item',
      previous: Number(previous.toFixed(2)),
      latest: Number(latest.toFixed(2)),
      pct: Math.round(((latest - previous) / previous) * 100),
    });
  }
  return out.sort((a, b) => b.pct - a.pct);
}

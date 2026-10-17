import {resolveCategory} from '@/domain/productCategory';
import type {InsightPeriod} from '@/domain/homeInsights';
import {periodStart} from '@/domain/homeInsights';
import {friendlyMarketTitle} from '@/domain/marketBrand';
import type {Market, PriceLog, Product, ShoppingList} from '@/data/types';

export type PriceTrend = 'down' | 'up' | 'flat';

export type InsightAverage = {
  category: string;
  low: number;
  high: number;
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
  weekday: string | null;
  dateLabel: string | null;
  trend: PriceTrend;
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
  const market = markets.find(item => item.id === id);
  if (!market) return 'Mercado';
  return friendlyMarketTitle(market, markets);
}

function shortDate(at: number) {
  const date = new Date(at);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${day}/${month}`;
}

type Moment = {unit: number; at: number};

function cheapestMoment(points: Moment[]): {
  weekday: string | null;
  dateLabel: string | null;
  trend: PriceTrend;
} {
  const dated = points.filter(point => point.at > 0);
  if (!dated.length) return {weekday: null, dateLabel: null, trend: 'flat'};
  const best = dated.reduce((low, point) => (point.unit < low.unit ? point : low));
  const date = new Date(best.at);
  const weekday = WEEKDAYS[date.getDay()];
  const label = weekday.charAt(0).toUpperCase() + weekday.slice(1);
  return {
    weekday: label,
    dateLabel: shortDate(best.at),
    trend: priceTrend(dated, best),
  };
}

function priceTrend(points: Moment[], best: Moment): PriceTrend {
  const later = points.filter(point => point.at > best.at);
  const earlier = points.filter(point => point.at < best.at);
  if (later.length) {
    const avg = later.reduce((sum, point) => sum + point.unit, 0) / later.length;
    if (avg > best.unit * 1.05) return 'up';
  }
  if (earlier.length) {
    const avg = earlier.reduce((sum, point) => sum + point.unit, 0) / earlier.length;
    if (best.unit < avg * 0.95) return 'down';
  }
  return 'flat';
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
  const places = whereToBuy(bought, logs, args.products, averages);
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
  const byCat = new Map<string, {low: number; high: number; marketId: number | null}>();
  for (const log of logs) {
    const product = products.find(p => p.id === log.productId);
    const category = resolveCategory(product?.category, product?.name || '');
    const bucket = byCat.get(category) ?? {
      low: log.retailPrice,
      high: log.retailPrice,
      marketId: log.marketId,
    };
    if (log.retailPrice < bucket.low) {
      bucket.low = log.retailPrice;
      bucket.marketId = log.marketId;
    }
    if (log.retailPrice > bucket.high) bucket.high = log.retailPrice;
    byCat.set(category, bucket);
  }
  return [...byCat.entries()]
    .map(([category, bucket]) => ({
      category,
      low: Number(bucket.low.toFixed(2)),
      high: Number(bucket.high.toFixed(2)),
      marketName: marketName(markets, bucket.marketId),
    }))
    .sort((a, b) => b.high - a.high);
}

function whereToBuy(
  bought: Line[],
  logs: PriceLog[],
  products: Product[],
  averages: InsightAverage[],
): WhereToBuy[] {
  const byCat = new Map<string, Moment[]>();
  const add = (category: string, unit: number, at: number) => {
    const list = byCat.get(category) ?? [];
    list.push({unit, at});
    byCat.set(category, list);
  };
  for (const log of logs) {
    const product = products.find(item => item.id === log.productId);
    const category = resolveCategory(product?.category, product?.name || '');
    add(category, log.retailPrice, new Date(log.capturedAt).getTime());
  }
  for (const row of bought) {
    if (byCat.has(row.category)) continue;
    add(row.category, row.unit, row.at);
  }
  const categories = new Set([...byCat.keys(), ...averages.map(item => item.category)]);
  const out: WhereToBuy[] = [];
  for (const category of categories) {
    if (category === 'Outros') continue;
    const avg = averages.find(item => item.category === category);
    const moment = cheapestMoment(byCat.get(category) ?? []);
    out.push({
      category,
      marketName: avg?.marketName ?? 'Mercado',
      weekday: moment.weekday,
      dateLabel: moment.dateLabel,
      trend: moment.trend,
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
  const detail = cats.length ? cats.join(' e ') : '';
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

import {isFiscalList, isFiscalLog} from '@/domain/fiscal';
import type {Market, PriceLog, Product, ShoppingList} from '@/data/types';

export type PriceDrop = {
  productName: string;
  paid: number;
  now: number;
  marketName: string;
  saved: number;
};

type Row = {productName?: string; retailPrice?: number};

function norm(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function rowsOf(list: ShoppingList): Row[] {
  try {
    const parsed = JSON.parse(list.itemsJson) as Row[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function sameName(a: string, b: string) {
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
}

/** Itens que uma nota recente da comunidade viu mais baratos que a última nota da pessoa. */
export function priceDrops(args: {
  lists: ShoppingList[];
  logs: PriceLog[];
  products: Product[];
  markets: Market[];
  now?: number;
}): PriceDrop[] {
  const now = args.now ?? Date.now();
  const week = 7 * 86400000;
  const ownKeys = new Set(
    args.lists.filter(isFiscalList).map(list => list.nfceKey as string),
  );
  const paid = new Map<string, {name: string; price: number; at: number}>();
  const notes = [...args.lists]
    .filter(isFiscalList)
    .sort(
      (a, b) =>
        new Date(a.finishedAt).getTime() - new Date(b.finishedAt).getTime(),
    );
  for (const list of notes) {
    const at = new Date(list.finishedAt).getTime();
    for (const row of rowsOf(list)) {
      const name = (row.productName ?? '').trim();
      const price = Number(row.retailPrice ?? 0);
      if (!name || !(price > 0) || !Number.isFinite(at)) continue;
      const key = norm(name);
      const prev = paid.get(key);
      if (!prev || at >= prev.at) paid.set(key, {name, price, at});
    }
  }

  const drops: PriceDrop[] = [];
  for (const [key, last] of paid) {
    let best: PriceLog | null = null;
    for (const log of args.logs) {
      if (!isFiscalLog(log) || (log.nfceKey && ownKeys.has(log.nfceKey))) continue;
      const at = new Date(log.capturedAt).getTime();
      if (!Number.isFinite(at) || now - at > week) continue;
      if (!(log.retailPrice > 0) || log.retailPrice >= last.price) continue;
      const productName = args.products.find(item => item.id === log.productId)?.name ?? '';
      if (!sameName(key, norm(productName))) continue;
      if (!best || log.retailPrice < best.retailPrice) best = log;
    }
    if (!best) continue;
    const market = args.markets.find(item => item.id === best.marketId);
    drops.push({
      productName: last.name,
      paid: last.price,
      now: best.retailPrice,
      marketName: market?.name ?? 'Outro mercado',
      saved: last.price - best.retailPrice,
    });
  }
  drops.sort((a, b) => b.saved - a.saved);
  return drops.slice(0, 5);
}

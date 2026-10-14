import {guessCategory} from '@/domain/productCategory';
import {effectiveUnitPrice} from '@/domain/pricing';
import type {PriceLog, Product, ShoppingList} from '@/data/types';

export type PurchasePoint = {
  key: string;
  productId: number;
  category: string;
  unit: number;
  qty: number;
  at: number;
};

export type CheaperCategory = {
  category: string;
  dropPct: number;
  saved: number;
  recentAvg: number;
};

type LineJson = {
  productId?: number;
  productName?: string;
  quantity?: number;
  retailPrice?: number;
  wholesalePrice?: number | null;
  minWholesaleQty?: number | null;
  useWholesale?: number | null;
};

function categoryOf(productId: number, name: string, products: Product[]) {
  const stored = products.find(p => p.id === productId)?.category?.trim();
  return stored || guessCategory(name);
}

export function pointsFromLists(
  lists: ShoppingList[],
  products: Product[],
): PurchasePoint[] {
  const out: PurchasePoint[] = [];
  lists.forEach(list => {
    let rows: LineJson[] = [];
    try {
      const parsed = JSON.parse(list.itemsJson) as LineJson[];
      rows = Array.isArray(parsed) ? parsed : [];
    } catch {
      rows = [];
    }
    const at = new Date(list.finishedAt).getTime();
    rows.forEach((row, index) => {
      const qty = row.quantity ?? 1;
      const unit = effectiveUnitPrice({
        quantity: qty,
        retailPrice: row.retailPrice ?? 0,
        wholesalePrice: row.wholesalePrice,
        minWholesaleQty: row.minWholesaleQty,
        useWholesale: row.useWholesale,
      });
      if (!(unit > 0) || !(qty > 0)) return;
      out.push({
        key: `list-${list.id}-${index}`,
        productId: row.productId ?? 0,
        category: categoryOf(row.productId ?? 0, row.productName || '', products),
        unit,
        qty,
        at: Number.isFinite(at) ? at : 0,
      });
    });
  });
  return out;
}

export function pointsFromLogs(logs: PriceLog[], products: Product[]): PurchasePoint[] {
  return logs
    .filter(l => l.retailPrice > 0 && l.trustLevel !== 'hidden')
    .map(l => {
      const product = products.find(p => p.id === l.productId);
      return {
        key: `log-${l.id}`,
        productId: l.productId,
        category: categoryOf(l.productId, product?.name || '', products),
        unit: l.retailPrice,
        qty: 1,
        at: new Date(l.capturedAt).getTime() || 0,
      };
    });
}

function peersOf(point: PurchasePoint, all: PurchasePoint[]) {
  if (!point.productId) return [];
  return all.filter(p => p.productId === point.productId && p.key !== point.key && p.unit > 0);
}

/** Quanto o preço pago ficou abaixo da média dos outros preços do mesmo produto. */
export function economyAgainstAverage(
  purchases: PurchasePoint[],
  references: PurchasePoint[],
  sinceMs: number,
): {saved: number; compared: number} {
  let saved = 0;
  let compared = 0;
  for (const point of purchases) {
    if (point.at < sinceMs) continue;
    const peers = peersOf(point, references);
    if (!peers.length) continue;
    const avg = peers.reduce((sum, p) => sum + p.unit, 0) / peers.length;
    const diff = (avg - point.unit) * point.qty;
    compared += 1;
    if (diff > 0) saved += diff;
  }
  return {saved: Number(saved.toFixed(2)), compared};
}

/** Categorias cujo preço médio recente ficou abaixo do que já foi visto antes. */
export function cheaperCategories(
  purchases: PurchasePoint[],
  references: PurchasePoint[],
  days = 7,
  now = Date.now(),
): CheaperCategory[] {
  const since = now - days * 86400000;
  const recent = purchases.filter(p => p.at >= since);
  const byCat = new Map<string, PurchasePoint[]>();
  for (const point of recent) {
    const bucket = byCat.get(point.category) ?? [];
    bucket.push(point);
    byCat.set(point.category, bucket);
  }
  const out: CheaperCategory[] = [];
  for (const [category, rows] of byCat) {
    const recentQty = rows.reduce((sum, p) => sum + p.qty, 0);
    const recentAvg =
      rows.reduce((sum, p) => sum + p.unit * p.qty, 0) / recentQty;
    const older = references.filter(
      p => p.category === category && p.at < since && p.unit > 0,
    );
    if (!older.length || !(recentAvg > 0)) continue;
    const olderAvg = older.reduce((sum, p) => sum + p.unit, 0) / older.length;
    if (recentAvg >= olderAvg) continue;
    const dropPct = (olderAvg - recentAvg) / olderAvg;
    out.push({
      category,
      dropPct,
      saved: Number(((olderAvg - recentAvg) * recentQty).toFixed(2)),
      recentAvg: Number(recentAvg.toFixed(2)),
    });
  }
  return out.sort((a, b) => b.dropPct - a.dropPct).slice(0, 5);
}

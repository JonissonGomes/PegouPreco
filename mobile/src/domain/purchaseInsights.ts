import {resolveCategory} from '@/domain/productCategory';
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
  return resolveCategory(stored, name);
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

function peersAverage(
  point: PurchasePoint,
  totals: Map<number, {sum: number; count: number}>,
): number | null {
  if (!point.productId) return null;
  const bucket = totals.get(point.productId);
  if (!bucket || bucket.count < 2) return null;
  return (bucket.sum - point.unit) / (bucket.count - 1);
}

function productTotals(points: PurchasePoint[]) {
  const totals = new Map<number, {sum: number; count: number}>();
  for (const point of points) {
    if (!point.productId || !(point.unit > 0)) continue;
    const bucket = totals.get(point.productId) ?? {sum: 0, count: 0};
    bucket.sum += point.unit;
    bucket.count += 1;
    totals.set(point.productId, bucket);
  }
  return totals;
}

/** Quanto o preço pago ficou abaixo da média dos outros preços do mesmo produto. */
export function economyAgainstAverage(
  purchases: PurchasePoint[],
  references: PurchasePoint[],
  sinceMs: number,
): {saved: number; compared: number} {
  const totals = productTotals(references);
  let saved = 0;
  let compared = 0;
  for (const point of purchases) {
    if (point.at < sinceMs) continue;
    const avg = peersAverage(point, totals);
    if (avg == null) continue;
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
  const recentByCat = new Map<string, {sum: number; qty: number}>();
  for (const point of purchases) {
    if (point.at < since || !(point.qty > 0)) continue;
    const bucket = recentByCat.get(point.category) ?? {sum: 0, qty: 0};
    bucket.sum += point.unit * point.qty;
    bucket.qty += point.qty;
    recentByCat.set(point.category, bucket);
  }
  const olderByCat = new Map<string, {sum: number; count: number}>();
  for (const point of references) {
    if (point.at >= since || !(point.unit > 0)) continue;
    const bucket = olderByCat.get(point.category) ?? {sum: 0, count: 0};
    bucket.sum += point.unit;
    bucket.count += 1;
    olderByCat.set(point.category, bucket);
  }
  const out: CheaperCategory[] = [];
  const rest: CheaperCategory[] = [];
  for (const [category, recent] of recentByCat) {
    if (!(recent.qty > 0)) continue;
    const recentAvg = recent.sum / recent.qty;
    if (!(recentAvg > 0)) continue;
    const older = olderByCat.get(category);
    const olderAvg = older?.count ? older.sum / older.count : recentAvg;
    const dropped = olderAvg > recentAvg;
    const row: CheaperCategory = {
      category,
      dropPct: dropped ? (olderAvg - recentAvg) / olderAvg : 0,
      saved: Number(((olderAvg - recentAvg) * recent.qty).toFixed(2)),
      recentAvg: Number(recentAvg.toFixed(2)),
    };
    if (dropped) out.push(row);
    else rest.push(row);
  }
  out.sort((a, b) => b.dropPct - a.dropPct);
  rest.sort((a, b) => a.recentAvg - b.recentAvg);
  return [...out, ...rest].slice(0, 5);
}

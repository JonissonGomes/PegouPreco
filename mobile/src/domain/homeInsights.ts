import {isCommunityPrice} from '@/domain/compare';
import {effectiveUnitPrice, lineTotal} from '@/domain/pricing';
import type {CartItem, PriceLog, Product, ShoppingList} from '@/data/types';

export type CategorySpend = {
  category: string;
  total: number;
  itemCount: number;
};

export type CategorySaveEst = {
  category: string;
  saveEst: number;
};

export function lifetimeSavings(lists: ShoppingList[]): number {
  return lists.reduce((sum, l) => sum + (l.savings ?? 0), 0);
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

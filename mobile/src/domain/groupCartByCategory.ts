import {PRODUCT_CATEGORIES, resolveCategory} from '@/domain/productCategory';
import type {CartItem, Product} from '@/data/types';

export type CartCategoryGroup = {
  category: string;
  items: CartItem[];
};

export function groupCartByCategory(
  items: CartItem[],
  products: Product[],
): CartCategoryGroup[] {
  const order = new Map<string, number>(
    PRODUCT_CATEGORIES.map((name, index) => [name, index]),
  );
  const buckets = new Map<string, CartItem[]>();
  for (const item of items) {
    const stored = products.find(p => p.id === item.productId)?.category;
    const category = resolveCategory(stored, item.productName);
    const list = buckets.get(category) ?? [];
    list.push(item);
    buckets.set(category, list);
  }
  return [...buckets.entries()]
    .map(([category, groupItems]) => ({category, items: groupItems}))
    .sort(
      (a, b) =>
        (order.get(a.category) ?? 999) - (order.get(b.category) ?? 999) ||
        a.category.localeCompare(b.category, 'pt-BR'),
    );
}

import {resolveCategory} from '@/domain/productCategory';
import {relatedMarketIds} from '@/domain/marketBrand';
import type {Market, PriceLog, Product, ShoppingList, CartItem} from '@/data/types';

export type ShelfCategory = {
  category: string;
  purchases: number;
};

function listItems(list: ShoppingList): CartItem[] {
  try {
    const raw = JSON.parse(list.itemsJson) as CartItem[];
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

/** Categorias vistas no mercado e quantas compras de nota cada uma teve. */
export function marketShelf(
  market: Market,
  markets: Market[],
  products: Product[],
  logs: PriceLog[],
  lists: ShoppingList[],
): ShelfCategory[] {
  const ids = new Set(relatedMarketIds(market, markets));
  const byProduct = new Map(products.map(item => [item.id, item]));
  const counts = new Map<string, number>();
  const seen = new Set<string>();
  const noted = new Set<string>();

  const bump = (category: string, purchase: boolean, key: string) => {
    if (!category || category === 'Outros' || seen.has(key)) return;
    seen.add(key);
    const current = counts.get(category) ?? 0;
    counts.set(category, current + (purchase ? 1 : 0));
  };

  for (const log of logs) {
    if (log.marketId == null || !ids.has(log.marketId) || log.trustLevel === 'hidden') {
      continue;
    }
    const product = byProduct.get(log.productId);
    const category = resolveCategory(product?.category, product?.name || '');
    if (log.nfceKey) noted.add(log.nfceKey);
    bump(
      category,
      log.source === 'nfce',
      `log:${log.nfceKey || log.id}:${log.productId}:${log.contributorId || ''}`,
    );
  }

  for (const list of lists) {
    if (!list.nfceKey || list.marketId == null || !ids.has(list.marketId)) continue;
    if (noted.has(list.nfceKey)) continue;
    noted.add(list.nfceKey);
    for (const row of listItems(list)) {
      const product = byProduct.get(row.productId);
      const category = resolveCategory(
        product?.category,
        row.productName || product?.name || '',
      );
      bump(category, true, `list:${list.nfceKey}:${row.productId}`);
    }
  }

  return [...counts.entries()]
    .map(([category, purchases]) => ({category, purchases}))
    .sort((a, b) => b.purchases - a.purchases || a.category.localeCompare(b.category, 'pt-BR'));
}

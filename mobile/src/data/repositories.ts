import {similarity} from '@/domain/levenshtein';
import {lineSavings, lineTotal} from '@/domain/pricing';
import {
  getState,
  metaGet,
  metaSet,
  nextId,
  saveState,
} from './db';
import type {CartItem, Market, PriceLog, Product, ShoppingList} from './types';

function nowIso() {
  return new Date().toISOString();
}

export const prefs = {
  getOnboardingDone: () => metaGet('onboardingDone') === '1',
  setOnboardingDone: (v: boolean) => metaSet('onboardingDone', v ? '1' : '0'),
  getActiveListName: () => {
    const v = metaGet('activeListName');
    return v && v.length ? v : null;
  },
  getActiveMarketId: () => {
    const v = metaGet('activeMarketId');
    return v ? Number(v) : null;
  },
  setActiveList: (name: string, marketId: number) => {
    metaSet('activeListName', name);
    metaSet('activeMarketId', String(marketId));
  },
  clearActiveList: () => {
    metaSet('activeListName', '');
    metaSet('activeMarketId', '');
  },
  getCurrentMarketId: () => {
    const v = metaGet('currentMarketId');
    return v ? Number(v) : null;
  },
  setCurrentMarketId: (id: number | null) =>
    metaSet('currentMarketId', id == null ? '' : String(id)),
  getAuthJson: () => {
    const v = metaGet('authSession');
    return v && v.length ? v : null;
  },
  setAuthJson: (json: string | null) => metaSet('authSession', json ?? ''),
  getLocalUserId: () => {
    let id = metaGet('localUserId');
    if (!id) {
      id = `local_${Date.now().toString(36)}`;
      metaSet('localUserId', id);
    }
    return id;
  },
};

export const marketRepo = {
  all(): Market[] {
    return [...getState().markets].sort((a, b) =>
      a.name.localeCompare(b.name, 'pt-BR'),
    );
  },
  getById(id: number): Market | null {
    return getState().markets.find(m => m.id === id) ?? null;
  },
  resolveOrCreate(name: string, cnpj?: string | null): Market {
    const trimmed = name.trim();
    const existing = getState().markets.find(
      m => m.name.toLowerCase() === trimmed.toLowerCase(),
    );
    if (existing) return existing;
    const market: Market = {
      id: nextId('markets'),
      name: trimmed,
      cnpj: cnpj ?? null,
      uf: null,
      lat: null,
      lng: null,
      address: null,
      avgRating: null,
      ratingsCount: 0,
      priceLevel: null,
      remoteId: null,
      updatedAt: nowIso(),
      synced: 0,
    };
    getState().markets.push(market);
    saveState();
    return market;
  },
  upsertGeo(
    id: number,
    data: Partial<
      Pick<
        Market,
        | 'lat'
        | 'lng'
        | 'address'
        | 'avgRating'
        | 'ratingsCount'
        | 'priceLevel'
        | 'remoteId'
      >
    >,
  ) {
    const m = marketRepo.getById(id);
    if (!m) return;
    Object.assign(m, data, {updatedAt: nowIso(), synced: 0});
    saveState();
  },
};

export const productRepo = {
  all(): Product[] {
    return [...getState().products].sort((a, b) =>
      a.name.localeCompare(b.name, 'pt-BR'),
    );
  },
  getById(id: number): Product | null {
    return getState().products.find(p => p.id === id) ?? null;
  },
  resolveOrCreate(name: string, category?: string | null): Product {
    const trimmed = name.trim();
    let best: Product | null = null;
    let bestScore = 0.72;
    for (const p of getState().products) {
      const score = similarity(trimmed, p.name);
      if (score > bestScore) {
        bestScore = score;
        best = p;
      }
    }
    if (best) return best;
    const product: Product = {
      id: nextId('products'),
      name: trimmed,
      aliasesJson: '[]',
      category: category ?? null,
      remoteId: null,
      updatedAt: nowIso(),
      synced: 0,
    };
    getState().products.push(product);
    saveState();
    return product;
  },
  rename(id: number, name: string) {
    const p = productRepo.getById(id);
    if (!p) return;
    p.name = name.trim();
    p.updatedAt = nowIso();
    p.synced = 0;
    saveState();
  },
};

export const priceLogRepo = {
  forProduct(productId: number): PriceLog[] {
    return getState()
      .price_logs.filter(l => l.productId === productId)
      .sort(
        (a, b) =>
          new Date(b.capturedAt).getTime() - new Date(a.capturedAt).getTime(),
      );
  },
  forMarketToday(marketId: number): Array<PriceLog & {productName: string}> {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return getState()
      .price_logs.filter(l => {
        if (l.marketId !== marketId) return false;
        const t = new Date(l.capturedAt);
        return t >= start && t < end;
      })
      .sort(
        (a, b) =>
          new Date(b.capturedAt).getTime() - new Date(a.capturedAt).getTime(),
      )
      .map(l => ({
        ...l,
        productName:
          productRepo.getById(l.productId)?.name ?? `Produto #${l.productId}`,
      }));
  },
  insert(log: Omit<PriceLog, 'id'>) {
    getState().price_logs.push({...log, id: nextId('price_logs')});
    saveState();
  },
  statsForProduct(productId: number) {
    const logs = priceLogRepo.forProduct(productId);
    if (!logs.length) return null;
    const prices = logs.map(l => l.retailPrice);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;
    const last = logs[0];
    return {
      minPrice,
      maxPrice,
      avgPrice,
      lastPrice: last.retailPrice,
      lastCapturedAt: last.capturedAt,
      lastMarketName: last.marketId
        ? marketRepo.getById(last.marketId)?.name ?? null
        : null,
    };
  },
  cartContext(
    productId: number,
    currentUnit: number,
    currentMarketId?: number | null,
  ) {
    const logs = priceLogRepo.forProduct(productId);
    if (!logs.length) {
      return {
        previousPrice: null as number | null,
        previousAt: null as string | null,
        bestPrice: null as number | null,
        bestMarketName: null as string | null,
      };
    }
    let previous: PriceLog | null = null;
    for (const log of logs) {
      const same =
        Math.abs(log.retailPrice - currentUnit) < 0.009 &&
        (currentMarketId == null || log.marketId === currentMarketId);
      if (!same) {
        previous = log;
        break;
      }
    }
    previous ??= logs.length > 1 ? logs[1] : null;
    const best = logs.reduce((a, b) =>
      a.retailPrice < b.retailPrice ? a : b,
    );
    return {
      previousPrice: previous?.retailPrice ?? null,
      previousAt: previous?.capturedAt ?? null,
      bestPrice: best.retailPrice,
      bestMarketName: best.marketId
        ? marketRepo.getById(best.marketId)?.name ?? null
        : null,
    };
  },
  cheapestNow(limit = 20) {
    const out: Array<{
      product: Product;
      log: PriceLog;
      marketName: string | null;
    }> = [];
    for (const p of productRepo.all()) {
      const logs = priceLogRepo.forProduct(p.id);
      if (!logs.length) continue;
      const best = logs.reduce((a, b) =>
        a.retailPrice < b.retailPrice ? a : b,
      );
      out.push({
        product: p,
        log: best,
        marketName: best.marketId
          ? marketRepo.getById(best.marketId)?.name ?? null
          : null,
      });
    }
    return out
      .sort((a, b) => a.log.retailPrice - b.log.retailPrice)
      .slice(0, limit);
  },
  opportunities() {
    const out: Array<{
      product: Product;
      lastPrice: number;
      avgPrice: number;
      pctAbove: number;
    }> = [];
    for (const p of productRepo.all()) {
      const stats = priceLogRepo.statsForProduct(p.id);
      if (!stats || stats.avgPrice <= 0) continue;
      const pct = ((stats.lastPrice - stats.avgPrice) / stats.avgPrice) * 100;
      if (pct >= 8) {
        out.push({
          product: p,
          lastPrice: stats.lastPrice,
          avgPrice: stats.avgPrice,
          pctAbove: pct,
        });
      }
    }
    return out.sort((a, b) => b.pctAbove - a.pctAbove);
  },
};

export const cartRepo = {
  all(): CartItem[] {
    return [...getState().cart_items].sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );
  },
  clear() {
    getState().cart_items = [];
    saveState();
  },
  toggleChecked(id: number) {
    const item = getState().cart_items.find(c => c.id === id);
    if (!item) return;
    item.checkedOff = item.checkedOff ? 0 : 1;
    item.updatedAt = nowIso();
    saveState();
  },
  upsert(item: {
    productId: number;
    productName: string;
    quantity: number;
    retailPrice: number;
    wholesalePrice?: number | null;
    minWholesaleQty?: number | null;
  }) {
    const existing = getState().cart_items.find(
      c => c.productId === item.productId,
    );
    if (existing) {
      Object.assign(existing, {
        productName: item.productName,
        quantity: item.quantity,
        retailPrice: item.retailPrice,
        wholesalePrice: item.wholesalePrice ?? null,
        minWholesaleQty: item.minWholesaleQty ?? null,
        updatedAt: nowIso(),
      });
    } else {
      getState().cart_items.push({
        id: nextId('cart_items'),
        productId: item.productId,
        productName: item.productName,
        quantity: item.quantity,
        retailPrice: item.retailPrice,
        wholesalePrice: item.wholesalePrice ?? null,
        minWholesaleQty: item.minWholesaleQty ?? null,
        checkedOff: 0,
        updatedAt: nowIso(),
      });
    }
    saveState();
  },
  updateItem(
    id: number,
    data: {
      productName: string;
      quantity: number;
      retailPrice: number;
      wholesalePrice?: number | null;
      minWholesaleQty?: number | null;
    },
  ) {
    const item = getState().cart_items.find(c => c.id === id);
    if (!item) return;
    Object.assign(item, {
      ...data,
      wholesalePrice: data.wholesalePrice ?? null,
      minWholesaleQty: data.minWholesaleQty ?? null,
      updatedAt: nowIso(),
    });
    saveState();
  },
  computeTotals(items: CartItem[]) {
    let subtotal = 0;
    let savings = 0;
    let checkedCount = 0;
    for (const i of items) {
      subtotal += lineTotal(i);
      savings += lineSavings(i);
      if (i.checkedOff) checkedCount += 1;
    }
    return {subtotal, savings, checkedCount, itemCount: items.length};
  },
};

export const shoppingListRepo = {
  all(): ShoppingList[] {
    return [...getState().shopping_lists].sort(
      (a, b) =>
        new Date(b.finishedAt).getTime() - new Date(a.finishedAt).getTime(),
    );
  },
  insert(list: Omit<ShoppingList, 'id'>) {
    getState().shopping_lists.push({...list, id: nextId('shopping_lists')});
    saveState();
  },
};

export function finalizeActiveList() {
  const items = cartRepo.all();
  if (!items.length) return false;
  const name = prefs.getActiveListName() || 'Lista';
  const marketId = prefs.getActiveMarketId();
  const market = marketId ? marketRepo.getById(marketId) : null;
  const totals = cartRepo.computeTotals(items);
  const finishedAt = nowIso();
  shoppingListRepo.insert({
    name,
    marketId,
    marketName: market?.name ?? null,
    itemsJson: JSON.stringify(items),
    subtotal: totals.subtotal,
    savings: totals.savings,
    itemCount: totals.itemCount,
    finishedAt,
    remoteId: null,
    updatedAt: finishedAt,
    synced: 0,
  });
  cartRepo.clear();
  prefs.clearActiveList();
  return true;
}

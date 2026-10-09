import {similarity} from '@/domain/levenshtein';
import {
  lineRetailTotal,
  lineSavings,
  lineTotal,
  lineWholesaleTotal,
} from '@/domain/pricing';
import {haversineKm} from '@/data/remote/nearbyMarkets';
import {preferAddress} from '@/domain/marketUi';
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
  /** Atualiza só o mercado da lista ativa (ex.: NFC-e do emitente). */
  setActiveMarketId: (marketId: number) => {
    metaSet('activeMarketId', String(marketId));
  },
  clearActiveList: () => {
    metaSet('activeListName', '');
    metaSet('activeMarketId', '');
  },
  /** Evita mercado “fantasma” sem lista ativa. */
  ensureActiveListConsistency: () => {
    const name = metaGet('activeListName');
    if (!name) {
      metaSet('activeMarketId', '');
    }
  },
  getCurrentMarketId: () => {
    const v = metaGet('currentMarketId');
    return v ? Number(v) : null;
  },
  setCurrentMarketId: (id: number | null) =>
    metaSet('currentMarketId', id == null ? '' : String(id)),
  getLastLocation: (): {lat: number; lng: number} | null => {
    const lat = metaGet('lastLat');
    const lng = metaGet('lastLng');
    if (!lat || !lng) return null;
    const a = Number(lat);
    const b = Number(lng);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
    return {lat: a, lng: b};
  },
  setLastLocation: (lat: number, lng: number) => {
    metaSet('lastLat', String(lat));
    metaSet('lastLng', String(lng));
  },
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
  getLocationPrefs: (): {
    city: string;
    neighborhood: string;
    favoriteMarketIds: number[];
  } => {
    const city = metaGet('prefCity') || '';
    const neighborhood = metaGet('prefNeighborhood') || '';
    let favoriteMarketIds: number[] = [];
    try {
      const raw = metaGet('prefFavoriteMarketIds');
      if (raw) {
        const parsed = JSON.parse(raw) as number[];
        if (Array.isArray(parsed)) favoriteMarketIds = parsed.map(Number);
      }
    } catch {
      favoriteMarketIds = [];
    }
    return {city, neighborhood, favoriteMarketIds};
  },
  setLocationPrefs: (prefsIn: {
    city: string;
    neighborhood: string;
    favoriteMarketIds: number[];
  }) => {
    metaSet('prefCity', prefsIn.city.trim());
    metaSet('prefNeighborhood', prefsIn.neighborhood.trim());
    metaSet(
      'prefFavoriteMarketIds',
      JSON.stringify(prefsIn.favoriteMarketIds ?? []),
    );
  },
  getLastSyncAt: () => metaGet('lastSyncAt') || new Date(0).toISOString(),
  setLastSyncAt: (iso: string) => metaSet('lastSyncAt', iso),
  confirmedMarketKeys: (): string[] => {
    try {
      const raw = metaGet('confirmedMarkets');
      const parsed = raw ? (JSON.parse(raw) as string[]) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  },
  markMarketConfirmed: (key: string) => {
    const next = new Set(prefs.confirmedMarketKeys());
    next.add(key);
    metaSet('confirmedMarkets', JSON.stringify([...next]));
  },
};

/** Conta verificada por e-mail pode contribuir/votar. */
export function canContribute(auth: {
  emailVerified?: boolean;
  phoneVerified?: boolean;
  token?: string;
} | null): boolean {
  return (
    !!auth?.token && (!!auth.emailVerified || !!auth.phoneVerified)
  );
}

export const marketRepo = {
  all(): Market[] {
    return [...getState().markets].sort((a, b) =>
      a.name.localeCompare(b.name, 'pt-BR'),
    );
  },
  getById(id: number): Market | null {
    return getState().markets.find(m => m.id === id) ?? null;
  },
  /** Tira o mercado local para o sync não recriar o que o admin apagou. */
  dropCloudCopy(remoteId: string, name: string, lat: number, lng: number) {
    const near = Number.isFinite(lat) && Number.isFinite(lng);
    const state = getState();
    state.markets = state.markets.filter(m => {
      if (remoteId && m.remoteId === remoteId) return false;
      if (!near) return true;
      if (m.name.trim().toLowerCase() !== name.trim().toLowerCase()) return true;
      if (m.lat == null || m.lng == null) return false;
      return haversineKm({lat: m.lat, lng: m.lng}, {lat, lng}) > 0.4;
    });
    saveState();
  },
  resolveOrCreate(name: string, cnpj?: string | null): Market {
    const trimmed = name.trim();
    const existing = getState().markets.find(
      m => m.name.toLowerCase() === trimmed.toLowerCase(),
    );
    if (existing) return existing;
    return marketRepo.create(trimmed, cnpj);
  },
  /**
   * Evita fundir filiais homônimas distantes (ex.: Atacadão em Recife vs outra cidade).
   * Sem coordenadas, cai no match só por nome.
   */
  resolveOrCreateNear(
    name: string,
    lat: number,
    lng: number,
    cnpj?: string | null,
    maxKm = 0.35,
  ): Market {
    const trimmed = name.trim();
    // 1) Mesmo ponto físico (qualquer nome) — corrige seed/Mapbox errado
    const byGeo = getState().markets.find(
      m =>
        m.lat != null &&
        m.lng != null &&
        haversineKm({lat: m.lat, lng: m.lng}, {lat, lng}) <= 0.2,
    );
    if (byGeo) return byGeo;

    // 2) Mesmo nome só se estiver perto (ou ainda sem geo)
    const sameName = getState().markets.filter(
      m => m.name.toLowerCase() === trimmed.toLowerCase(),
    );
    const near = sameName.find(m => {
      if (m.lat == null || m.lng == null) return true;
      return haversineKm({lat: m.lat, lng: m.lng}, {lat, lng}) <= maxKm;
    });
    if (near) return near;
    return marketRepo.create(trimmed, cnpj);
  },
  /** Atualiza nome+geo a partir da descoberta local (OSM/Mapbox). */
  upsertFromDiscovery(hit: {
    name: string;
    lat: number;
    lng: number;
    address?: string | null;
    cnpj?: string | null;
  }): Market {
    const m = marketRepo.resolveOrCreateNear(
      hit.name,
      hit.lat,
      hit.lng,
      hit.cnpj,
    );
    const nextName = hit.name.trim();
    // Nome da descoberta local prevalece (corrige seed/geocode genérico)
    if (nextName) m.name = nextName;
    marketRepo.upsertGeo(m.id, {
      lat: hit.lat,
      lng: hit.lng,
      address: preferAddress(m.address, hit.address),
    });
    return m;
  },
  create(name: string, cnpj?: string | null): Market {
    const market: Market = {
      id: nextId('markets'),
      name: name.trim(),
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
        | 'weeklyVisitors'
        | 'featured'
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
  all(): PriceLog[] {
    return [...getState().price_logs].sort(
      (a, b) =>
        new Date(b.capturedAt).getTime() - new Date(a.capturedAt).getTime(),
    );
  },
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
        bestMarketId: null as number | null,
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
      bestMarketId: best.marketId ?? null,
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
  setUseWholesale(id: number, useWholesale: boolean) {
    const item = getState().cart_items.find(c => c.id === id);
    if (!item) return;
    if (useWholesale && item.wholesalePrice == null) return;
    item.useWholesale = useWholesale ? 1 : 0;
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
    useWholesale?: number | null;
    checkedOff?: number;
  }) {
    const wholesale = item.wholesalePrice ?? null;
    const minQty = item.minWholesaleQty ?? null;
    const useWholesale =
      item.useWholesale != null
        ? item.useWholesale
        : wholesale != null && minQty != null && item.quantity >= minQty
          ? 1
          : 0;
    const existing = getState().cart_items.find(
      c => c.productId === item.productId,
    );
    if (existing) {
      Object.assign(existing, {
        productName: item.productName,
        quantity: item.quantity,
        retailPrice: item.retailPrice,
        wholesalePrice: wholesale,
        minWholesaleQty: minQty,
        useWholesale,
        updatedAt: nowIso(),
      });
    } else {
      getState().cart_items.push({
        id: nextId('cart_items'),
        productId: item.productId,
        productName: item.productName,
        quantity: item.quantity,
        retailPrice: item.retailPrice,
        wholesalePrice: wholesale,
        minWholesaleQty: minQty,
        useWholesale,
        checkedOff: item.checkedOff ?? 1,
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
      useWholesale?: number | null;
    },
  ) {
    const item = getState().cart_items.find(c => c.id === id);
    if (!item) return;
    Object.assign(item, {
      productName: data.productName,
      quantity: data.quantity,
      retailPrice: data.retailPrice,
      wholesalePrice: data.wholesalePrice ?? null,
      minWholesaleQty: data.minWholesaleQty ?? null,
      useWholesale:
        data.useWholesale != null ? data.useWholesale : item.useWholesale ?? 0,
      updatedAt: nowIso(),
    });
    saveState();
  },
  remove(id: number) {
    const st = getState();
    st.cart_items = st.cart_items.filter(c => c.id !== id);
    saveState();
  },
  computeTotals(items: CartItem[]) {
    let subtotal = 0;
    let retailTotal = 0;
    let wholesaleTotal = 0;
    let savings = 0;
    let checkedCount = 0;
    for (const i of items) {
      if (!i.checkedOff) continue;
      checkedCount += 1;
      subtotal += lineTotal(i);
      retailTotal += lineRetailTotal(i);
      wholesaleTotal += lineWholesaleTotal(i);
      savings += lineSavings(i);
    }
    return {
      subtotal,
      retailTotal,
      wholesaleTotal,
      savings,
      checkedCount,
      itemCount: items.length,
    };
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
  remove(id: number) {
    const st = getState();
    st.shopping_lists = st.shopping_lists.filter(l => l.id !== id);
    saveState();
  },
};

export function finalizeActiveList() {
  const items = cartRepo.all();
  const selected = items.filter(i => i.checkedOff);
  if (!selected.length) return false;
  const name = prefs.getActiveListName() || 'Lista';
  const marketId = prefs.getActiveMarketId();
  const market = marketId ? marketRepo.getById(marketId) : null;
  const totals = cartRepo.computeTotals(items);
  const finishedAt = nowIso();
  shoppingListRepo.insert({
    name,
    marketId,
    marketName: market?.name ?? null,
    itemsJson: JSON.stringify(selected),
    subtotal: totals.subtotal,
    savings: totals.savings,
    itemCount: selected.length,
    finishedAt,
    remoteId: null,
    updatedAt: finishedAt,
    synced: 0,
  });
  cartRepo.clear();
  prefs.clearActiveList();
  metaSet('badge_lista_completa', '1');
  return true;
}

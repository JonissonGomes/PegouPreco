import {haversineKm} from './util.js';

const CHAINS: Array<[RegExp, string]> = [
  [/assa[ií]|sendas/i, 'Assaí Atacadista'],
  [/atacad[aã]o/i, 'Atacadão'],
  [/carrefour/i, 'Carrefour'],
  [/bompre[cç]o/i, 'Bompreço'],
  [/mix mateus/i, 'Mix Mateus'],
  [/makro/i, 'Makro'],
  [/sam['’]?s|sams club/i, "Sam's Club"],
];

const SAME_PLACE_KM = 0.45;

export function chainLabel(name: string): string | null {
  const hit = CHAINS.find(([re]) => re.test(name));
  return hit ? hit[1] : null;
}

export function isStoreCodeName(name: string): boolean {
  return /^loja\s+\d+/i.test(name.trim());
}

function cnpjKey(value: unknown): string {
  const digits = String(value ?? '').replace(/\D/g, '');
  return digits.length >= 8 ? digits : '';
}

/** Mesma loja: mesmo CNPJ, ou perto com nome/rede parecidos. */
export function sameStorefront(
  a: {name?: unknown; lat?: unknown; lng?: unknown; cnpj?: unknown},
  b: {name?: unknown; lat?: unknown; lng?: unknown; cnpj?: unknown},
): boolean {
  const cnpjA = cnpjKey(a.cnpj);
  const cnpjB = cnpjKey(b.cnpj);
  if (cnpjA && cnpjA === cnpjB) return true;
  const latA = Number(a.lat);
  const lngA = Number(a.lng);
  const latB = Number(b.lat);
  const lngB = Number(b.lng);
  if (![latA, lngA, latB, lngB].every(Number.isFinite)) return false;
  if (haversineKm({lat: latA, lng: lngA}, {lat: latB, lng: lngB}) > SAME_PLACE_KM) {
    return false;
  }
  const nameA = String(a.name ?? '');
  const nameB = String(b.name ?? '');
  if (namesLikelySame(nameA, nameB)) return true;
  const chainA = chainLabel(nameA);
  const chainB = chainLabel(nameB);
  if (chainA && chainA === chainB) return true;
  if (isStoreCodeName(nameA) && chainB) return true;
  if (isStoreCodeName(nameB) && chainA) return true;
  return false;
}

/**
 * Soma visitantes e avaliações dos cadastros que são a mesma loja.
 * Cada pin do grupo passa a mostrar o total da comunidade.
 */
export function rollupPlaceStats(
  pins: Record<string, unknown>[],
  visitorsByMarket: Map<string, Set<string>>,
): void {
  const parent = pins.map((_, index) => index);
  const find = (index: number): number => {
    let cursor = index;
    while (parent[cursor] !== cursor) {
      parent[cursor] = parent[parent[cursor]];
      cursor = parent[cursor];
    }
    return cursor;
  };
  const unite = (left: number, right: number) => {
    const rootLeft = find(left);
    const rootRight = find(right);
    if (rootLeft !== rootRight) parent[rootRight] = rootLeft;
  };
  for (let i = 0; i < pins.length; i++) {
    for (let j = i + 1; j < pins.length; j++) {
      if (sameStorefront(pins[i], pins[j])) unite(i, j);
    }
  }
  const groups = new Map<number, number[]>();
  pins.forEach((_, index) => {
    const root = find(index);
    const list = groups.get(root) ?? [];
    list.push(index);
    groups.set(root, list);
  });
  for (const indexes of groups.values()) {
    if (indexes.length < 2) continue;
    const users = new Set<string>();
    let weighted = 0;
    let count = 0;
    for (const index of indexes) {
      const id = String(pins[index].id ?? '');
      for (const user of visitorsByMarket.get(id) ?? []) users.add(user);
      const ratings = Number(pins[index].ratingsCount ?? 0);
      if (ratings > 0) {
        weighted += Number(pins[index].avgRating ?? 0) * ratings;
        count += ratings;
      }
    }
    for (const index of indexes) {
      pins[index].weeklyVisitors = users.size;
      pins[index].ratingsCount = count;
      pins[index].avgRating = count > 0 ? weighted / count : 0;
    }
  }
}

function hasGeo(row: Record<string, unknown>): boolean {
  if (row.lat == null || row.lng == null || row.lat === '' || row.lng === '') {
    return false;
  }
  return Number.isFinite(Number(row.lat)) && Number.isFinite(Number(row.lng));
}

/**
 * Nota fiscal muitas vezes grava o mercado sem coordenada.
 * Esse cadastro não vira pin; as compras e avaliações passam para o pin de mesmo nome.
 */
export function graftUnlocated(
  pins: Record<string, unknown>[],
  extras: Record<string, unknown>[],
  visitors: Map<string, Set<string>>,
  reviews: Map<string, {avg: number; count: number}>,
): void {
  for (const extra of extras) {
    if (hasGeo(extra)) continue;
    const extraId = String(extra.id ?? '');
    const extraName = String(extra.name ?? '');
    if (!extraId || !extraName) continue;
    const host = pins.find(pin => namesLikelySame(String(pin.name ?? ''), extraName));
    if (!host) continue;
    const hostId = String(host.id ?? '');
    const mates = new Set<string>(
      Array.isArray(host.mateIds) ? host.mateIds.map(id => String(id)) : [hostId],
    );
    mates.add(hostId);
    mates.add(extraId);
    host.mateIds = [...mates];
    const users = new Set<string>(visitors.get(hostId) ?? []);
    for (const user of visitors.get(extraId) ?? []) users.add(user);
    if (hostId) visitors.set(hostId, users);
    host.weeklyVisitors = users.size;
    const extraReview = reviews.get(extraId);
    if (!extraReview || extraReview.count <= 0) continue;
    const hostCount = Number(host.ratingsCount ?? 0);
    const hostAvg = Number(host.avgRating ?? 0);
    const count = hostCount + extraReview.count;
    host.ratingsCount = count;
    host.avgRating =
      count > 0 ? (hostAvg * hostCount + extraReview.avg * extraReview.count) / count : 0;
  }
}

export type ShelfRow = {name: string; category: string | null; count: number};

export function shelfRows(
  marketIds: string[],
  logs: {marketId?: unknown; productId?: unknown}[],
  products: Map<string, {name: string; category: string | null}>,
): ShelfRow[] {
  const ids = new Set(marketIds);
  const counts = new Map<string, ShelfRow>();
  for (const log of logs) {
    const marketId = String(log.marketId ?? '');
    if (!ids.has(marketId)) continue;
    const product = products.get(String(log.productId ?? ''));
    const name = product?.name?.trim() || '';
    if (!name) continue;
    const key = name.toLowerCase();
    const current = counts.get(key) ?? {
      name,
      category: product?.category ?? null,
      count: 0,
    };
    current.count += 1;
    counts.set(key, current);
  }
  return [...counts.values()].sort((a, b) => b.count - a.count).slice(0, 80);
}

export function collapseMapPins(
  pins: Record<string, unknown>[],
): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  for (const pin of pins) {
    const lat = Number(pin.lat);
    const lng = Number(pin.lng);
    const name = String(pin.name ?? '');
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const dup = out.find(other => {
      const oLat = Number(other.lat);
      const oLng = Number(other.lng);
      if (!Number.isFinite(oLat) || !Number.isFinite(oLng)) return false;
      const dist = haversineKm({lat, lng}, {lat: oLat, lng: oLng});
      if (dist > 0.4) return false;
      return namesLikelySame(name, String(other.name ?? ''));
    });
    if (!dup) {
      out.push(pin);
      continue;
    }
    const dupScore =
      Number(dup.ratingsCount ?? 0) + Number(dup.weeklyVisitors ?? 0);
    const pinScore =
      Number(pin.ratingsCount ?? 0) + Number(pin.weeklyVisitors ?? 0);
    if (pinScore > dupScore || String(pin.name ?? '').length > String(dup.name ?? '').length) {
      const index = out.indexOf(dup);
      out[index] = pin;
    }
  }
  return out;
}

export function marketNameKey(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\b(ltda|s\/a|sa|supermercado|mercado|atacarejo|hipermercado|alimentos|comercio|comercial|eireli|epp)\b/g, ' ')
    .replace(/\b(lj|loja)\s*\d+\b/g, ' ')
    .replace(/\b\d+\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function namesLikelySame(a: string, b: string): boolean {
  const ka = marketNameKey(a);
  const kb = marketNameKey(b);
  if (!ka || !kb) return false;
  if (ka === kb) return true;
  if (ka.includes(kb) || kb.includes(ka)) return true;
  const ta = ka.split(' ').filter(t => t.length > 2);
  const tb = new Set(kb.split(' ').filter(t => t.length > 2));
  if (!ta.length || !tb.size) return false;
  const inter = ta.filter(t => tb.has(t)).length;
  return inter / Math.min(ta.length, tb.size) >= 0.6;
}

import type {Market} from '@/data/types';
import {haversineKm, namesLikelySame} from '@/data/remote/nearbyMarkets';

const CHAINS: Array<[RegExp, string]> = [
  [/assa[ií]|sendas/i, 'Assaí Atacadista'],
  [/atacad[aã]o/i, 'Atacadão'],
  [/carrefour/i, 'Carrefour'],
  [/bompre[cç]o/i, 'Bompreço'],
  [/mix mateus/i, 'Mix Mateus'],
  [/makro/i, 'Makro'],
  [/sam['’]?s|sams club/i, "Sam's Club"],
];

const NEAR_KM = 0.45;

export function isStoreCodeName(name: string): boolean {
  return /^loja\s+\d+/i.test(name.trim());
}

export function chainLabel(name: string): string | null {
  const hit = CHAINS.find(([re]) => re.test(name));
  return hit ? hit[1] : null;
}

function near(a: Market, b: Market): boolean {
  if (a.lat == null || a.lng == null || b.lat == null || b.lng == null) return false;
  return haversineKm({lat: a.lat, lng: a.lng}, {lat: b.lat, lng: b.lng}) <= NEAR_KM;
}

/** Nome de vitrine. “Loja 109” perto de um Assaí aparece como Assaí. */
export function friendlyMarketTitle(market: Market, others: Market[]): string {
  const own = chainLabel(market.name);
  if (own && !isStoreCodeName(market.name)) return own;
  if (!isStoreCodeName(market.name)) return market.name;
  const brand = others.find(
    other => other.id !== market.id && near(market, other) && chainLabel(other.name),
  );
  return brand ? chainLabel(brand.name)! : market.name;
}

/** Notas e listas do mesmo ponto físico, inclusive o código interno da loja. */
export function relatedMarketIds(market: Market, others: Market[]): number[] {
  const ids = [market.id];
  for (const other of others) {
    if (other.id === market.id || !near(market, other)) continue;
    const sameChain =
      chainLabel(market.name) != null &&
      chainLabel(market.name) === chainLabel(other.name);
    const codeAndBrand =
      (isStoreCodeName(market.name) && !!chainLabel(other.name)) ||
      (isStoreCodeName(other.name) && !!chainLabel(market.name));
    if (namesLikelySame(market.name, other.name) || sameChain || codeAndBrand) {
      ids.push(other.id);
    }
  }
  return ids;
}

/** Prefere a rede quando a fantasia da nota é só o código da loja. */
export function friendlyEmitName(
  fantasy: string | null,
  legal: string | null,
): string | null {
  const fantasia = fantasy?.trim() || '';
  const razao = legal?.trim() || '';
  const brand = chainLabel(`${fantasia} ${razao}`);
  if (brand && (isStoreCodeName(fantasia) || !fantasia)) return brand;
  if (brand && chainLabel(fantasia)) return brand;
  return fantasia || razao || null;
}

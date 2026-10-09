import type {Market} from '@/data/types';
import {
  CONFIRM_AT_MARKET_KM,
  haversineKm,
} from '@/data/remote/nearbyMarkets';

export type PriceBand = 'low' | 'fair' | 'high' | 'unknown';

export type RankedMarket = Market & {
  distanceKm: number | null;
  priceBand: PriceBand;
};

/** Mercado mais próximo se estiver dentro do limiar de confirmação in-loco. */
export function pickConfirmCandidate(
  markets: Market[],
  origin: {lat: number; lng: number} | null,
  maxKm = CONFIRM_AT_MARKET_KM,
): RankedMarket | null {
  if (!origin) return null;
  const ranked = rankNearestMarkets(markets, origin, {limit: 1});
  const top = ranked[0];
  if (!top || top.distanceKm == null || top.distanceKm > maxKm) return null;
  return top;
}

export function resolvePriceBand(market: Market): PriceBand {
  const raw = (market.priceLevel || '').toLowerCase();
  if (raw === 'low' || raw === 'baixa') return 'low';
  if (raw === 'high' || raw === 'alta') return 'high';
  if (raw === 'fair' || raw === 'media' || raw === 'média') return 'fair';
  // Heurística leve pela nota da comunidade
  const rating = market.avgRating ?? 0;
  const n = market.ratingsCount ?? 0;
  if (n < 3 || rating <= 0) return 'unknown';
  if (rating >= 4.2) return 'low';
  if (rating <= 3.5) return 'high';
  return 'fair';
}

export function priceBandLabel(band: PriceBand): string {
  switch (band) {
    case 'low':
      return 'Em baixa';
    case 'fair':
      return 'Estável';
    case 'high':
      return 'Em alta';
    default:
      return 'Sem dados';
  }
}

/** Prefere o texto que já traz cidade, em vez de só a via (ex.: BR-101). */
export function preferAddress(
  current: string | null | undefined,
  incoming: string | null | undefined,
): string | null {
  const score = (value: string | null | undefined) => {
    const text = (value ?? '').trim();
    if (!text) return 0;
    if (/^BR[-\s]?\d+$/i.test(text)) return 1;
    return text.length + (text.includes(',') ? 24 : 0);
  };
  return score(incoming) >= score(current)
    ? (incoming ?? current ?? null)
    : (current ?? null);
}

export function formatDistanceKm(km: number | null | undefined): string {
  if (km == null || Number.isNaN(km)) return '—';
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(km < 10 ? 1 : 0)} km`;
}

export function rankNearestMarkets(
  markets: Market[],
  origin: {lat: number; lng: number} | null,
  opts?: {query?: string; limit?: number},
): RankedMarket[] {
  const q = (opts?.query ?? '').trim().toLowerCase();
  const limit = opts?.limit ?? 3;
  let list = markets.filter(m => m.lat != null && m.lng != null);
  if (q) {
    list = list.filter(
      m =>
        m.name.toLowerCase().includes(q) ||
        (m.address ?? '').toLowerCase().includes(q),
    );
  }
  const ranked: RankedMarket[] = list.map(m => ({
    ...m,
    distanceKm: origin
      ? haversineKm(origin, {lat: m.lat!, lng: m.lng!})
      : null,
    priceBand: resolvePriceBand(m),
  }));
  ranked.sort((a, b) => {
    if (a.distanceKm == null && b.distanceKm == null) {
      return a.name.localeCompare(b.name, 'pt-BR');
    }
    if (a.distanceKm == null) return 1;
    if (b.distanceKm == null) return -1;
    return a.distanceKm - b.distanceKm;
  });
  return ranked.slice(0, limit);
}

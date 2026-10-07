import {MAPBOX_ACCESS_TOKEN} from '@/config/env';
import {marketRepo} from '@/data/repositories';
import {
  discoverNearbyMarkets,
  NEARBY_RADIUS_KM,
  type NearbyMarketHit,
} from '@/data/remote/nearbyMarkets';

/**
 * Descobre mercados próximos (OSM/Mapbox/seed) e persiste no banco local.
 * Usado pelo mapa e pelo fluxo de nova lista.
 */
export async function ensureNearbyMarketsDiscovered(
  lat: number,
  lng: number,
  opts?: {radiusKm?: number; mapboxToken?: string},
): Promise<{hits: NearbyMarketHit[]; marketIds: number[]}> {
  const radiusKm = opts?.radiusKm ?? NEARBY_RADIUS_KM;
  const token = opts?.mapboxToken ?? MAPBOX_ACCESS_TOKEN;
  const hits = await discoverNearbyMarkets(lat, lng, radiusKm, token);
  const marketIds: number[] = [];
  for (const h of hits) {
    const m = marketRepo.upsertFromDiscovery(h);
    marketIds.push(m.id);
  }
  return {hits, marketIds};
}

import {MAPBOX_ACCESS_TOKEN} from '@/config/env';
import {marketRepo} from '@/data/repositories';
import {
  discoverNearbyMarkets,
  NEARBY_RADIUS_KM,
  type NearbyMarketHit,
} from '@/data/remote/nearbyMarkets';

const CELL_DEG = 0.02;
const CELL_TTL_MS = 4 * 60 * 60 * 1000;

type DiscoveryResult = {
  hits: NearbyMarketHit[];
  marketIds: number[];
  fromCache: boolean;
  added: number;
};

const cellCache = new Map<string, {at: number; result: DiscoveryResult}>();
const inflight = new Map<string, Promise<DiscoveryResult>>();

function cellKey(lat: number, lng: number, radiusKm: number) {
  const latCell = Math.round(lat / CELL_DEG);
  const lngCell = Math.round(lng / CELL_DEG);
  return `${latCell}:${lngCell}:${radiusKm}`;
}

/**
 * Descobre mercados próximos (OSM/Mapbox) e persiste no banco local.
 * Reaproveita a mesma célula por algumas horas e junta chamadas simultâneas.
 */
export async function ensureNearbyMarketsDiscovered(
  lat: number,
  lng: number,
  opts?: {radiusKm?: number; mapboxToken?: string; force?: boolean},
): Promise<DiscoveryResult> {
  const radiusKm = opts?.radiusKm ?? NEARBY_RADIUS_KM;
  const token = opts?.mapboxToken ?? MAPBOX_ACCESS_TOKEN;
  const key = cellKey(lat, lng, radiusKm);
  if (!opts?.force) {
    const cached = cellCache.get(key);
    if (cached && Date.now() - cached.at < CELL_TTL_MS) {
      return {...cached.result, hits: [], fromCache: true, added: 0};
    }
    const pending = inflight.get(key);
    if (pending) return pending;
  }

  const job = (async (): Promise<DiscoveryResult> => {
    const before = new Set(marketRepo.all().map(m => m.id));
    const hits = await discoverNearbyMarkets(lat, lng, radiusKm, token);
    const marketIds: number[] = [];
    let added = 0;
    for (const h of hits) {
      const m = marketRepo.upsertFromDiscovery(h);
      marketIds.push(m.id);
      if (!before.has(m.id)) added += 1;
    }
    const result: DiscoveryResult = {
      hits,
      marketIds,
      fromCache: false,
      added,
    };
    cellCache.set(key, {at: Date.now(), result});
    return result;
  })();

  inflight.set(key, job);
  try {
    return await job;
  } finally {
    inflight.delete(key);
  }
}

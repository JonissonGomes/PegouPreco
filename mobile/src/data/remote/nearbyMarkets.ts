import {SEED_MARKET_POINTS} from '@/data/seed/marketPoints';

export type NearbyMarketHit = {
  name: string;
  lat: number;
  lng: number;
  address: string | null;
  source: 'osm' | 'seed';
  distanceKm?: number;
};

/** Raio padrão de descoberta/exibição no mapa. */
export const NEARBY_RADIUS_KM = 50;
export const NEARBY_RADIUS_M = NEARBY_RADIUS_KM * 1000;
/** Quantos mais próximos manter dentro do raio (evita inundar o mapa). */
export const NEARBY_MAX_RESULTS = 40;

/** Marcas comuns no BR — usadas para priorizar/filtrar resultados. */
const BRAND_HINT =
  /atacad[aã]o|atacarejo|assa[ií]|carrefour|extra|bompre[cç]o|sam'?s|makro|fort|hiper|supermercado|mercado|atacadista/i;

export function haversineKm(
  a: {lat: number; lng: number},
  b: {lat: number; lng: number},
) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function withDistance(
  hits: NearbyMarketHit[],
  origin: {lat: number; lng: number},
): NearbyMarketHit[] {
  return hits.map(h => ({
    ...h,
    distanceKm: haversineKm(origin, h),
  }));
}

function nearestInRadius(
  hits: NearbyMarketHit[],
  origin: {lat: number; lng: number},
  radiusKm = NEARBY_RADIUS_KM,
  limit = NEARBY_MAX_RESULTS,
): NearbyMarketHit[] {
  return withDistance(hits, origin)
    .filter(h => (h.distanceKm ?? Infinity) <= radiusKm)
    .sort((a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0))
    .slice(0, limit);
}

function dedupe(hits: NearbyMarketHit[]): NearbyMarketHit[] {
  const out: NearbyMarketHit[] = [];
  for (const h of hits) {
    const dup = out.find(
      x =>
        x.name.toLowerCase() === h.name.toLowerCase() ||
        haversineKm(x, h) < 0.12,
    );
    if (!dup) out.push(h);
  }
  return out;
}

/** OpenStreetMap Overpass — supermercados/atacados no raio. */
export async function fetchOsmNearbyMarkets(
  lat: number,
  lng: number,
  radiusM = NEARBY_RADIUS_M,
): Promise<NearbyMarketHit[]> {
  const query = `
[out:json][timeout:45];
(
  node["shop"~"supermarket|wholesale"](around:${radiusM},${lat},${lng});
  way["shop"~"supermarket|wholesale"](around:${radiusM},${lat},${lng});
  node["name"~"Atacad|Atacarejo|Assa[ií]|Carrefour|Extra|Bompre|Sam",i](around:${radiusM},${lat},${lng});
  way["name"~"Atacad|Atacarejo|Assa[ií]|Carrefour|Extra|Bompre|Sam",i](around:${radiusM},${lat},${lng});
);
out center tags;
`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 40000);
  try {
    const res = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: {'Content-Type': 'application/x-www-form-urlencoded'},
      body: `data=${encodeURIComponent(query)}`,
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Overpass ${res.status}`);
    const data = (await res.json()) as {
      elements?: Array<{
        tags?: Record<string, string>;
        lat?: number;
        lon?: number;
        center?: {lat: number; lon: number};
      }>;
    };
    const hits: NearbyMarketHit[] = [];
    for (const el of data.elements ?? []) {
      const name = (el.tags?.name || el.tags?.brand || '').trim();
      if (!name) continue;
      const plat = el.lat ?? el.center?.lat;
      const plng = el.lon ?? el.center?.lon;
      if (plat == null || plng == null) continue;
      const shop = el.tags?.shop ?? '';
      if (!BRAND_HINT.test(name) && !/supermarket|wholesale/i.test(shop)) {
        continue;
      }
      const addr = [
        el.tags?.['addr:street'],
        el.tags?.['addr:housenumber'],
        el.tags?.['addr:suburb'] || el.tags?.['addr:city'],
      ]
        .filter(Boolean)
        .join(', ');
      hits.push({
        name,
        lat: plat,
        lng: plng,
        address: addr || null,
        source: 'osm',
      });
    }
    return nearestInRadius(dedupe(hits), {lat, lng});
  } finally {
    clearTimeout(timer);
  }
}

/** Fallback local (pontos do seed) dentro do raio. */
export function seedMarketsNear(
  lat: number,
  lng: number,
  maxKm = NEARBY_RADIUS_KM,
): NearbyMarketHit[] {
  const hits = SEED_MARKET_POINTS.map(m => ({
    name: m.name,
    lat: m.lat,
    lng: m.lng,
    address: m.address,
    source: 'seed' as const,
  }));
  return nearestInRadius(hits, {lat, lng}, maxKm);
}

async function fetchMapboxNearbyMarkets(
  lat: number,
  lng: number,
  token: string,
): Promise<NearbyMarketHit[]> {
  if (!token) return [];
  const queries = [
    'supermercado',
    'Atacadão',
    'Novo Atacarejo',
    'Assaí',
    'Carrefour',
    'Extra',
  ];
  const hits: NearbyMarketHit[] = [];
  await Promise.all(
    queries.map(async q => {
      try {
        const url =
          `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json` +
          `?proximity=${lng},${lat}&country=BR&types=poi&limit=8&language=pt&access_token=${token}`;
        const res = await fetch(url);
        if (!res.ok) return;
        const data = (await res.json()) as {
          features?: Array<{
            text?: string;
            place_name?: string;
            center?: [number, number];
          }>;
        };
        for (const f of data.features ?? []) {
          const name = (f.text || '').trim();
          const center = f.center;
          if (!name || !center) continue;
          hits.push({
            name,
            lng: center[0],
            lat: center[1],
            address: f.place_name ?? null,
            source: 'osm',
          });
        }
      } catch {
        // ignore query
      }
    }),
  );
  return nearestInRadius(dedupe(hits), {lat, lng});
}

export async function discoverNearbyMarkets(
  lat: number,
  lng: number,
  radiusKm = NEARBY_RADIUS_KM,
  mapboxToken?: string,
): Promise<NearbyMarketHit[]> {
  const origin = {lat, lng};
  const merged: NearbyMarketHit[] = [];

  try {
    const osm = await fetchOsmNearbyMarkets(lat, lng, radiusKm * 1000);
    merged.push(...osm);
  } catch {
    // overpass lento / bloqueado
  }

  if (merged.length < 5 && mapboxToken) {
    try {
      const mb = await fetchMapboxNearbyMarkets(lat, lng, mapboxToken);
      merged.push(...mb);
    } catch {
      // token / rede
    }
  }

  const near = nearestInRadius(dedupe(merged), origin, radiusKm);
  if (near.length > 0) return near;

  // Seed só se o usuário estiver perto desses pontos (ex.: Recife)
  return seedMarketsNear(lat, lng, radiusKm);
}

/** Filtra mercados já salvos para exibir só os do raio. */
export function filterMarketsInRadius<
  T extends {lat: number | null; lng: number | null},
>(
  markets: T[],
  origin: {lat: number; lng: number},
  radiusKm = NEARBY_RADIUS_KM,
  limit = NEARBY_MAX_RESULTS,
): T[] {
  return markets
    .filter(m => m.lat != null && m.lng != null)
    .map(m => ({
      market: m,
      distanceKm: haversineKm(origin, {lat: m.lat!, lng: m.lng!}),
    }))
    .filter(x => x.distanceKm <= radiusKm)
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, limit)
    .map(x => x.market);
}

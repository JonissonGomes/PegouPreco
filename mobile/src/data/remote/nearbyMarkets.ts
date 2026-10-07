import {SEED_MARKET_POINTS} from '@/data/seed/marketPoints';

export type NearbyMarketHit = {
  name: string;
  lat: number;
  lng: number;
  address: string | null;
  source: 'osm' | 'mapbox' | 'seed';
  distanceKm?: number;
};

/** Raio padrão de descoberta/exibição no mapa. */
export const NEARBY_RADIUS_KM = 25;
export const NEARBY_RADIUS_M = NEARBY_RADIUS_KM * 1000;
/** Quantos mais próximos manter dentro do raio. */
export const NEARBY_MAX_RESULTS = 40;

/** Marcas / tipos aceitos no mapa. */
const BRAND_HINT =
  /atacad[aã]o|atacarejo|assa[ií]|carrefour|extra|bompre[cç]o|sam'?s|makro|fort\b|hiper|supermercado|mercado|atacadista|rede\s*compra|prezunic|guanabara|pao\s*de\s*acucar|p[aã]o\s*de\s*a[cç][uú]car|big\b|walmart|save\s*money|mix\s*mateus|mateus\s*sup|comercial\s*esperan/i;

const SOURCE_RANK: Record<NearbyMarketHit['source'], number> = {
  osm: 3,
  mapbox: 2,
  seed: 1,
};

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

/** Dedupe só por proximidade — nomes iguais em lugares diferentes são filiais distintas. */
function dedupeByGeo(
  hits: NearbyMarketHit[],
  mergeKm = 0.18,
): NearbyMarketHit[] {
  const sorted = [...hits].sort(
    (a, b) => SOURCE_RANK[b.source] - SOURCE_RANK[a.source],
  );
  const out: NearbyMarketHit[] = [];
  for (const h of sorted) {
    const dup = out.find(x => haversineKm(x, h) < mergeKm);
    if (!dup) {
      out.push(h);
      continue;
    }
    // Mantém a fonte melhor; se empatar, prefer nome mais descritivo
    if (
      SOURCE_RANK[h.source] > SOURCE_RANK[dup.source] ||
      (SOURCE_RANK[h.source] === SOURCE_RANK[dup.source] &&
        h.name.length > dup.name.length)
    ) {
      Object.assign(dup, h);
    }
  }
  return out;
}

function bboxAround(lat: number, lng: number, km: number) {
  const dLat = km / 111;
  const dLng = km / (111 * Math.cos((lat * Math.PI) / 180));
  return {
    minLng: lng - dLng,
    minLat: lat - dLat,
    maxLng: lng + dLng,
    maxLat: lat + dLat,
  };
}

function formatOsmName(tags: Record<string, string>): string {
  const base = (tags.name || tags.brand || tags.operator || '').trim();
  if (!base) return '';
  const branch = (tags.branch || tags['name:branch'] || '').trim();
  const suburb = (
    tags['addr:suburb'] ||
    tags['addr:district'] ||
    tags['addr:neighbourhood'] ||
    ''
  ).trim();
  const street = (tags['addr:street'] || '').trim();
  const place = suburb || street;
  if (branch && !base.toLowerCase().includes(branch.toLowerCase())) {
    return `${base} ${branch}`;
  }
  if (
    place &&
    !base.toLowerCase().includes(place.toLowerCase()) &&
    base.split(/\s+/).length <= 3
  ) {
    return `${base} — ${place}`;
  }
  return base;
}

function formatOsmAddress(tags: Record<string, string>): string | null {
  const addr = [
    tags['addr:street'],
    tags['addr:housenumber'],
    tags['addr:suburb'] || tags['addr:city'],
  ]
    .filter(Boolean)
    .join(', ');
  return addr || null;
}

/** OpenStreetMap Overpass — fonte principal (nome + coordenada reais). */
export async function fetchOsmNearbyMarkets(
  lat: number,
  lng: number,
  radiusM = NEARBY_RADIUS_M,
): Promise<NearbyMarketHit[]> {
  const query = `
[out:json][timeout:45];
(
  node["shop"="supermarket"](around:${radiusM},${lat},${lng});
  way["shop"="supermarket"](around:${radiusM},${lat},${lng});
  node["shop"="wholesale"](around:${radiusM},${lat},${lng});
  way["shop"="wholesale"](around:${radiusM},${lat},${lng});
  node["shop"="convenience"]["brand"~"Assa|Extra|Bompre|Carrefour",i](around:${radiusM},${lat},${lng});
  node["amenity"="marketplace"](around:${Math.min(radiusM, 8000)},${lat},${lng});
);
out center tags;
`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 40000);
  try {
    const endpoints = [
      'https://overpass-api.de/api/interpreter',
      'https://overpass.kumi.systems/api/interpreter',
    ];
    let data: {
      elements?: Array<{
        tags?: Record<string, string>;
        lat?: number;
        lon?: number;
        center?: {lat: number; lon: number};
      }>;
    } | null = null;

    for (const endpoint of endpoints) {
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: {'Content-Type': 'application/x-www-form-urlencoded'},
          body: `data=${encodeURIComponent(query)}`,
          signal: controller.signal,
        });
        if (!res.ok) continue;
        data = (await res.json()) as typeof data;
        break;
      } catch {
        // tenta próximo endpoint
      }
    }
    if (!data) throw new Error('Overpass indisponível');

    const hits: NearbyMarketHit[] = [];
    for (const el of data.elements ?? []) {
      const tags = el.tags ?? {};
      const name = formatOsmName(tags);
      if (!name) continue;
      const plat = el.lat ?? el.center?.lat;
      const plng = el.lon ?? el.center?.lon;
      if (plat == null || plng == null) continue;
      const shop = tags.shop ?? '';
      if (
        !BRAND_HINT.test(name) &&
        !/supermarket|wholesale/i.test(shop) &&
        tags.amenity !== 'marketplace'
      ) {
        continue;
      }
      hits.push({
        name,
        lat: plat,
        lng: plng,
        address: formatOsmAddress(tags),
        source: 'osm',
      });
    }
    return nearestInRadius(dedupeByGeo(hits), {lat, lng});
  } finally {
    clearTimeout(timer);
  }
}

/** Fallback local (seed) — só no raio curto. */
export function seedMarketsNear(
  lat: number,
  lng: number,
  maxKm = 12,
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

type MapboxFeature = {
  text?: string;
  place_name?: string;
  center?: [number, number];
  properties?: {category?: string; address?: string};
  context?: Array<{id?: string; text?: string}>;
};

function mapboxDisplayName(f: MapboxFeature): string {
  const base = (f.text || '').trim();
  if (!base) return '';
  const neighborhood =
    f.context?.find(c => c.id?.startsWith('neighborhood') || c.id?.startsWith('locality'))
      ?.text ||
    f.context?.find(c => c.id?.startsWith('place'))?.text ||
    '';
  const street = (f.properties?.address || '').trim();
  const place = street || neighborhood;
  if (place && !base.toLowerCase().includes(place.toLowerCase())) {
    return `${base} — ${place}`;
  }
  return base;
}

function isPlausibleMarket(f: MapboxFeature, name: string): boolean {
  if (!BRAND_HINT.test(name) && !BRAND_HINT.test(f.place_name || '')) {
    return false;
  }
  const cat = (f.properties?.category || '').toLowerCase();
  if (
    cat &&
    !/shop|food|grocery|supermarket|wholesale|store|mall|commercial/i.test(cat)
  ) {
    // categoria estranha (escola, posto etc.)
    if (/school|fuel|hotel|museum|park|hospital/i.test(cat)) return false;
  }
  return true;
}

async function fetchMapboxNearbyMarkets(
  lat: number,
  lng: number,
  token: string,
  radiusKm = NEARBY_RADIUS_KM,
): Promise<NearbyMarketHit[]> {
  if (!token) return [];
  const box = bboxAround(lat, lng, radiusKm);
  const bbox = `${box.minLng},${box.minLat},${box.maxLng},${box.maxLat}`;
  const queries = [
    'Atacadão',
    'Assaí Atacadista',
    'Novo Atacarejo',
    'Carrefour',
    'Extra Bompreço',
    "Sam's Club",
    'supermercado',
  ];
  const hits: NearbyMarketHit[] = [];
  await Promise.all(
    queries.map(async q => {
      try {
        const url =
          `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json` +
          `?proximity=${lng},${lat}&bbox=${bbox}&country=BR&types=poi&limit=6&language=pt&access_token=${token}`;
        const res = await fetch(url);
        if (!res.ok) return;
        const data = (await res.json()) as {features?: MapboxFeature[]};
        for (const f of data.features ?? []) {
          const name = mapboxDisplayName(f);
          const center = f.center;
          if (!name || !center) continue;
          if (!isPlausibleMarket(f, name)) continue;
          const plat = center[1];
          const plng = center[0];
          if (haversineKm({lat, lng}, {lat: plat, lng: plng}) > radiusKm) {
            continue;
          }
          hits.push({
            name,
            lng: plng,
            lat: plat,
            address: f.place_name ?? null,
            source: 'mapbox',
          });
        }
      } catch {
        // ignore query
      }
    }),
  );
  return nearestInRadius(dedupeByGeo(hits), {lat, lng}, radiusKm);
}

/**
 * Descobre mercados na localidade.
 * Ordem: OSM (preciso) → Mapbox (só pontos novos no bbox) → seed curto.
 */
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

  // Mapbox só completa buracos — nunca sobrescreve OSM no mesmo ponto
  if (mapboxToken) {
    try {
      const mb = await fetchMapboxNearbyMarkets(
        lat,
        lng,
        mapboxToken,
        radiusKm,
      );
      for (const h of mb) {
        const nearOsm = merged.some(x => haversineKm(x, h) < 0.2);
        if (!nearOsm) merged.push(h);
      }
    } catch {
      // token / rede
    }
  }

  const near = nearestInRadius(dedupeByGeo(merged), origin, radiusKm);
  if (near.length > 0) return near;

  // Seed só se realmente perto dos pontos cadastrados (Recife)
  return seedMarketsNear(lat, lng, Math.min(radiusKm, 12));
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

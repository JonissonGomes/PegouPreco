import axios from 'axios';
import {haversineKm, NEARBY_RADIUS_KM} from '@/data/remote/nearbyMarkets';

export type GeocodeMarketHit = {
  name: string;
  lat: number;
  lng: number;
  address: string | null;
};

/**
 * Forward geocode de um mercado perto do usuário (Mapbox Places, gratuito no token).
 */
export async function geocodeMarketNear(
  name: string,
  origin: {lat: number; lng: number},
  mapboxToken?: string,
  radiusKm = NEARBY_RADIUS_KM,
): Promise<GeocodeMarketHit | null> {
  const q = name.trim();
  const token = mapboxToken?.trim();
  if (!q || !token) return null;

  const dLat = radiusKm / 111;
  const dLng = radiusKm / (111 * Math.cos((origin.lat * Math.PI) / 180));
  const bbox = [
    origin.lng - dLng,
    origin.lat - dLat,
    origin.lng + dLng,
    origin.lat + dLat,
  ].join(',');

  try {
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json`;
    const {data} = await axios.get(url, {
      params: {
        proximity: `${origin.lng},${origin.lat}`,
        bbox,
        country: 'BR',
        types: 'poi',
        limit: 5,
        language: 'pt',
        access_token: token,
      },
      timeout: 10000,
    });
    const features = (data.features as Array<{
      text?: string;
      place_name?: string;
      center?: [number, number];
    }>) ?? [];
    let best: GeocodeMarketHit | null = null;
    let bestDist = Infinity;
    for (const f of features) {
      const center = f.center;
      if (!center) continue;
      const lat = center[1];
      const lng = center[0];
      const dist = haversineKm(origin, {lat, lng});
      if (dist > radiusKm) continue;
      if (dist < bestDist) {
        bestDist = dist;
        best = {
          name: (f.text || q).trim(),
          lat,
          lng,
          address: f.place_name ?? null,
        };
      }
    }
    return best;
  } catch {
    return null;
  }
}

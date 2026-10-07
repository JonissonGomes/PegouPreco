import axios from 'axios';

export type ReverseGeocodeResult = {
  city: string;
  neighborhood: string;
  uf?: string;
};

function nonempty(s: unknown): string {
  return typeof s === 'string' ? s.trim() : '';
}

function fromNominatimAddress(
  addr: Record<string, string> | undefined,
): ReverseGeocodeResult | null {
  if (!addr) return null;
  const city = nonempty(
    addr.city ??
      addr.town ??
      addr.municipality ??
      addr.village ??
      addr.place,
  );
  const neighborhood = nonempty(
    addr.suburb ??
      addr.neighbourhood ??
      addr.city_district ??
      addr.quarter,
  );
  const uf = nonempty(addr['ISO3166-2-lvl4']?.replace(/^BR-/i, '') ?? addr.state);
  if (!city && !neighborhood) return null;
  return {
    city: city || neighborhood,
    neighborhood: neighborhood || city,
    uf: uf || undefined,
  };
}

function fromMapboxFeatures(
  features: Array<Record<string, unknown>>,
): ReverseGeocodeResult | null {
  let city = '';
  let neighborhood = '';
  let uf = '';

  for (const f of features) {
    const types = (f.place_type as string[]) ?? [];
    const text = nonempty(f.text);
    if (
      !city &&
      (types.includes('place') ||
        types.includes('locality') ||
        types.includes('district'))
    ) {
      city = text;
    }
    if (
      !neighborhood &&
      (types.includes('neighborhood') ||
        types.includes('district') ||
        types.includes('locality'))
    ) {
      if (!types.includes('place') || !city) {
        neighborhood = text;
      }
    }
  }

  const primary = features[0];
  const ctx = (primary?.context as Array<{id?: string; text?: string; short_code?: string}>) ?? [];
  for (const c of ctx) {
    const id = String(c.id ?? '');
    const text = nonempty(c.text);
    if ((id.startsWith('place.') || id.startsWith('locality.')) && !city) {
      city = text;
    }
    if (
      (id.startsWith('neighborhood.') ||
        id.startsWith('locality.') ||
        id.startsWith('district.')) &&
      !neighborhood
    ) {
      neighborhood = text;
    }
    if (id.startsWith('region.') && !uf) {
      const sc = nonempty(c.short_code);
      uf = sc.replace(/^BR-/i, '') || text.slice(0, 2).toUpperCase();
    }
  }

  if (!city && neighborhood) city = neighborhood;
  if (!neighborhood && city) neighborhood = city;
  if (!city && !neighborhood) return null;
  return {city, neighborhood, uf: uf || undefined};
}

async function reverseMapbox(
  lat: number,
  lng: number,
  token: string,
): Promise<ReverseGeocodeResult | null> {
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json`;
  const {data} = await axios.get(url, {
    params: {
      types: 'place,locality,neighborhood,district',
      language: 'pt',
      access_token: token,
    },
    timeout: 12000,
  });
  return fromMapboxFeatures((data.features as Array<Record<string, unknown>>) ?? []);
}

async function reverseNominatim(
  lat: number,
  lng: number,
): Promise<ReverseGeocodeResult | null> {
  const {data} = await axios.get(
    'https://nominatim.openstreetmap.org/reverse',
    {
      params: {
        format: 'jsonv2',
        lat,
        lon: lng,
        'accept-language': 'pt-BR',
      },
      headers: {'User-Agent': 'PegouPreco/1.0'},
      timeout: 15000,
    },
  );
  return fromNominatimAddress(data.address as Record<string, string> | undefined);
}

export async function reverseGeocode(
  lat: number,
  lng: number,
  mapboxToken?: string,
): Promise<ReverseGeocodeResult | null> {
  const token = mapboxToken?.trim();
  try {
    if (token) {
      const hit = await reverseMapbox(lat, lng, token);
      if (hit) return hit;
    }
    return await reverseNominatim(lat, lng);
  } catch {
    if (token) {
      try {
        return await reverseNominatim(lat, lng);
      } catch {
        return null;
      }
    }
    return null;
  }
}

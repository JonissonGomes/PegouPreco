import {
  CONFIRM_AT_MARKET_KM,
  dedupeByGeo,
  haversineKm,
  type NearbyMarketHit,
} from '../src/data/remote/nearbyMarkets';
import {pickConfirmCandidate, rankNearestMarkets} from '../src/domain/marketUi';
import type {Market} from '../src/data/types';

function market(
  partial: Partial<Market> & {id: number; name: string},
): Market {
  return {
    cnpj: null,
    uf: 'PE',
    lat: null,
    lng: null,
    address: null,
    avgRating: null,
    ratingsCount: 0,
    priceLevel: null,
    remoteId: null,
    updatedAt: new Date().toISOString(),
    synced: 0,
    ...partial,
  };
}

describe('nearbyMarkets geo', () => {
  it('haversineKm calcula distância razoável em Recife', () => {
    const a = {lat: -8.0476, lng: -34.8813};
    const b = {lat: -8.1015, lng: -34.9255};
    const km = haversineKm(a, b);
    expect(km).toBeGreaterThan(5);
    expect(km).toBeLessThan(12);
  });

  it('dedupeByGeo funde pontos muito próximos e prefere OSM', () => {
    const hits: NearbyMarketHit[] = [
      {
        name: 'Assaí genérico',
        lat: -8.1015,
        lng: -34.9255,
        address: null,
        source: 'mapbox',
      },
      {
        name: 'Assaí Atacadista Imbiribeira',
        lat: -8.10155,
        lng: -34.92545,
        address: 'Imbiribeira',
        source: 'osm',
      },
    ];
    const out = dedupeByGeo(hits);
    expect(out).toHaveLength(1);
    expect(out[0].source).toBe('osm');
    expect(out[0].name).toContain('Assaí');
  });

});

describe('pickConfirmCandidate', () => {
  it('confirma só se estiver dentro do limiar', () => {
    const origin = {lat: -8.1015, lng: -34.9255};
    const markets = [
      market({
        id: 1,
        name: 'Assaí Atacadista Imbiribeira',
        lat: -8.1016,
        lng: -34.9256,
      }),
      market({
        id: 2,
        name: 'Carrefour Dourados',
        lat: -8.0476,
        lng: -34.877,
      }),
    ];
    const hit = pickConfirmCandidate(markets, origin);
    expect(hit?.id).toBe(1);
    expect(hit!.distanceKm!).toBeLessThanOrEqual(CONFIRM_AT_MARKET_KM);

    const far = pickConfirmCandidate(markets, {
      lat: -8.05,
      lng: -34.88,
    });
    expect(far).toBeNull();
  });

  it('rankNearestMarkets ordena por distância', () => {
    const origin = {lat: -8.11, lng: -34.92};
    const ranked = rankNearestMarkets(
      [
        market({
          id: 1,
          name: 'Longe',
          lat: -8.0,
          lng: -34.85,
        }),
        market({
          id: 2,
          name: 'Perto',
          lat: -8.111,
          lng: -34.921,
        }),
      ],
      origin,
      {limit: 2},
    );
    expect(ranked[0].name).toBe('Perto');
    expect(ranked[0].distanceKm!).toBeLessThan(ranked[1].distanceKm!);
  });
});

import {
  isCommunityPrice,
  rankMarketsForBasket,
} from '../src/domain/compare';
import {deriveBadges, mergeBadges} from '../src/domain/badges';
import type {Market, PriceLog} from '../src/data/types';

describe('compare community', () => {
  it('aceita verified e nfce recente', () => {
    const verified: PriceLog = {
      id: 1,
      productId: 1,
      marketId: 1,
      retailPrice: 10,
      wholesalePrice: null,
      minWholesaleQty: null,
      source: 'label',
      capturedAt: new Date().toISOString(),
      remoteId: null,
      nfceKey: null,
      confirmScore: 3,
      rejectScore: 0,
      trustLevel: 'verified',
      lastConfirmedAt: new Date().toISOString(),
      contributorId: null,
      updatedAt: new Date().toISOString(),
      synced: 0,
    };
    expect(isCommunityPrice(verified)).toBe(true);

    const hidden = {...verified, trustLevel: 'hidden' as const};
    expect(isCommunityPrice(hidden)).toBe(false);

    const nfce = {
      ...verified,
      trustLevel: 'suspect' as const,
      source: 'nfce' as const,
    };
    expect(isCommunityPrice(nfce)).toBe(true);
  });

  it('ranqueia mercados favoritos por cobertura e total', () => {
    const markets: Market[] = [
      {
        id: 1,
        name: 'Mercado A',
        cnpj: null,
        uf: null,
        lat: -8,
        lng: -34,
        address: null,
        avgRating: null,
        ratingsCount: 0,
        priceLevel: null,
        remoteId: null,
        updatedAt: '',
        synced: 0,
      },
      {
        id: 2,
        name: 'Mercado B',
        cnpj: null,
        uf: null,
        lat: -8,
        lng: -34,
        address: null,
        avgRating: null,
        ratingsCount: 0,
        priceLevel: null,
        remoteId: null,
        updatedAt: '',
        synced: 0,
      },
    ];
    const now = new Date().toISOString();
    const logs: PriceLog[] = [
      {
        id: 1,
        productId: 10,
        marketId: 1,
        retailPrice: 20,
        wholesalePrice: null,
        minWholesaleQty: null,
        source: 'label',
        capturedAt: now,
        remoteId: null,
        nfceKey: null,
        confirmScore: 3,
        rejectScore: 0,
        trustLevel: 'verified',
        lastConfirmedAt: now,
        contributorId: null,
        updatedAt: now,
        synced: 0,
      },
      {
        id: 2,
        productId: 10,
        marketId: 2,
        retailPrice: 15,
        wholesalePrice: null,
        minWholesaleQty: null,
        source: 'label',
        capturedAt: now,
        remoteId: null,
        nfceKey: null,
        confirmScore: 3,
        rejectScore: 0,
        trustLevel: 'verified',
        lastConfirmedAt: now,
        contributorId: null,
        updatedAt: now,
        synced: 0,
      },
    ];
    const ranks = rankMarketsForBasket(
      [{productId: 10, productName: 'Arroz', quantity: 2}],
      markets,
      logs,
      {favoriteIds: [1, 2], minCoverage: 0.2},
    );
    expect(ranks[0].marketName).toBe('Mercado B');
    expect(ranks[0].total).toBeCloseTo(30, 1);
  });
});

describe('badges', () => {
  it('deriva badges por eventos', () => {
    const earned = deriveBadges({
      points: 120,
      validationsCount: 12,
      hasNfce: true,
      hasCapture: true,
      hasFinishedList: true,
      weeklyValidations: 5,
    });
    expect(earned).toContain('primeira_nfce');
    expect(earned).toContain('fiscal_prata');
    expect(earned).toContain('comunidade_ativa');
    expect(mergeBadges(['primeira_captura'], earned)).toContain(
      'primeira_nfce',
    );
  });
});

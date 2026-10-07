import {
  categorySpendFromCart,
  lifetimeSavings,
  monthsAgo,
  rankCheapestMarkets,
  resolveInsightMarketScope,
  savingsSince,
} from '../src/domain/homeInsights';
import type {
  CartItem,
  Market,
  PriceLog,
  Product,
  ShoppingList,
} from '../src/data/types';

describe('homeInsights', () => {
  it('soma economia de listas finalizadas', () => {
    const lists: ShoppingList[] = [
      {
        id: 1,
        name: 'A',
        marketId: 1,
        marketName: 'M',
        itemsJson: '[]',
        subtotal: 100,
        savings: 12.5,
        itemCount: 3,
        finishedAt: new Date().toISOString(),
        remoteId: null,
        updatedAt: '',
        synced: 0,
      },
      {
        id: 2,
        name: 'B',
        marketId: 1,
        marketName: 'M',
        itemsJson: '[]',
        subtotal: 50,
        savings: 7.5,
        itemCount: 2,
        finishedAt: new Date().toISOString(),
        remoteId: null,
        updatedAt: '',
        synced: 0,
      },
    ];
    expect(lifetimeSavings(lists)).toBeCloseTo(20, 1);
  });

  it('agrupa gasto por categoria no carrinho', () => {
    const products: Product[] = [
      {
        id: 10,
        name: 'Arroz',
        aliasesJson: '[]',
        category: 'Mercearia',
        remoteId: null,
        updatedAt: '',
        synced: 0,
      },
    ];
    const cart: CartItem[] = [
      {
        id: 1,
        productId: 10,
        productName: 'Arroz',
        quantity: 2,
        retailPrice: 20,
        wholesalePrice: null,
        minWholesaleQty: null,
        checkedOff: 0,
        useWholesale: 0,
        updatedAt: '',
      },
    ];
    const rows = categorySpendFromCart(cart, products);
    expect(rows[0].category).toBe('Mercearia');
    expect(rows[0].total).toBe(40);
  });

  it('savingsSince filtra por data', () => {
    const now = new Date();
    const lists: ShoppingList[] = [
      {
        id: 1,
        name: 'Recente',
        marketId: 1,
        marketName: 'M',
        itemsJson: '[]',
        subtotal: 100,
        savings: 15,
        itemCount: 2,
        finishedAt: now.toISOString(),
        remoteId: null,
        updatedAt: '',
        synced: 0,
      },
      {
        id: 2,
        name: 'Antiga',
        marketId: 1,
        marketName: 'M',
        itemsJson: '[]',
        subtotal: 80,
        savings: 40,
        itemCount: 2,
        finishedAt: monthsAgo(6, now).toISOString(),
        remoteId: null,
        updatedAt: '',
        synced: 0,
      },
    ];
    expect(savingsSince(lists, monthsAgo(3, now))).toBeCloseTo(15, 1);
  });

  it('rankCheapestMarkets conta vitórias com logs validados', () => {
    const now = new Date();
    const markets: Market[] = [
      {
        id: 1,
        name: 'Barato',
        cnpj: null,
        uf: null,
        lat: null,
        lng: null,
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
        name: 'Caro',
        cnpj: null,
        uf: null,
        lat: null,
        lng: null,
        address: null,
        avgRating: null,
        ratingsCount: 0,
        priceLevel: null,
        remoteId: null,
        updatedAt: '',
        synced: 0,
      },
    ];
    const products: Product[] = [
      {
        id: 10,
        name: 'Arroz',
        aliasesJson: '[]',
        category: 'Mercearia',
        remoteId: null,
        updatedAt: '',
        synced: 0,
      },
    ];
    const base: PriceLog = {
      id: 1,
      productId: 10,
      marketId: 1,
      retailPrice: 5,
      wholesalePrice: null,
      minWholesaleQty: null,
      source: 'nfce',
      capturedAt: now.toISOString(),
      remoteId: null,
      nfceKey: null,
      confirmScore: 2,
      rejectScore: 0,
      trustLevel: 'verified',
      lastConfirmedAt: now.toISOString(),
      contributorId: null,
      updatedAt: now.toISOString(),
      synced: 0,
    };
    const logs: PriceLog[] = [
      base,
      {...base, id: 2, marketId: 2, retailPrice: 8},
    ];
    const ranks = rankCheapestMarkets(logs, markets, products, 'week', now);
    expect(ranks[0].marketName).toBe('Barato');
    expect(ranks[0].winCount).toBe(1);
  });

  it('resolveInsightMarketScope usa favoritos parciais ou raio 25km', () => {
    const markets: Market[] = [
      {
        id: 1,
        name: 'A',
        cnpj: null,
        uf: null,
        lat: 0,
        lng: 0,
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
        name: 'B',
        cnpj: null,
        uf: null,
        lat: 0,
        lng: 0,
        address: null,
        avgRating: null,
        ratingsCount: 0,
        priceLevel: null,
        remoteId: null,
        updatedAt: '',
        synced: 0,
      },
      {
        id: 3,
        name: 'C',
        cnpj: null,
        uf: null,
        lat: 0,
        lng: 0,
        address: null,
        avgRating: null,
        ratingsCount: 0,
        priceLevel: null,
        remoteId: null,
        updatedAt: '',
        synced: 0,
      },
    ];
    const partial = resolveInsightMarketScope({
      markets,
      favoriteMarketIds: [1],
      nearbyMarketIds: [1, 2, 3],
      radiusKm: 25,
    });
    expect(partial.mode).toBe('favorites');
    expect([...partial.marketIds]).toEqual([1]);

    const allMarked = resolveInsightMarketScope({
      markets,
      favoriteMarketIds: [1, 2, 3],
      nearbyMarketIds: [1, 2, 3],
      radiusKm: 25,
    });
    expect(allMarked.mode).toBe('radius');
    expect(allMarked.marketIds.size).toBe(3);

    const none = resolveInsightMarketScope({
      markets,
      favoriteMarketIds: [],
      nearbyMarketIds: [1, 2, 3],
      radiusKm: 25,
    });
    expect(none.mode).toBe('radius');
  });
});

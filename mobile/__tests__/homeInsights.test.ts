import {
  categorySpendFromCart,
  lifetimeSavings,
} from '../src/domain/homeInsights';
import type {CartItem, Product, ShoppingList} from '../src/data/types';

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
});

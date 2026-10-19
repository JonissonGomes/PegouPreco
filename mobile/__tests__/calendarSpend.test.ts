import {buildHomeDash, calendarRange} from '../src/domain/homeDashboard';
import type {ShoppingList} from '../src/data/types';

const KEY = '1'.repeat(44);

function note(finishedAt: string, subtotal: number): ShoppingList {
  return {
    id: 1,
    name: 'Nota',
    marketId: 1,
    marketName: 'Mercado',
    itemsJson: JSON.stringify([
      {productName: 'Arroz', quantity: 1, retailPrice: subtotal},
    ]),
    subtotal,
    savings: 0,
    itemCount: 1,
    finishedAt,
    nfceKey: KEY,
    remoteId: null,
    updatedAt: finishedAt,
    synced: 1,
  };
}

describe('calendarRange', () => {
  it('limita o mês civil e ignora nota de outro mês', () => {
    const range = calendarRange(new Date(2026, 8, 10), 'month');
    expect(new Date(range.start).getMonth()).toBe(8);
    expect(new Date(range.end).getMonth()).toBe(9);
    const dash = buildHomeDash(
      [note('2026-09-10T12:00:00.000Z', 40), note('2026-08-10T12:00:00.000Z', 90)],
      [],
      30,
      null,
      [],
      [],
      Date.parse('2026-10-18T12:00:00.000Z'),
      range,
    );
    expect(dash.spent).toBe(40);
    expect(dash.categories[0].category).toBeTruthy();
  });
});

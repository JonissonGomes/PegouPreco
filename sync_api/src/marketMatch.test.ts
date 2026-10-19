import assert from 'node:assert/strict';
import test from 'node:test';
import {rollupPlaceStats, sameStorefront} from './marketMatch.js';

test('mesmo CNPJ é a mesma loja mesmo com nome diferente', () => {
  assert.equal(
    sameStorefront(
      {name: 'Loja 109', lat: -8.1, lng: -34.9, cnpj: '12.345.678/0001-90'},
      {name: 'Assaí Atacadista', lat: -8.2, lng: -34.8, cnpj: '12345678000190'},
    ),
    true,
  );
});

test('pin soma visitantes e avaliações de cadastros irmãos', () => {
  const pins = [
    {
      id: 'a',
      name: 'Loja 109',
      lat: -8.05,
      lng: -34.9,
      avgRating: 4,
      ratingsCount: 1,
      weeklyVisitors: 1,
    },
    {
      id: 'b',
      name: 'Assaí Atacadista Imbiribeira',
      lat: -8.051,
      lng: -34.901,
      avgRating: 5,
      ratingsCount: 1,
      weeklyVisitors: 1,
    },
  ];
  const visitors = new Map<string, Set<string>>([
    ['a', new Set(['user-1'])],
    ['b', new Set(['user-2'])],
  ]);
  rollupPlaceStats(pins, visitors);
  assert.equal(pins[0].weeklyVisitors, 2);
  assert.equal(pins[1].weeklyVisitors, 2);
  assert.equal(pins[0].ratingsCount, 2);
  assert.equal(pins[1].avgRating, 4.5);
});

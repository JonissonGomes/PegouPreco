import {lineSavings, lineTotal} from '@/domain/pricing';
import {clearAllTables, getState, nextId, saveState} from '../db';
import {prefs} from '../repositories';
import type {CartItem, Market, PriceLog, Product, ShoppingList} from '../types';

type CatalogItem = {
  name: string;
  category: string;
  retail: number;
  wholesale: number | null;
  minQty: number | null;
};

const CATALOG: CatalogItem[] = [
  {name: 'Picanha bovina Maturatta 1,2 kg', category: 'Açougue', retail: 89.9, wholesale: 84.9, minQty: 3},
  {name: 'Cerveja Spaten 350ml c/12', category: 'Bebidas', retail: 47.9, wholesale: 42.9, minQty: 2},
  {name: 'Arroz Tipo 1 Camil 5kg', category: 'Mercearia', retail: 24.9, wholesale: 21.9, minQty: 3},
  {name: 'Feijão Carioca Kicaldo 1kg', category: 'Mercearia', retail: 8.49, wholesale: 7.49, minQty: 5},
  {name: 'Leite Integral Italac 1L c/12', category: 'Laticínios', retail: 58.8, wholesale: 54.9, minQty: 2},
  {name: 'Óleo de Soja Liza 900ml', category: 'Mercearia', retail: 6.99, wholesale: 5.99, minQty: 6},
  {name: 'Café Pilão Tradicional 500g', category: 'Mercearia', retail: 18.9, wholesale: 16.9, minQty: 3},
  {name: 'Açúcar Cristal União 1kg', category: 'Mercearia', retail: 4.79, wholesale: 4.29, minQty: 6},
  {name: 'Papel Higiênico Neve 12un', category: 'Limpeza', retail: 22.9, wholesale: 19.9, minQty: 2},
  {name: 'Detergente Ypê Clear 500ml', category: 'Limpeza', retail: 2.49, wholesale: 1.99, minQty: 10},
  {name: 'Salg Pippos Churrasco 75G', category: 'Snacks', retail: 5.49, wholesale: 4.99, minQty: 3},
  {name: 'Whisky Ballantines Finest 750ml', category: 'Bebidas', retail: 89.9, wholesale: 79.9, minQty: 2},
  {name: 'Queijo Mussarela Fatiado 500g', category: 'Frios', retail: 32.9, wholesale: 29.9, minQty: 2},
  {name: 'Presunto Seara 200g', category: 'Frios', retail: 9.9, wholesale: 8.9, minQty: 3},
  {name: 'Banana Prata kg', category: 'Hortifruti', retail: 5.99, wholesale: null, minQty: null},
  {name: 'Tomate Carmem kg', category: 'Hortifruti', retail: 7.49, wholesale: null, minQty: null},
  {name: 'Batata Inglesa kg', category: 'Hortifruti', retail: 4.99, wholesale: null, minQty: null},
  {name: 'Refrigerante Coca-Cola 2L', category: 'Bebidas', retail: 10.99, wholesale: 9.49, minQty: 4},
  {name: 'Água Mineral Crystal 1,5L c/6', category: 'Bebidas', retail: 14.9, wholesale: 12.9, minQty: 2},
  {name: 'Biscoito Cream Cracker 400g', category: 'Mercearia', retail: 8.9, wholesale: 7.5, minQty: 3},
];

const MARKETS = [
  {name: 'Atacadão Cruz de Rebouças', cnpj: '75315333000109', uf: 'PE', lat: -8.0284, lng: -34.9352, address: 'Av. Dr. José Rufino, Recife - PE', avgRating: 4.3, ratingsCount: 128, priceLevel: 'low'},
  {name: 'Carrefour Dourados', cnpj: '45543915045218', uf: 'PE', lat: -8.0476, lng: -34.877, address: 'Av. Mal. Mascarenhas de Morais, Recife - PE', avgRating: 4.0, ratingsCount: 86, priceLevel: 'fair'},
  {name: "Sam's Club Recife", cnpj: '00776574006711', uf: 'PE', lat: -8.1121, lng: -34.9148, address: 'Av. Eng. Domingos Ferreira, Recife - PE', avgRating: 4.5, ratingsCount: 210, priceLevel: 'fair'},
  {name: 'Assaí Atacadista Imbiribeira', cnpj: '06057223014855', uf: 'PE', lat: -8.1015, lng: -34.9255, address: 'Av. Marechal Mascarenhas, Recife - PE', avgRating: 3.9, ratingsCount: 64, priceLevel: 'low'},
  {name: 'Extra Bompreço Boa Viagem', cnpj: '47508411030266', uf: 'PE', lat: -8.1198, lng: -34.9012, address: 'Av. Conselheiro Aguiar, Recife - PE', avgRating: 3.7, ratingsCount: 41, priceLevel: 'high'},
  {name: 'Mercado da Esquina', cnpj: null as string | null, uf: 'PE', lat: -8.055, lng: -34.885, address: 'Rua da Aurora, Recife - PE', avgRating: 4.1, ratingsCount: 19, priceLevel: 'fair'},
];

function mulberry32(a: number) {
  return () => {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function runDemoSeed() {
  clearAllTables();
  const now = new Date();
  const rnd = mulberry32(42);
  const nowIso = now.toISOString();
  const st = getState();

  const markets: Market[] = MARKETS.map(m => ({
    id: nextId('markets'),
    name: m.name,
    cnpj: m.cnpj,
    uf: m.uf,
    lat: m.lat,
    lng: m.lng,
    address: m.address,
    avgRating: m.avgRating,
    ratingsCount: m.ratingsCount,
    priceLevel: m.priceLevel,
    remoteId: null,
    updatedAt: nowIso,
    synced: 0,
  }));
  st.markets.push(...markets);

  const products: Product[] = CATALOG.map(c => ({
    id: nextId('products'),
    name: c.name,
    aliasesJson: '[]',
    category: c.category,
    remoteId: null,
    updatedAt: nowIso,
    synced: 0,
  }));
  st.products.push(...products);

  for (let i = 0; i < products.length; i++) {
    const c = CATALOG[i];
    for (let d = 0; d < 5; d++) {
      const market = markets[Math.floor(rnd() * markets.length)];
      const drift = 1 + (rnd() * 0.18 - 0.06);
      const retail = Number((c.retail * drift).toFixed(2));
      const wholesale =
        c.wholesale == null ? null : Number((c.wholesale * drift).toFixed(2));
      const at = new Date(now.getTime() - (3 + d * 7) * 86400000).toISOString();
      const log: PriceLog = {
        id: nextId('price_logs'),
        productId: products[i].id,
        marketId: market.id,
        retailPrice: retail,
        wholesalePrice: wholesale,
        minWholesaleQty: c.minQty,
        source: d === 0 ? 'label' : 'manual',
        capturedAt: at,
        remoteId: null,
        nfceKey: null,
        confirmScore: d === 0 ? 4 : 1,
        rejectScore: 0,
        trustLevel: d === 0 ? 'verified' : 'suspect',
        lastConfirmedAt:
          d === 0 ? new Date(now.getTime() - 86400000).toISOString() : null,
        contributorId: 'seed_demo',
        updatedAt: at,
        synced: 0,
      };
      st.price_logs.push(log);
    }
    const currentAt = new Date(now.getTime() - 6 * 3600000).toISOString();
    st.price_logs.push({
      id: nextId('price_logs'),
      productId: products[i].id,
      marketId: markets[0].id,
      retailPrice: c.retail,
      wholesalePrice: c.wholesale,
      minWholesaleQty: c.minQty,
      source: 'label',
      capturedAt: currentAt,
      remoteId: null,
      nfceKey: null,
      confirmScore: 5,
      rejectScore: 0,
      trustLevel: 'verified',
      lastConfirmedAt: new Date(now.getTime() - 2 * 3600000).toISOString(),
      contributorId: 'seed_demo',
      updatedAt: currentAt,
      synced: 0,
    });
  }

  const cartIndexes = [0, 1, 2, 4, 6, 10, 11, 12];
  for (const idx of cartIndexes) {
    const item: CartItem = {
      id: nextId('cart_items'),
      productId: products[idx].id,
      productName: CATALOG[idx].name,
      quantity: idx === 0 ? 1.2 : idx === 1 ? 2 : 1,
      retailPrice: CATALOG[idx].retail,
      wholesalePrice: CATALOG[idx].wholesale,
      minWholesaleQty: CATALOG[idx].minQty,
      checkedOff: idx === 1 ? 1 : 0,
      updatedAt: nowIso,
    };
    st.cart_items.push(item);
  }

  const finished = [
    {name: 'Churrasco de domingo', marketIdx: 0, indexes: [0, 1, 11, 12, 13, 17], daysAgo: 14},
    {name: 'Compras da semana', marketIdx: 1, indexes: [2, 3, 4, 5, 6, 7, 8, 9], daysAgo: 7},
    {name: 'Feira rápida', marketIdx: 3, indexes: [14, 15, 16, 18], daysAgo: 3},
  ];
  for (const f of finished) {
    const items = f.indexes.map(i => ({
      productId: products[i].id,
      productName: CATALOG[i].name,
      quantity: 1,
      retailPrice: CATALOG[i].retail,
      wholesalePrice: CATALOG[i].wholesale,
      minWholesaleQty: CATALOG[i].minQty,
    }));
    let subtotal = 0;
    let savings = 0;
    for (const it of items) {
      subtotal += lineTotal(it);
      savings += lineSavings(it);
    }
    const finishedAt = new Date(
      now.getTime() - f.daysAgo * 86400000,
    ).toISOString();
    const list: ShoppingList = {
      id: nextId('shopping_lists'),
      name: f.name,
      marketId: markets[f.marketIdx].id,
      marketName: markets[f.marketIdx].name,
      itemsJson: JSON.stringify(items),
      subtotal,
      savings,
      itemCount: items.length,
      finishedAt,
      remoteId: null,
      updatedAt: finishedAt,
      synced: 0,
    };
    st.shopping_lists.push(list);
  }

  prefs.setOnboardingDone(true);
  prefs.setActiveList('Compras de hoje', markets[0].id);
  prefs.setCurrentMarketId(markets[0].id);
  saveState();
}

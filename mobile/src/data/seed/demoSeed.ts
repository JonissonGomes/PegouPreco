import {lineSavings, lineTotal} from '@/domain/pricing';
import {
  clearAllTables,
  getState,
  metaGet,
  metaSet,
  nextId,
  saveState,
} from '../db';
import {prefs} from '../repositories';
import type {CartItem, Market, PriceLog, Product, ShoppingList} from '../types';
import {SEED_MARKET_POINTS} from './marketPoints';

type CatalogItem = {
  name: string;
  category: string;
  retail: number;
  wholesale: number | null;
  minQty: number | null;
};

const CATALOG: CatalogItem[] = [
  {name: 'Picanha bovina Maturatta 1,2 kg', category: 'Açougue', retail: 89.9, wholesale: 84.9, minQty: 3},
  {name: 'Peito de frango kg', category: 'Açougue', retail: 18.9, wholesale: 16.9, minQty: 5},
  {name: 'Cerveja Spaten 350ml c/12', category: 'Bebidas', retail: 47.9, wholesale: 42.9, minQty: 2},
  {name: 'Whisky Ballantines Finest 750ml', category: 'Bebidas', retail: 89.9, wholesale: 79.9, minQty: 2},
  {name: 'Refrigerante Coca-Cola 2L', category: 'Bebidas', retail: 10.99, wholesale: 9.49, minQty: 4},
  {name: 'Água Mineral Crystal 1,5L c/6', category: 'Bebidas', retail: 14.9, wholesale: 12.9, minQty: 2},
  {name: 'Suco Del Valle Laranja 1L', category: 'Bebidas', retail: 8.49, wholesale: 7.49, minQty: 6},
  {name: 'Arroz Tipo 1 Camil 5kg', category: 'Mercearia', retail: 24.9, wholesale: 21.9, minQty: 3},
  {name: 'Feijão Carioca Kicaldo 1kg', category: 'Mercearia', retail: 8.49, wholesale: 7.49, minQty: 5},
  {name: 'Óleo de Soja Liza 900ml', category: 'Mercearia', retail: 6.99, wholesale: 5.99, minQty: 6},
  {name: 'Café Pilão Tradicional 500g', category: 'Mercearia', retail: 18.9, wholesale: 16.9, minQty: 3},
  {name: 'Açúcar Cristal União 1kg', category: 'Mercearia', retail: 4.79, wholesale: 4.29, minQty: 6},
  {name: 'Biscoito Cream Cracker 400g', category: 'Mercearia', retail: 8.9, wholesale: 7.5, minQty: 3},
  {name: 'Macarrão Espaguete Galo 500g', category: 'Mercearia', retail: 4.29, wholesale: 3.79, minQty: 10},
  {name: 'Molho de tomate Elefante 340g', category: 'Mercearia', retail: 3.49, wholesale: 2.99, minQty: 12},
  {name: 'Leite Integral Italac 1L c/12', category: 'Laticínios', retail: 58.8, wholesale: 54.9, minQty: 2},
  {name: 'Iogurte Nestlé Natural 170g', category: 'Laticínios', retail: 2.79, wholesale: 2.49, minQty: 12},
  {name: 'Margarina Qualy 500g', category: 'Laticínios', retail: 9.9, wholesale: 8.9, minQty: 4},
  {name: 'Queijo Mussarela Fatiado 500g', category: 'Frios', retail: 32.9, wholesale: 29.9, minQty: 2},
  {name: 'Presunto Seara 200g', category: 'Frios', retail: 9.9, wholesale: 8.9, minQty: 3},
  {name: 'Banana Prata kg', category: 'Hortifruti', retail: 5.99, wholesale: null, minQty: null},
  {name: 'Tomate Carmem kg', category: 'Hortifruti', retail: 7.49, wholesale: null, minQty: null},
  {name: 'Batata Inglesa kg', category: 'Hortifruti', retail: 4.99, wholesale: null, minQty: null},
  {name: 'Pão francês un', category: 'Padaria', retail: 0.89, wholesale: null, minQty: null},
  {name: 'Pão de forma Wickbold 500g', category: 'Padaria', retail: 11.9, wholesale: 10.9, minQty: 2},
  {name: 'Papel Higiênico Neve 12un', category: 'Limpeza', retail: 22.9, wholesale: 19.9, minQty: 2},
  {name: 'Detergente Ypê Clear 500ml', category: 'Limpeza', retail: 2.49, wholesale: 1.99, minQty: 10},
  {name: 'Salg Pippos Churrasco 75G', category: 'Snacks', retail: 5.49, wholesale: 4.99, minQty: 3},
  {name: 'Shampoo Clear 400ml', category: 'Higiene', retail: 19.9, wholesale: 17.9, minQty: 2},
  {name: 'Sabonete Dove 90g', category: 'Higiene', retail: 3.99, wholesale: 3.49, minQty: 6},
  {name: 'Pizza Sadia 460g', category: 'Congelados', retail: 14.9, wholesale: 12.9, minQty: 3},
  {name: 'Ração Golden Special 1kg', category: 'Pet', retail: 24.9, wholesale: 22.9, minQty: 2},
];

function mulberry32(a: number) {
  return () => {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function marketDriftFactor(marketIdx: number, productIdx: number): number {
  const base = 1 + marketIdx * 0.011;
  const wobble = ((productIdx * 7 + marketIdx * 3) % 11) * 0.004 - 0.02;
  return base + wobble;
}

export function runDemoSeed() {
  clearAllTables();
  const now = new Date();
  const rnd = mulberry32(42);
  const nowIso = now.toISOString();
  const st = getState();

  const markets: Market[] = SEED_MARKET_POINTS.map(m => ({
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
    for (let mi = 0; mi < markets.length; mi++) {
      const drift = marketDriftFactor(mi, i);
      const retail = Number((c.retail * drift).toFixed(2));
      const wholesale =
        c.wholesale == null
          ? null
          : Number((c.wholesale * drift).toFixed(2));
      const hoursAgo = 2 + Math.floor(rnd() * 48);
      const at = new Date(now.getTime() - hoursAgo * 3600000).toISOString();
      const log: PriceLog = {
        id: nextId('price_logs'),
        productId: products[i].id,
        marketId: markets[mi].id,
        retailPrice: retail,
        wholesalePrice: wholesale,
        minWholesaleQty: c.minQty,
        source: mi % 2 === 0 ? 'label' : 'manual',
        capturedAt: at,
        remoteId: null,
        nfceKey: null,
        confirmScore: 3 + (mi % 3),
        rejectScore: 0,
        trustLevel: 'verified',
        lastConfirmedAt: new Date(now.getTime() - 3600000).toISOString(),
        contributorId: 'demo_community',
        updatedAt: at,
        synced: 0,
      };
      st.price_logs.push(log);
    }

    for (let d = 0; d < 3; d++) {
      const market = markets[Math.floor(rnd() * markets.length)];
      const drift = 1 + (rnd() * 0.22 - 0.08);
      const retail = Number((c.retail * drift).toFixed(2));
      const at = new Date(now.getTime() - (21 + d * 14) * 86400000).toISOString();
      st.price_logs.push({
        id: nextId('price_logs'),
        productId: products[i].id,
        marketId: market.id,
        retailPrice: retail,
        wholesalePrice:
          c.wholesale == null
            ? null
            : Number((c.wholesale * drift).toFixed(2)),
        minWholesaleQty: c.minQty,
        source: 'manual',
        capturedAt: at,
        remoteId: null,
        nfceKey: null,
        confirmScore: d === 0 ? 2 : 1,
        rejectScore: 0,
        trustLevel: d === 0 ? 'suspect' : 'suspect',
        lastConfirmedAt: null,
        contributorId: 'seed_history',
        updatedAt: at,
        synced: 0,
      });
    }
  }

  const cartIndexes = [0, 1, 6, 7, 8, 15, 18, 20, 25, 28];
  for (const idx of cartIndexes) {
    const qty =
      idx === 0 ? 1.2 : idx === 1 ? 2.5 : idx === 6 ? 2 : idx === 23 ? 10 : 1;
    const wholesale = CATALOG[idx].wholesale;
    const minQty = CATALOG[idx].minQty;
    const item: CartItem = {
      id: nextId('cart_items'),
      productId: products[idx].id,
      productName: CATALOG[idx].name,
      quantity: qty,
      retailPrice: CATALOG[idx].retail,
      wholesalePrice: wholesale,
      minWholesaleQty: minQty,
      checkedOff: idx % 3 === 0 ? 1 : 0,
      useWholesale:
        wholesale != null && minQty != null && qty >= minQty ? 1 : 0,
      updatedAt: nowIso,
    };
    st.cart_items.push(item);
  }

  const finished = [
    {name: 'Churrasco de domingo', marketIdx: 0, indexes: [0, 2, 18, 19, 27, 6], daysAgo: 14},
    {name: 'Compras da semana', marketIdx: 1, indexes: [7, 8, 9, 10, 11, 15, 25, 26], daysAgo: 7},
    {name: 'Feira rápida', marketIdx: 3, indexes: [20, 21, 22, 23, 24], daysAgo: 3},
    {name: 'Pet + congelados', marketIdx: 5, indexes: [30, 31, 28, 16], daysAgo: 21},
  ];
  for (const f of finished) {
    const items = f.indexes.map(i => {
      const qty = i === 0 ? 1.2 : i === 23 ? 8 : 1;
      return {
        productId: products[i].id,
        productName: CATALOG[i].name,
        quantity: qty,
        retailPrice: CATALOG[i].retail,
        wholesalePrice: CATALOG[i].wholesale,
        minWholesaleQty: CATALOG[i].minQty,
        useWholesale:
          CATALOG[i].wholesale != null &&
          CATALOG[i].minQty != null &&
          qty >= (CATALOG[i].minQty ?? 0)
            ? 1
            : 0,
      };
    });
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
  prefs.setLocationPrefs({
    city: 'Recife',
    neighborhood: 'Boa Viagem',
    favoriteMarketIds: markets.slice(0, 3).map(m => m.id),
  });
  const bv = markets[2] ?? markets[0];
  prefs.setLastLocation(bv.lat, bv.lng);
  metaSet('seedApplied', 'true');
  saveState();
}

/** Remove dados do seed (mercados, preços, carrinho, listas). Mantém auth/onboarding. */
export function clearDemoSeed() {
  const auth = metaGet('authSession');
  const onboarding = metaGet('onboardingDone');
  clearAllTables();
  if (auth) metaSet('authSession', auth);
  if (onboarding) metaSet('onboardingDone', onboarding);
  metaSet('activeListName', '');
  metaSet('activeMarketId', '');
  metaSet('currentMarketId', '');
  metaSet('seedApplied', 'false');
  saveState();
}

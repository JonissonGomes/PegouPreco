import {getState, metaGet, metaSet, saveState} from './db';

/** Nomes do antigo seed demo (RMR). Só estes saem; mercados da API (remoteId) ficam. */
const SEED_MARKET_NAMES = [
  'Atacadão Cruz de Rebouças',
  'Atacadão Olinda',
  'Atacadão Jaboatão',
  'Novo Atacarejo Imbiribeira',
  'Novo Atacarejo Boa Viagem',
  'Novo Atacarejo Olinda',
  'Carrefour Dourados',
  "Sam's Club Recife",
  'Assaí Atacadista Imbiribeira',
  'Assaí Atacadista Olinda',
  'Assaí Atacadista Paulista',
  'Extra Bompreço Boa Viagem',
  'Mix Mateus Imbiribeira',
  'Mix Mateus Olinda',
  'Mix Mateus Jaboatão',
  'Mix Mateus Paulista',
  'Mix Mateus Cabo',
  'Mercado da Esquina',
];

function norm(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

const SEED_NAME_SET = new Set(SEED_MARKET_NAMES.map(norm));

function isSeedContributor(id: string | null | undefined): boolean {
  const c = id ?? '';
  return c.startsWith('seed') || c === 'demo_community';
}

/** Remove mercados, preços e listas criados pelo seed local. Idempotente. */
export function purgeSeedData() {
  const st = getState();
  const seedMarketIds = new Set(
    st.markets
      .filter(m => !m.remoteId && SEED_NAME_SET.has(norm(m.name)))
      .map(m => m.id),
  );

  const removedLogIds = new Set<number>();
  st.price_logs = st.price_logs.filter(log => {
    const drop =
      isSeedContributor(log.contributorId) ||
      (log.marketId != null &&
        seedMarketIds.has(log.marketId) &&
        !log.remoteId);
    if (drop) removedLogIds.add(log.id);
    return !drop;
  });

  st.markets = st.markets.filter(m => !seedMarketIds.has(m.id));
  st.market_reviews = st.market_reviews.filter(
    r => !seedMarketIds.has(Number(r.marketId)),
  );
  st.shopping_lists = st.shopping_lists.filter(
    l => l.marketId == null || !seedMarketIds.has(l.marketId),
  );

  const liveProductIds = new Set(st.price_logs.map(l => l.productId));
  for (const item of st.cart_items) liveProductIds.add(item.productId);
  st.products = st.products.filter(
    p => p.remoteId != null || liveProductIds.has(p.id),
  );
  const productIds = new Set(st.products.map(p => p.id));
  st.cart_items = st.cart_items.filter(i => productIds.has(i.productId));

  const activeMarket = Number(metaGet('activeMarketId') || '');
  if (seedMarketIds.has(activeMarket)) {
    metaSet('activeListName', '');
    metaSet('activeMarketId', '');
  }
  const current = Number(metaGet('currentMarketId') || '');
  if (seedMarketIds.has(current)) metaSet('currentMarketId', '');

  const favRaw = metaGet('prefFavoriteMarketIds');
  if (favRaw) {
    try {
      const ids = JSON.parse(favRaw) as number[];
      if (Array.isArray(ids)) {
        metaSet(
          'prefFavoriteMarketIds',
          JSON.stringify(ids.filter(id => !seedMarketIds.has(Number(id)))),
        );
      }
    } catch {
      /* prefs inválidos */
    }
  }

  metaSet('seedApplied', 'false');
  saveState();
}

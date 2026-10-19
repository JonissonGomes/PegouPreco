import type {CartItem, Market, PriceLog, TrustLevel} from '@/data/types';
import {isFiscalLog} from '@/domain/fiscal';
import {effectiveUnitPrice} from '@/domain/pricing';

export type BasketCompareItem = {
  productId: number;
  productName: string;
  quantity: number;
};

export type MarketBasketRank = {
  marketId: number;
  marketName: string;
  total: number;
  coveredItems: number;
  totalItems: number;
  coverage: number;
  missingNames: string[];
};

const COMMUNITY_TRUST: TrustLevel[] = ['verified'];

/** Preços elegíveis ao comparador comunitário. */
export function isCommunityPrice(log: PriceLog, now = new Date()): boolean {
  // Logs internos seed_* ficam fora; demo usa contributorId demo_community
  if ((log.contributorId ?? '').startsWith('seed')) return false;
  if (log.trustLevel === 'hidden' || !isFiscalLog(log)) return false;
  const t = new Date(log.capturedAt).getTime();
  if (!Number.isFinite(t)) return false;
  return (now.getTime() - t) / 86400000 <= 7;
}

export function cartToBasket(cart: CartItem[]): BasketCompareItem[] {
  return cart.map(c => ({
    productId: c.productId,
    productName: c.productName,
    quantity: c.quantity,
  }));
}

/**
 * Ranking local (offline) usando só logs comunitários.
 * API `/compare/basket` é a fonte preferida quando online.
 */
export function rankMarketsForBasket(
  basket: BasketCompareItem[],
  markets: Market[],
  logs: PriceLog[],
  opts?: {favoriteIds?: number[]; minCoverage?: number},
): MarketBasketRank[] {
  const fav = new Set(opts?.favoriteIds ?? []);
  const minCov = opts?.minCoverage ?? 0.34;
  const pool = markets.filter(m => fav.size === 0 || fav.has(m.id));
  const community = logs.filter(l => isCommunityPrice(l));

  const ranks: MarketBasketRank[] = [];
  for (const market of pool) {
    let total = 0;
    let covered = 0;
    const missing: string[] = [];
    for (const item of basket) {
      const candidates = community
        .filter(
          l => l.productId === item.productId && l.marketId === market.id,
        )
        .sort(
          (a, b) =>
            new Date(b.capturedAt).getTime() - new Date(a.capturedAt).getTime(),
        );
      const best = candidates[0];
      if (!best) {
        missing.push(item.productName);
        continue;
      }
      const unit = effectiveUnitPrice({
        quantity: item.quantity,
        retailPrice: best.retailPrice,
        wholesalePrice: best.wholesalePrice,
        minWholesaleQty: best.minWholesaleQty,
      });
      total += unit * item.quantity;
      covered += 1;
    }
    const coverage = basket.length ? covered / basket.length : 0;
    if (coverage < minCov && covered === 0) continue;
    ranks.push({
      marketId: market.id,
      marketName: market.name,
      total,
      coveredItems: covered,
      totalItems: basket.length,
      coverage,
      missingNames: missing,
    });
  }

  ranks.sort((a, b) => {
    if (b.coverage !== a.coverage) return b.coverage - a.coverage;
    return a.total - b.total;
  });
  return ranks;
}

export function communityTrustOk(level: TrustLevel): boolean {
  return COMMUNITY_TRUST.includes(level);
}

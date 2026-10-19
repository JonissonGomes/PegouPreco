import type {PriceLog, ShoppingList} from '@/data/types';

export function isFiscalList(list: Pick<ShoppingList, 'nfceKey'>): boolean {
  return typeof list.nfceKey === 'string' && list.nfceKey.length >= 40;
}

/** Compra que entra nos totais. A chave da nota pode ter ficado só no aparelho. */
export function hasSpend(list: Pick<ShoppingList, 'nfceKey' | 'subtotal'>): boolean {
  return isFiscalList(list) || Number(list.subtotal) > 0;
}

export function isFiscalLog(log: Pick<PriceLog, 'source' | 'nfceKey'>): boolean {
  return log.source === 'nfce' && typeof log.nfceKey === 'string' && log.nfceKey.length >= 40;
}

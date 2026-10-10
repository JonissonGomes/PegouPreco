import type {NfceParseResult} from './remote/nfceParser';
import {extractAccessKey} from '@/domain/nfceScan';
import {
  marketRepo,
  prefs,
  priceLogRepo,
  productRepo,
  shoppingListRepo,
} from '@/store/appStore';

export type ArchiveOutcome =
  | {ok: true; itemCount: number; marketName: string; finishedAt: string}
  | {ok: false; reason: 'empty' | 'duplicate'};

/** Grava a NFC-e como compra já feita, sem mexer no carrinho aberto. */
export function archiveNfcePurchase(
  parsed: NfceParseResult,
  qrUrl: string,
): ArchiveOutcome {
  if (!parsed.items.length) return {ok: false, reason: 'empty'};
  const nfceKey = extractAccessKey(qrUrl);
  if (nfceKey && priceLogRepo.hasNfceKey(nfceKey)) {
    return {ok: false, reason: 'duplicate'};
  }

  const market = parsed.marketName
    ? marketRepo.resolveOrCreate(parsed.marketName, parsed.marketCnpj)
    : null;
  const finishedAt = parsed.issuedAt ?? new Date().toISOString();
  const contributorId = prefs.getLocalUserId();
  const items = parsed.items.map((it, index) => {
    const product = productRepo.resolveOrCreate(it.description);
    priceLogRepo.insert({
      productId: product.id,
      marketId: market?.id ?? null,
      retailPrice: it.unitPrice,
      wholesalePrice: null,
      minWholesaleQty: null,
      source: 'nfce',
      capturedAt: finishedAt,
      remoteId: null,
      nfceKey,
      confirmScore: 0,
      rejectScore: 0,
      trustLevel: 'suspect',
      lastConfirmedAt: null,
      contributorId,
      updatedAt: finishedAt,
      synced: 0,
    });
    return {
      id: index + 1,
      productId: product.id,
      productName: it.description,
      quantity: it.quantity,
      retailPrice: it.unitPrice,
      wholesalePrice: null,
      minWholesaleQty: null,
      checkedOff: 1,
      useWholesale: 0,
      updatedAt: finishedAt,
    };
  });

  const subtotal = items.reduce(
    (sum, it) => sum + it.quantity * it.retailPrice,
    0,
  );
  const marketName = market?.name ?? 'Nota fiscal';
  shoppingListRepo.insert({
    name: marketName,
    marketId: market?.id ?? null,
    marketName,
    itemsJson: JSON.stringify(items),
    subtotal,
    savings: 0,
    itemCount: items.length,
    finishedAt,
    remoteId: null,
    updatedAt: finishedAt,
    synced: 0,
  });

  return {ok: true, itemCount: items.length, marketName, finishedAt};
}

import type {NfceParseResult} from './remote/nfceParser';
import {fetchAndParseNfce} from './remote/sefazClient';
import {geocodeAddress, geocodeMarketNear} from './remote/geocodeMarket';
import {haversineKm, namesLikelySame} from './remote/nearbyMarkets';
import {preferAddress} from '@/domain/marketUi';
import type {Market} from '@/data/types';
import {extractAccessKey} from '@/domain/nfceScan';
import {guessCategory} from '@/domain/productCategory';
import {MAPBOX_ACCESS_TOKEN} from '@/config/env';
import {
  marketRepo,
  prefs,
  priceLogRepo,
  productRepo,
  shoppingListRepo,
} from '@/store/appStore';

export type NfceDraft = {
  qrUrl: string;
  parsed: NfceParseResult;
  subtotal: number;
};

export type ArchiveOutcome =
  | {
      ok: true;
      itemCount: number;
      marketName: string;
      marketId: number | null;
      finishedAt: string;
      placedOnMap: boolean;
      mapKnown: boolean;
    }
  | {ok: false; reason: 'empty' | 'duplicate' | 'missing'};

export async function previewPastNfce(
  qrUrl: string,
): Promise<NfceDraft | {ok: false; reason: 'empty' | 'duplicate'}> {
  const parsed = await fetchAndParseNfce(qrUrl);
  if (!parsed.items.length) return {ok: false, reason: 'empty'};
  const nfceKey = extractAccessKey(qrUrl);
  if (
    nfceKey &&
    (shoppingListRepo.byNfceKey(nfceKey) || priceLogRepo.forNfceKey(nfceKey).length > 0)
  ) {
    return {ok: false, reason: 'duplicate'};
  }
  const subtotal = parsed.items.reduce(
    (sum, it) => sum + it.quantity * it.unitPrice,
    0,
  );
  return {qrUrl, parsed, subtotal};
}

function existingPin(
  name: string,
  cnpj: string | null,
  lat: number,
  lng: number,
): Market | null {
  const digits = (cnpj ?? '').replace(/\D/g, '');
  const near = marketRepo.all().filter(market => {
    if (market.lat == null || market.lng == null) return false;
    return haversineKm({lat: market.lat, lng: market.lng}, {lat, lng}) <= 0.45;
  });
  if (digits.length >= 8) {
    const byDoc = near.find(
      market => (market.cnpj ?? '').replace(/\D/g, '') === digits,
    );
    if (byDoc) return byDoc;
  }
  return near.find(market => namesLikelySame(market.name, name)) ?? null;
}

export async function ensureMarketOnMap(
  name: string,
  cnpj: string | null,
  address: string | null,
): Promise<{
  marketId: number | null;
  marketName: string;
  placedOnMap: boolean;
  mapKnown: boolean;
}> {
  const noteAddress = address?.trim() || null;
  if (noteAddress) {
    const geo = await geocodeAddress(noteAddress, MAPBOX_ACCESS_TOKEN);
    if (geo) {
      const pin = existingPin(name, cnpj, geo.lat, geo.lng);
      const market =
        pin ??
        marketRepo.resolveOrCreateNear(name, geo.lat, geo.lng, cnpj);
      const keepPinPoint = pin?.lat != null && pin.lng != null;
      if (cnpj && !market.cnpj) market.cnpj = cnpj;
      marketRepo.upsertGeo(market.id, {
        lat: keepPinPoint ? pin!.lat! : geo.lat,
        lng: keepPinPoint ? pin!.lng! : geo.lng,
        address: preferAddress(market.address, noteAddress),
      });
      return {
        marketId: market.id,
        marketName: market.name,
        placedOnMap: true,
        mapKnown: true,
      };
    }
    const market = marketRepo.resolveOrCreate(name, cnpj);
    return {
      marketId: market.id,
      marketName: market.name,
      placedOnMap: false,
      mapKnown: false,
    };
  }
  const origin = prefs.getLastLocation();
  const existing = marketRepo
    .all()
    .find(m => m.name.toLowerCase() === name.trim().toLowerCase());
  if (
    existing?.lat != null &&
    existing.lng != null &&
    origin &&
    haversineKm(origin, {lat: existing.lat, lng: existing.lng}) <= 30
  ) {
    return {
      marketId: existing.id,
      marketName: existing.name,
      placedOnMap: false,
      mapKnown: true,
    };
  }
  if (origin) {
    const geo = await geocodeMarketNear(name, origin, MAPBOX_ACCESS_TOKEN);
    const point = geo ?? {
      lat: origin.lat,
      lng: origin.lng,
      address: null as string | null,
    };
    {
      const market = marketRepo.resolveOrCreateNear(
        name,
        point.lat,
        point.lng,
        cnpj,
      );
      marketRepo.upsertGeo(market.id, {
        lat: point.lat,
        lng: point.lng,
        address: point.address,
      });
      return {
        marketId: market.id,
        marketName: market.name,
        placedOnMap: true,
        mapKnown: true,
      };
    }
  }
  const market = marketRepo.resolveOrCreate(name, cnpj);
  return {
    marketId: market.id,
    marketName: market.name,
    placedOnMap: false,
    mapKnown: false,
  };
}

/** Grava a NFC-e como compra já feita, sem mexer no carrinho aberto. */
export async function archiveNfcePurchase(
  parsed: NfceParseResult,
  qrUrl: string,
  purchasedAt?: string,
  replaceListId?: number | null,
): Promise<ArchiveOutcome> {
  if (!parsed.items.length) return {ok: false, reason: 'empty'};
  const nfceKey = extractAccessKey(qrUrl);
  const replacing =
    replaceListId != null
      ? shoppingListRepo.all().find(list => list.id === replaceListId) ?? null
      : null;
  if (replaceListId != null && !replacing) {
    return {ok: false, reason: 'missing'};
  }
  const sameNote = nfceKey ? shoppingListRepo.byNfceKey(nfceKey) : null;
  if (sameNote && sameNote.id !== replacing?.id) {
    return {ok: false, reason: 'duplicate'};
  }

  const placed = parsed.marketName
    ? await ensureMarketOnMap(
        parsed.marketName,
        parsed.marketCnpj,
        parsed.marketAddress,
      )
    : {
        marketId: null,
        marketName: 'Nota fiscal',
        placedOnMap: false,
        mapKnown: false,
      };
  const marketId = placed.marketId;
  const finishedAt = purchasedAt ?? parsed.issuedAt ?? new Date().toISOString();
  const alreadyLogged = nfceKey ? priceLogRepo.forNfceKey(nfceKey) : [];
  if (!replacing && alreadyLogged.length) {
    const capturedAt = alreadyLogged[0].capturedAt;
    const saved = shoppingListRepo
      .all()
      .find(l => !l.nfceKey && l.finishedAt === capturedAt);
    if (saved && nfceKey) shoppingListRepo.setNfceKey(saved.id, nfceKey);
    return {ok: false, reason: 'duplicate'};
  }
  const contributorId = prefs.getLocalUserId();
  const items = parsed.items.map((it, index) => {
    const product = productRepo.resolveOrCreate(
      it.description,
      guessCategory(it.description),
    );
    if (!alreadyLogged.length) {
      priceLogRepo.insert({
        productId: product.id,
        marketId,
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
    }
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
  const marketName = placed.marketName;
  const saved = {
    name: replacing?.name || marketName,
    marketId,
    marketName,
    itemsJson: JSON.stringify(items),
    subtotal,
    savings: 0,
    itemCount: items.length,
    finishedAt,
    nfceKey,
    updatedAt: finishedAt,
  };
  if (replacing) {
    const replaced = shoppingListRepo.replaceFromNote(replacing.id, saved);
    if (!replaced) return {ok: false, reason: 'missing'};
  } else {
    shoppingListRepo.insert({
      ...saved,
      remoteId: null,
      synced: 0,
    });
  }

  return {
    ok: true,
    itemCount: items.length,
    marketName,
    marketId,
    finishedAt,
    placedOnMap: placed.placedOnMap,
    mapKnown: placed.mapKnown,
  };
}

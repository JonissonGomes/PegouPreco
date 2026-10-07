import {getState, saveState} from './db';
import {
  marketRepo,
  prefs,
  priceLogRepo,
  productRepo,
} from './repositories';
import {syncApi} from './remote/syncApi';

function nowIso() {
  return new Date().toISOString();
}

export async function runFullSync(): Promise<{ok: boolean; message: string}> {
  const raw = prefs.getAuthJson();
  if (!raw) {
    return {ok: false, message: 'Faça login para sincronizar'};
  }
  try {
    const session = JSON.parse(raw) as {
      token: string;
      emailVerified?: boolean;
    };
    if (!session.emailVerified) {
      return {
        ok: false,
        message: 'Verifique o e-mail antes de sincronizar contribuições',
      };
    }

    const since = prefs.getLastSyncAt();
    const pull = await syncApi.pullSince(session.token, since);
    applyPull(pull);

    const st = getState();
    const products = st.products
      .filter(p => !p.synced)
      .map(p => ({
        localId: p.id,
        remoteId: p.remoteId,
        name: p.name,
        aliases: [],
        category: p.category,
        updatedAt: p.updatedAt,
      }));
    const markets = st.markets
      .filter(m => !m.synced)
      .map(m => ({
        localId: m.id,
        remoteId: m.remoteId,
        name: m.name,
        cnpj: m.cnpj,
        uf: m.uf,
        lat: m.lat,
        lng: m.lng,
        address: m.address,
        priceLevel: m.priceLevel,
        updatedAt: m.updatedAt,
      }));
    const priceLogs = st.price_logs
      .filter(l => !l.synced)
      .map(l => ({
        localId: l.id,
        remoteId: l.remoteId,
        productLocalId: l.productId,
        marketLocalId: l.marketId,
        retailPrice: l.retailPrice,
        wholesalePrice: l.wholesalePrice,
        minWholesaleQty: l.minWholesaleQty,
        source: l.source,
        capturedAt: l.capturedAt,
        nfceKey: l.nfceKey,
        confirmScore: l.confirmScore,
        rejectScore: l.rejectScore,
        trustLevel: l.trustLevel,
        lastConfirmedAt: l.lastConfirmedAt,
        contributorId: l.contributorId,
        updatedAt: l.updatedAt,
      }));
    const shoppingLists = st.shopping_lists
      .filter(s => !s.synced)
      .map(s => ({
        localId: s.id,
        remoteId: s.remoteId,
        name: s.name,
        marketId: s.marketId,
        marketName: s.marketName,
        itemsJson: s.itemsJson,
        subtotal: s.subtotal,
        savings: s.savings,
        itemCount: s.itemCount,
        finishedAt: s.finishedAt,
        updatedAt: s.updatedAt,
      }));

    const pushed = (await syncApi.pushBatch(session.token, {
      products,
      markets,
      priceLogs,
      shoppingLists,
    })) as Record<string, Record<string, string>>;

    applyIdMaps(pushed);

    const loc = prefs.getLocationPrefs();
    await syncApi.putPrefs(session.token, {
      city: loc.city,
      neighborhood: loc.neighborhood,
      favoriteMarketIds: loc.favoriteMarketIds
        .map(id => st.markets.find(m => m.id === id)?.remoteId)
        .filter(Boolean) as string[],
    });

    prefs.setLastSyncAt(nowIso());
    saveState();
    return {ok: true, message: 'Sincronização concluída'};
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : 'Falha na sync',
    };
  }
}

function applyPull(pull: Record<string, unknown>) {
  const st = getState();
  const markets = (pull.markets as Array<Record<string, unknown>>) ?? [];
  for (const r of markets) {
    const name = String(r.name ?? '');
    if (!name) continue;
    let m = st.markets.find(
      x =>
        (r.id && x.remoteId === r.id) ||
        x.name.toLowerCase() === name.toLowerCase(),
    );
    if (!m) {
      m = marketRepo.resolveOrCreate(name, (r.cnpj as string) ?? null);
    }
    m.remoteId = String(r.id ?? m.remoteId);
    m.lat = r.lat != null ? Number(r.lat) : m.lat;
    m.lng = r.lng != null ? Number(r.lng) : m.lng;
    m.address = (r.address as string) ?? m.address;
    m.synced = 1;
    m.updatedAt = String(r.updatedAt ?? m.updatedAt);
  }

  const products = (pull.products as Array<Record<string, unknown>>) ?? [];
  for (const r of products) {
    const name = String(r.name ?? '');
    if (!name) continue;
    let p = st.products.find(
      x =>
        (r.id && x.remoteId === r.id) ||
        x.name.toLowerCase() === name.toLowerCase(),
    );
    if (!p) {
      p = productRepo.resolveOrCreate(name, (r.category as string) ?? null);
    }
    p.remoteId = String(r.id ?? p.remoteId);
    p.synced = 1;
    p.updatedAt = String(r.updatedAt ?? p.updatedAt);
  }

  const logs = (pull.priceLogs as Array<Record<string, unknown>>) ?? [];
  for (const r of logs) {
    const remoteId = String(r.id ?? '');
    if (!remoteId) continue;
    const existing = st.price_logs.find(l => l.remoteId === remoteId);
    if (existing) {
      existing.trustLevel =
        (r.trustLevel as typeof existing.trustLevel) ?? existing.trustLevel;
      existing.confirmScore = Number(r.confirmScore ?? existing.confirmScore);
      existing.rejectScore = Number(r.rejectScore ?? existing.rejectScore);
      existing.synced = 1;
      continue;
    }
    const product = st.products.find(p => p.remoteId === r.productId);
    const market = st.markets.find(m => m.remoteId === r.marketId);
    if (!product) continue;
    priceLogRepo.insert({
      productId: product.id,
      marketId: market?.id ?? null,
      retailPrice: Number(r.retailPrice ?? 0),
      wholesalePrice:
        r.wholesalePrice != null ? Number(r.wholesalePrice) : null,
      minWholesaleQty:
        r.minWholesaleQty != null ? Number(r.minWholesaleQty) : null,
      source: (r.source as 'label' | 'nfce' | 'manual') ?? 'manual',
      capturedAt: String(r.capturedAt ?? nowIso()),
      remoteId,
      nfceKey: (r.nfceKey as string) ?? null,
      confirmScore: Number(r.confirmScore ?? 0),
      rejectScore: Number(r.rejectScore ?? 0),
      trustLevel:
        (r.trustLevel as 'verified' | 'suspect' | 'hidden') ?? 'suspect',
      lastConfirmedAt: (r.lastConfirmedAt as string) ?? null,
      contributorId: (r.contributorId as string) ?? null,
      updatedAt: String(r.updatedAt ?? nowIso()),
      synced: 1,
    });
  }
  saveState();
}

function applyIdMaps(maps: Record<string, Record<string, string>>) {
  const st = getState();
  const productMap = maps.productIdMap ?? {};
  const marketMap = maps.marketIdMap ?? {};
  const logMap = maps.priceLogIdMap ?? {};
  const listMap = maps.shoppingListIdMap ?? {};

  for (const [localId, remoteId] of Object.entries(productMap)) {
    const p = st.products.find(x => String(x.id) === String(localId));
    if (p) {
      p.remoteId = remoteId;
      p.synced = 1;
    }
  }
  for (const [localId, remoteId] of Object.entries(marketMap)) {
    const m = st.markets.find(x => String(x.id) === String(localId));
    if (m) {
      m.remoteId = remoteId;
      m.synced = 1;
    }
  }
  for (const [localId, remoteId] of Object.entries(logMap)) {
    const l = st.price_logs.find(x => String(x.id) === String(localId));
    if (l) {
      l.remoteId = remoteId;
      l.synced = 1;
    }
  }
  for (const [localId, remoteId] of Object.entries(listMap)) {
    const s = st.shopping_lists.find(x => String(x.id) === String(localId));
    if (s) {
      s.remoteId = remoteId;
      s.synced = 1;
    }
  }
}

import {AppState, type AppStateStatus} from 'react-native';
import axios from 'axios';
import {sessionIsLive} from '@/domain/session';
import {getState, saveState} from './db';
import {
  marketRepo,
  prefs,
  priceLogRepo,
  productRepo,
  shoppingListRepo,
} from './repositories';
import {collapseLocalReceipts} from './collapseReceipts';
import {syncGeneration} from './syncGate';
import {syncApi} from './remote/syncApi';
import {apiErrorMessage} from './remote/apiError';
import {useAppStore} from '@/store/appStore';

function nowIso() {
  return new Date().toISOString();
}

function sessionVerified(session: {
  emailVerified?: boolean;
  phoneVerified?: boolean;
}): boolean {
  return !!session.emailVerified || !!session.phoneVerified;
}

let syncInFlight: Promise<{ok: boolean; message: string}> | null = null;
let lastAutoAttempt = 0;
let autoStarted = false;
const AUTO_MIN_MS = 90_000;
const categoryAsked = new Set<number>();

function categoryIsWeak(category: string | null | undefined) {
  const local = (category ?? '').trim();
  return !local || local === 'Outros' || local === 'Hortifruti';
}

/** Produto já sincronizado e ainda em Outros: tenta o JEV uma vez por abertura do app. */
function categoryRetryDue(product: {
  id: number;
  category: string | null;
}): boolean {
  if (!categoryIsWeak(product.category) || categoryAsked.has(product.id)) {
    return false;
  }
  return true;
}

/** Espera um envio em andamento e só então sobe o estado atual. */
export async function syncNow(): Promise<{ok: boolean; message: string}> {
  if (syncInFlight) await syncInFlight;
  return runFullSync(true);
}

export async function runFullSync(
  force = false,
): Promise<{ok: boolean; message: string}> {
  if (syncInFlight && !force) return syncInFlight;
  const gen = syncGeneration();
  const job = doFullSync(gen).finally(() => {
    if (syncInFlight === job) syncInFlight = null;
  });
  syncInFlight = job;
  return job;
}

async function doFullSync(
  gen: number,
): Promise<{ok: boolean; message: string}> {
  const stale = () => gen !== syncGeneration();
  const raw = prefs.getAuthJson();
  if (!raw) {
    return {ok: false, message: 'Faça login para sincronizar'};
  }
  try {
    let session = JSON.parse(raw) as {
      token: string;
      emailVerified?: boolean;
      phoneVerified?: boolean;
      email?: string;
      phone?: string | null;
      displayName?: string;
      userId?: string;
      role?: 'user' | 'admin';
      expiresAt?: string;
    };
    if (!session.token || !sessionIsLive(session.expiresAt)) {
      useAppStore.getState().setAuth(null);
      return {ok: false, message: 'Sessão encerrada. Entre de novo.'};
    }

    // Atualiza flags de verificação a partir do servidor (evita 403 por sessão antiga).
    try {
      const me = await syncApi.me(session.token);
      session = {
        ...session,
        emailVerified: !!me.emailVerified,
        phoneVerified: !!me.phoneVerified,
        displayName: String(me.displayName ?? session.displayName ?? ''),
        role: (me.role as 'user' | 'admin' | undefined) ?? session.role,
        expiresAt:
          typeof me.tokenExpiresAt === 'string'
            ? me.tokenExpiresAt
            : session.expiresAt,
      };
      prefs.setAuthJson(JSON.stringify(session));
      const current = useAppStore.getState().auth;
      if (current?.token === session.token) {
        useAppStore.setState({
          auth: {
            ...current,
            emailVerified: !!session.emailVerified,
            phoneVerified: !!session.phoneVerified,
            displayName: session.displayName || current.displayName,
            role: session.role ?? current.role,
            expiresAt: session.expiresAt ?? current.expiresAt,
          },
        });
      }
    } catch (e) {
      if (axios.isAxiosError(e) && e.response?.status === 401) {
        return {ok: false, message: 'Sessão encerrada. Entre de novo.'};
      }
    }

    if (stale()) return {ok: false, message: 'Conta trocada'};
    const since = prefs.getLastSyncAt();
    const pull = await syncApi.pullSince(session.token, since);
    if (stale()) return {ok: false, message: 'Conta trocada'};
    applyPull(pull);
    collapseLocalReceipts();
    useAppStore.getState().refresh();
    await applySharedPrefs(session.token);
    if (stale()) return {ok: false, message: 'Conta trocada'};

    if (!sessionVerified(session)) {
      if (stale()) return {ok: false, message: 'Conta trocada'};
      prefs.setLastSyncAt(nowIso());
      saveState();
      return {
        ok: true,
        message: 'Dados baixados. Confirme a conta para enviar contribuições.',
      };
    }

    const st = getState();
    const products = st.products
      .filter(p => !p.synced || categoryRetryDue(p))
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
      .filter(
        l =>
          !l.synced &&
          l.source === 'nfce' &&
          l.nfceKey != null &&
          /^\d{44}$/.test(l.nfceKey),
      )
      .map(l => ({
        localId: l.id,
        remoteId: l.remoteId,
        productLocalId: l.productId,
        productRemoteId:
          st.products.find(p => p.id === l.productId)?.remoteId ?? null,
        marketLocalId: l.marketId,
        marketRemoteId:
          st.markets.find(m => m.id === l.marketId)?.remoteId ?? null,
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
        marketRemoteId:
          st.markets.find(m => m.id === s.marketId)?.remoteId ?? null,
        marketName: s.marketName,
        itemsJson: s.itemsJson,
        subtotal: s.subtotal,
        savings: s.savings,
        itemCount: s.itemCount,
        finishedAt: s.finishedAt,
        nfceKey: s.nfceKey ?? null,
        updatedAt: s.updatedAt,
      }));

    if (stale()) return {ok: false, message: 'Conta trocada'};
    const pushed = (await syncApi.pushBatch(session.token, {
      products,
      markets,
      priceLogs,
      shoppingLists,
      deletedNfceKeys: prefs.getDeletedNfceKeys(),
      deletedPriceLogIds: prefs.getDeletedPriceLogIds(),
      deletedListIds: prefs.getDeletedListIds(),
    })) as Record<string, Record<string, string>>;

    applyIdMaps(pushed);
    for (const sent of products) {
      const saved = getState().products.find(p => p.id === sent.localId);
      if (saved && categoryIsWeak(saved.category)) categoryAsked.add(saved.id);
    }

    const loc = prefs.getLocationPrefs();
    await syncApi.putPrefs(session.token, {
      city: loc.city,
      neighborhood: loc.neighborhood,
      favoriteMarketIds: loc.favoriteMarketIds
        .map(id => st.markets.find(m => m.id === id)?.remoteId)
        .filter(Boolean) as string[],
    });

    if (stale()) return {ok: false, message: 'Conta trocada'};
    prefs.setLastSyncAt(nowIso());
    saveState();
    return {ok: true, message: 'Sincronização concluída'};
  } catch (e) {
    return {
      ok: false,
      message: apiErrorMessage(e),
    };
  }
}

/** Dispara sync em background com debounce (rede / foreground). */
export function requestAutoSync(_reason?: string) {
  const auth = useAppStore.getState().auth;
  if (!auth?.token) return;
  const now = Date.now();
  if (
    now - lastAutoAttempt < AUTO_MIN_MS &&
    _reason !== 'login' &&
    _reason !== 'vote' &&
    _reason !== 'nfce' &&
    _reason !== 'repair'
  ) {
    return;
  }
  lastAutoAttempt = now;
  void runFullSync(_reason === 'login').then(r => {
    if (r.ok) useAppStore.getState().refresh();
  });
}

export function startAutoSync() {
  if (autoStarted) return;
  autoStarted = true;
  const repair = collapseLocalReceipts();
  if (repair) useAppStore.getState().refresh();
  requestAutoSync(repair ? 'repair' : 'boot');
  AppState.addEventListener('change', (state: AppStateStatus) => {
    if (state === 'active') requestAutoSync('foreground');
  });
  setInterval(() => requestAutoSync('interval'), 5 * 60_000);
}

function applyPull(pull: Record<string, unknown>) {
  const st = getState();
  const markets = (pull.markets as Array<Record<string, unknown>>) ?? [];
  for (const r of markets) {
    const name = String(r.name ?? '');
    if (!name) continue;
    const remoteId = String(r.id ?? '');
    let m = remoteId
      ? st.markets.find(x => x.remoteId === remoteId)
      : undefined;
    if (!m) {
      const byName = st.markets.find(
        x => x.name.toLowerCase() === name.toLowerCase() && !x.remoteId,
      );
      m = byName ?? marketRepo.create(name, (r.cnpj as string) ?? null);
    }
    if (remoteId) m.remoteId = remoteId;
    m.lat = r.lat != null ? Number(r.lat) : m.lat;
    m.lng = r.lng != null ? Number(r.lng) : m.lng;
    m.address = (r.address as string) ?? m.address;
    if (r.avgRating != null) m.avgRating = Number(r.avgRating);
    if (r.ratingsCount != null) m.ratingsCount = Number(r.ratingsCount);
    if (r.weeklyVisitors != null) m.weeklyVisitors = Number(r.weeklyVisitors);
    if (r.priceLevel != null) m.priceLevel = String(r.priceLevel);
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
    const remoteCategory = String(r.category ?? '').trim();
    const localCategory = (p.category ?? '').trim();
    const localWeak =
      !localCategory || localCategory === 'Outros' || localCategory === 'Hortifruti';
    if (
      localWeak &&
      remoteCategory &&
      remoteCategory !== 'Outros' &&
      remoteCategory !== 'Hortifruti'
    ) {
      p.category = remoteCategory;
    }
    p.synced = 1;
    p.updatedAt = String(r.updatedAt ?? p.updatedAt);
  }

  const logs = (pull.priceLogs as Array<Record<string, unknown>>) ?? [];
  for (const r of logs) {
    const remoteId = String(r.id ?? '');
    if (!remoteId) continue;
    if (prefs.getDeletedPriceLogIds().includes(remoteId)) continue;
    const nfceKey = r.nfceKey != null ? String(r.nfceKey) : '';
    if (nfceKey && prefs.getDeletedNfceKeys().includes(nfceKey)) continue;
    if (r.source != null && r.source !== 'nfce') continue;
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
    if (!product) continue;
    const market = st.markets.find(m => m.remoteId === r.marketId);
    if (
      nfceKey &&
      st.price_logs.some(
        log => log.nfceKey === nfceKey && log.productId === product.id,
      )
    ) {
      continue;
    }
    priceLogRepo.insert({
      productId: product.id,
      marketId: market?.id ?? null,
      retailPrice: Number(r.retailPrice ?? 0),
      wholesalePrice:
        r.wholesalePrice != null ? Number(r.wholesalePrice) : null,
      minWholesaleQty:
        r.minWholesaleQty != null ? Number(r.minWholesaleQty) : null,
      source: (r.source as 'label' | 'nfce' | 'manual') ?? 'nfce',
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

  const lists = (pull.shoppingLists as Array<Record<string, unknown>>) ?? [];
  for (const r of lists) {
    const remoteId = String(r.id ?? '');
    if (!remoteId) continue;
    if (prefs.getDeletedListIds().includes(remoteId)) continue;
    const nfceKey = r.nfceKey != null ? String(r.nfceKey) : '';
    if (nfceKey && prefs.getDeletedNfceKeys().includes(nfceKey)) continue;
    const existing = st.shopping_lists.find(
      list =>
        list.remoteId === remoteId ||
        (nfceKey.length >= 40 && list.nfceKey === nfceKey),
    );
    if (existing) {
      existing.remoteId = remoteId;
      if (nfceKey.length >= 40) existing.nfceKey = nfceKey;
      const localKey = existing.nfceKey ?? '';
      existing.synced = localKey.length >= 40 && nfceKey.length < 40 ? 0 : 1;
      continue;
    }
    const marketRemote = r.marketId != null ? String(r.marketId) : '';
    const market = marketRemote
      ? st.markets.find(m => m.remoteId === marketRemote)
      : undefined;
    const itemsJson =
      typeof r.itemsJson === 'string'
        ? r.itemsJson
        : JSON.stringify(r.itemsJson ?? []);
    shoppingListRepo.insert({
      name: String(r.name ?? 'Compra'),
      marketId: market?.id ?? null,
      marketName: (r.marketName as string) ?? market?.name ?? null,
      itemsJson,
      subtotal: Number(r.subtotal ?? 0),
      savings: Number(r.savings ?? 0),
      itemCount: Number(r.itemCount ?? 0),
      finishedAt: String(r.finishedAt ?? nowIso()),
      nfceKey: nfceKey || null,
      remoteId,
      updatedAt: String(r.updatedAt ?? nowIso()),
      synced: 1,
    });
  }
  saveState();
}

async function applySharedPrefs(token: string) {
  try {
    const remote = await syncApi.getPrefs(token);
    const local = prefs.getLocationPrefs();
    if (local.city.trim() || !String(remote.city ?? '').trim()) return;
    const favLocal = (remote.favoriteMarketIds ?? [])
      .map(rid => getState().markets.find(m => m.remoteId === rid)?.id)
      .filter((id): id is number => id != null);
    prefs.setLocationPrefs({
      city: String(remote.city),
      neighborhood: String(remote.neighborhood ?? ''),
      favoriteMarketIds: favLocal.length ? favLocal : local.favoriteMarketIds,
    });
  } catch {
    /* preferências locais seguem válidas se a rede falhar */
  }
}

function applyIdMaps(maps: Record<string, Record<string, string>>) {
  const st = getState();
  const productMap = maps.productIdMap ?? {};
  const marketMap = maps.marketIdMap ?? {};
  const logMap = maps.priceLogIdMap ?? {};
  const listMap = maps.shoppingListIdMap ?? {};

  const categoryFixes = maps.categoryFixes ?? {};
  for (const [localId, remoteId] of Object.entries(productMap)) {
    const p = st.products.find(x => String(x.id) === String(localId));
    if (p) {
      p.remoteId = remoteId;
      p.synced = 1;
    }
  }
  for (const [localId, category] of Object.entries(categoryFixes)) {
    const p = st.products.find(x => String(x.id) === String(localId));
    const local = (p?.category ?? '').trim();
    if (
      p &&
      category &&
      (!local || local === 'Outros' || local === 'Hortifruti')
    ) {
      p.category = category;
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

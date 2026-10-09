import {create} from 'zustand';
import {
  cartRepo,
  marketRepo,
  prefs,
  priceLogRepo,
  productRepo,
  shoppingListRepo,
  finalizeActiveList,
  canContribute,
} from '@/data/repositories';
import type {CartItem, Market, Product, ShoppingList} from '@/data/types';
import {purgeSeedData} from '@/data/purgeSeed';
import {initDb} from '@/data/db';
import {
  ensureStartupPermissions,
  type AppPermissionFlags,
} from '@/app/permissions';
import {sessionIsLive} from '@/domain/session';
import {bindSessionRejected} from '@/data/remote/sessionGate';

type AuthSession = {
  token: string;
  email: string;
  phone?: string | null;
  displayName: string;
  emailVerified: boolean;
  phoneVerified?: boolean;
  userId: string;
  role?: 'user' | 'admin';
  /** ISO. Depois disso o app desloga. */
  expiresAt: string;
};

type AppState = {
  ready: boolean;
  bootStatus: string;
  onboardingDone: boolean;
  bottomNavVisible: boolean;
  permissions: AppPermissionFlags;
  cart: CartItem[];
  markets: Market[];
  lists: ShoppingList[];
  products: Product[];
  activeListName: string | null;
  activeMarketId: number | null;
  currentMarketId: number | null;
  auth: AuthSession | null;
  bootstrap: () => Promise<void>;
  refresh: () => void;
  setNavVisible: (v: boolean) => void;
  completeOnboarding: () => void;
  startList: (name: string, marketId: number) => void;
  setCurrentMarket: (id: number) => void;
  finalize: () => boolean;
  /** Encerra a compra atual (itens + mercado) para começar outra. */
  cancelPurchase: () => void;
  setAuth: (session: AuthSession | null) => void;
};

export const useAppStore = create<AppState>((set, get) => ({
  ready: false,
  bootStatus: 'Carregando…',
  onboardingDone: false,
  bottomNavVisible: true,
  permissions: {location: false, camera: false},
  cart: [],
  markets: [],
  lists: [],
  products: [],
  activeListName: null,
  activeMarketId: null,
  currentMarketId: null,
  auth: null,
  bootstrap: async () => {
    set({bootStatus: 'Preparando dados…'});
    await initDb();
    purgeSeedData();

    set({bootStatus: 'Verificando permissões…'});
    const permissions = await ensureStartupPermissions();

    const raw = prefs.getAuthJson();
    const parsed = raw ? (JSON.parse(raw) as AuthSession) : null;
    const auth = parsed && sessionIsLive(parsed.expiresAt) ? parsed : null;
    if (parsed && !auth) prefs.setAuthJson(null);
    prefs.ensureActiveListConsistency();
    set({
      ready: true,
      bootStatus: 'Pronto',
      permissions,
      onboardingDone: prefs.getOnboardingDone(),
      auth,
    });
    get().refresh();
  },
  refresh: () => {
    prefs.ensureActiveListConsistency();
    set({
      cart: cartRepo.all(),
      markets: marketRepo.all(),
      lists: shoppingListRepo.all(),
      products: productRepo.all(),
      activeListName: prefs.getActiveListName(),
      activeMarketId: prefs.getActiveMarketId(),
      currentMarketId: prefs.getCurrentMarketId(),
      onboardingDone: prefs.getOnboardingDone(),
    });
  },
  setNavVisible: v => set({bottomNavVisible: v}),
  completeOnboarding: () => {
    prefs.setOnboardingDone(true);
    set({onboardingDone: true});
  },
  startList: (name, marketId) => {
    prefs.setActiveList(name, marketId);
    prefs.setCurrentMarketId(marketId);
    get().refresh();
  },
  setCurrentMarket: id => {
    prefs.setCurrentMarketId(id);
    get().refresh();
  },
  finalize: () => {
    const ok = finalizeActiveList();
    get().refresh();
    return ok;
  },
  cancelPurchase: () => {
    cartRepo.clear();
    prefs.clearActiveList();
    get().refresh();
  },
  setAuth: session => {
    prefs.setAuthJson(session ? JSON.stringify(session) : null);
    set({auth: session});
    if (session?.token) {
      // lazy — evita ciclo com syncWorker
      void import('@/data/syncWorker').then(m => m.requestAutoSync('login'));
    }
  },
}));

bindSessionRejected(() => {
  if (useAppStore.getState().auth) useAppStore.getState().setAuth(null);
});

export function useMarketName(id: number | null | undefined) {
  const markets = useAppStore(s => s.markets);
  if (id == null) return null;
  return markets.find(m => m.id === id)?.name ?? null;
}

export {
  priceLogRepo,
  productRepo,
  cartRepo,
  marketRepo,
  shoppingListRepo,
  prefs,
  canContribute,
};

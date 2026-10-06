import {create} from 'zustand';
import {
  cartRepo,
  marketRepo,
  prefs,
  priceLogRepo,
  productRepo,
  shoppingListRepo,
  finalizeActiveList,
} from '@/data/repositories';
import type {CartItem, Market, Product, ShoppingList} from '@/data/types';
import {runDemoSeed} from '@/data/seed/demoSeed';
import {SEED_DEMO} from '@/config/env';
import {initDb} from '@/data/db';

type AuthSession = {
  token: string;
  email: string;
  displayName: string;
  emailVerified: boolean;
  userId: string;
};

type AppState = {
  ready: boolean;
  onboardingDone: boolean;
  bottomNavVisible: boolean;
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
  setAuth: (session: AuthSession | null) => void;
};

export const useAppStore = create<AppState>((set, get) => ({
  ready: false,
  onboardingDone: false,
  bottomNavVisible: true,
  cart: [],
  markets: [],
  lists: [],
  products: [],
  activeListName: null,
  activeMarketId: null,
  currentMarketId: null,
  auth: null,
  bootstrap: async () => {
    await initDb();
    if (SEED_DEMO) {
      runDemoSeed();
    }
    const raw = prefs.getAuthJson();
    const auth = raw ? (JSON.parse(raw) as AuthSession) : null;
    set({
      ready: true,
      onboardingDone: prefs.getOnboardingDone(),
      auth,
    });
    get().refresh();
  },
  refresh: () => {
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
  setAuth: session => {
    prefs.setAuthJson(session ? JSON.stringify(session) : null);
    set({auth: session});
  },
}));

export function useMarketName(id: number | null | undefined) {
  const markets = useAppStore(s => s.markets);
  if (id == null) return null;
  return markets.find(m => m.id === id)?.name ?? null;
}

export {priceLogRepo, productRepo, cartRepo, marketRepo};

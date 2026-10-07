import AsyncStorage from '@react-native-async-storage/async-storage';
import type {
  CartItem,
  Market,
  MarketReview,
  PendingReceipt,
  PriceLog,
  Product,
  ShoppingList,
  UserReputation,
} from './types';

type Tables = {
  products: Product[];
  markets: Market[];
  price_logs: PriceLog[];
  cart_items: CartItem[];
  shopping_lists: ShoppingList[];
  pending_receipts: PendingReceipt[];
  market_reviews: MarketReview[];
  user_reputation: UserReputation[];
  app_meta: Record<string, string>;
};

const STORAGE_KEY = '@pegoupreco/db_v1';

const empty = (): Tables => ({
  products: [],
  markets: [],
  price_logs: [],
  cart_items: [],
  shopping_lists: [],
  pending_receipts: [],
  market_reviews: [],
  user_reputation: [],
  app_meta: {},
});

let state: Tables = empty();
let seq: Record<string, number> = {
  products: 1,
  markets: 1,
  price_logs: 1,
  cart_items: 1,
  shopping_lists: 1,
  pending_receipts: 1,
  market_reviews: 1,
  user_reputation: 1,
};
let hydrated = false;

async function persist() {
  await AsyncStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({state, seq}),
  );
}

function migrateCartItems() {
  for (const c of state.cart_items) {
    const row = c as CartItem & {useWholesale?: number};
    if (row.useWholesale == null) {
      const auto =
        row.wholesalePrice != null &&
        row.minWholesaleQty != null &&
        row.quantity >= row.minWholesaleQty
          ? 1
          : 0;
      row.useWholesale = auto;
    }
  }
}

export async function initDb() {
  if (hydrated) return;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as {state: Tables; seq: typeof seq};
      state = {...empty(), ...parsed.state};
      seq = {...seq, ...parsed.seq};
      migrateCartItems();
    }
  } catch {
    state = empty();
  }
  hydrated = true;
}

export function getState() {
  return state;
}

export function nextId(table: keyof typeof seq) {
  const id = seq[table]++;
  void persist();
  return id;
}

export function saveState() {
  void persist();
}

export function clearAllTables() {
  state = empty();
  seq = {
    products: 1,
    markets: 1,
    price_logs: 1,
    cart_items: 1,
    shopping_lists: 1,
    pending_receipts: 1,
    market_reviews: 1,
    user_reputation: 1,
  };
  void persist();
}

export function metaGet(key: string): string | null {
  return state.app_meta[key] ?? null;
}

export function metaSet(key: string, value: string) {
  state.app_meta[key] = value;
  void persist();
}

/** Compat: garante init síncrono após bootstrap async. */
export function getDb() {
  return {
    state,
    persist: saveState,
  };
}

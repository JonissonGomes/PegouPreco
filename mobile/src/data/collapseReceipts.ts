import {getState, saveState} from './db';
import {prefs} from './repositories';
import type {ShoppingList} from './types';

type Row = {
  productName?: string;
  quantity?: number;
  retailPrice?: number;
};

function rowsOf(list: ShoppingList): Row[] {
  try {
    const parsed = JSON.parse(list.itemsJson) as Row[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function lineKey(name: string, price: number) {
  return `${name.trim().toLowerCase()}|${price.toFixed(2)}`;
}

function signature(list: ShoppingList) {
  const lines = rowsOf(list)
    .map(row =>
      lineKey(row.productName ?? '', Number(row.retailPrice ?? 0)) +
      `|${row.quantity ?? 1}`,
    )
    .sort();
  if (!lines.length) return `solo-${list.id}`;
  const market = (list.marketName ?? '').trim().toLowerCase();
  return `${market}|${lines.join('~')}`;
}

function noteKeyFor(
  list: ShoppingList,
  notes: Map<string, {at: Set<string>; lines: Set<string>}>,
) {
  for (const [key, note] of notes) {
    if (note.at.has(list.finishedAt)) return key;
  }
  const lines = rowsOf(list).map(row =>
    lineKey(row.productName ?? '', Number(row.retailPrice ?? 0)),
  );
  if (lines.length < 2) return null;
  for (const [key, note] of notes) {
    if (lines.every(line => note.lines.has(line))) return key;
  }
  return null;
}

/** Junta cópias da mesma compra e grava a NFC-e que já está nos preços. */
export function collapseLocalReceipts(): boolean {
  const st = getState();
  const notes = new Map<string, {at: Set<string>; lines: Set<string>}>();
  for (const log of st.price_logs) {
    const key = log.nfceKey ?? '';
    if (key.length < 40) continue;
    const name = st.products.find(p => p.id === log.productId)?.name ?? '';
    const note = notes.get(key) ?? {at: new Set<string>(), lines: new Set<string>()};
    note.at.add(log.capturedAt);
    if (name) note.lines.add(lineKey(name, log.retailPrice));
    notes.set(key, note);
  }

  const groups = new Map<string, ShoppingList[]>();
  for (const list of st.shopping_lists) {
    const sig = signature(list);
    const bucket = groups.get(sig) ?? [];
    bucket.push(list);
    groups.set(sig, bucket);
  }

  const kept: ShoppingList[] = [];
  const deleted: string[] = [];
  let changed = false;

  for (const group of groups.values()) {
    const key = group
      .map(list => list.nfceKey && list.nfceKey.length >= 40 ? list.nfceKey : noteKeyFor(list, notes))
      .find((value): value is string => !!value) ?? null;
    const linked = group.filter(list => list.remoteId);
    const pool = linked.length ? linked : group;
    const keeper = [...pool].sort((a, b) => b.subtotal - a.subtotal)[0];
    const richest = [...group].sort((a, b) => b.subtotal - a.subtotal)[0];
    if (keeper.subtotal <= 0 && richest.subtotal > 0) {
      keeper.itemsJson = richest.itemsJson;
      keeper.subtotal = richest.subtotal;
      keeper.itemCount = richest.itemCount;
      keeper.synced = 0;
      changed = true;
    }
    if (key && keeper.nfceKey !== key) {
      keeper.nfceKey = key;
      keeper.updatedAt = new Date().toISOString();
      keeper.synced = 0;
      changed = true;
    }
    kept.push(keeper);
    for (const other of group) {
      if (other.id === keeper.id) continue;
      if (other.remoteId) deleted.push(other.remoteId);
      changed = true;
    }
  }

  if (!changed) return false;
  st.shopping_lists = kept;
  for (const id of deleted) prefs.rememberDeletedList(id);
  saveState();
  return true;
}

import {guessCategory} from '@/domain/productCategory';

export type ParsedListItem = {
  name: string;
  quantity: number;
  category: string;
};

const QTY_PREFIX =
  /^(\d+(?:[.,]\d+)?)\s*(?:x|X|×)?\s+(.+)$/;

function cleanName(raw: string): string {
  return raw
    .replace(/^[-•*]\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripOptionalLead(raw: string): string {
  return raw
    .replace(/^(se der um|se der|talvez um|talvez|um|uma)\s+/i, '')
    .trim();
}

function expandParenLine(line: string): string[] {
  const match = line.match(/^(.*?)\(([^)]+)\)\s*$/);
  if (!match) return [line];
  const prefix = cleanName(match[1] ?? '');
  const parts = match[2]
    .split(/[,;/]/)
    .map(part => stripOptionalLead(cleanName(part)))
    .filter(Boolean);
  if (!parts.length) return prefix ? [prefix] : [];
  if (!prefix) return parts;
  return parts.map(part => {
    const lower = part.toLocaleLowerCase('pt-BR');
    const base = prefix.toLocaleLowerCase('pt-BR');
    if (lower.startsWith(base)) return part;
    return `${prefix} ${part}`.replace(/\s+/g, ' ').trim();
  });
}

function splitQuantity(line: string): {quantity: number; name: string} {
  const hit = line.match(QTY_PREFIX);
  if (!hit) return {quantity: 1, name: line};
  const qty = Number(String(hit[1]).replace(',', '.'));
  const name = cleanName(hit[2] ?? '');
  if (!Number.isFinite(qty) || qty <= 0 || !name) {
    return {quantity: 1, name: line};
  }
  return {quantity: qty, name};
}

function mergeItems(items: ParsedListItem[]): ParsedListItem[] {
  const byKey = new Map<string, ParsedListItem>();
  for (const item of items) {
    const key = item.name.toLocaleLowerCase('pt-BR');
    const prev = byKey.get(key);
    if (prev) {
      prev.quantity += item.quantity;
    } else {
      byKey.set(key, {...item});
    }
  }
  return [...byKey.values()];
}

/** Interpreta texto livre de lista de compras (colar / .txt). */
export function parseShoppingListText(raw: string): ParsedListItem[] {
  const lines = raw
    .split(/\r?\n/)
    .map(line => cleanName(line))
    .filter(Boolean);

  const out: ParsedListItem[] = [];
  for (const line of lines) {
    for (const piece of expandParenLine(line)) {
      const {quantity, name} = splitQuantity(piece);
      const trimmed = cleanName(name);
      if (!trimmed) continue;
      out.push({
        name: trimmed,
        quantity,
        category: guessCategory(trimmed),
      });
    }
  }
  return mergeItems(out);
}

export function summarizeParsedList(items: ParsedListItem[]) {
  const categories = new Set(items.map(item => item.category));
  return {itemCount: items.length, categoryCount: categories.size};
}

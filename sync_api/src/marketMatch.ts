import {haversineKm} from './util.js';

export function collapseMapPins(
  pins: Record<string, unknown>[],
): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  for (const pin of pins) {
    const lat = Number(pin.lat);
    const lng = Number(pin.lng);
    const name = String(pin.name ?? '');
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const dup = out.find(other => {
      const oLat = Number(other.lat);
      const oLng = Number(other.lng);
      if (!Number.isFinite(oLat) || !Number.isFinite(oLng)) return false;
      const dist = haversineKm({lat, lng}, {lat: oLat, lng: oLng});
      if (dist > 0.4) return false;
      return namesLikelySame(name, String(other.name ?? ''));
    });
    if (!dup) {
      out.push(pin);
      continue;
    }
    const dupScore =
      Number(dup.ratingsCount ?? 0) + Number(dup.weeklyVisitors ?? 0);
    const pinScore =
      Number(pin.ratingsCount ?? 0) + Number(pin.weeklyVisitors ?? 0);
    if (pinScore > dupScore || String(pin.name ?? '').length > String(dup.name ?? '').length) {
      const index = out.indexOf(dup);
      out[index] = pin;
    }
  }
  return out;
}

export function marketNameKey(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\b(ltda|s\/a|sa|supermercado|mercado|atacarejo|hipermercado)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function namesLikelySame(a: string, b: string): boolean {
  const ka = marketNameKey(a);
  const kb = marketNameKey(b);
  if (!ka || !kb) return false;
  if (ka === kb) return true;
  if (ka.includes(kb) || kb.includes(ka)) return true;
  const ta = ka.split(' ').filter(t => t.length > 2);
  const tb = new Set(kb.split(' ').filter(t => t.length > 2));
  if (!ta.length || !tb.size) return false;
  const inter = ta.filter(t => tb.has(t)).length;
  return inter / Math.min(ta.length, tb.size) >= 0.6;
}

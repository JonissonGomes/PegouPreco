export type ReportGroup = {
  key: string;
  name: string;
  reason: string;
  count: number;
  targetMarketId?: string;
  lat: number;
  lng: number;
  address?: string | null;
  cnpj?: string | null;
};

function reasonOf(row: Record<string, unknown>): string {
  if (row.reportType) return String(row.reportType);
  if (row.kind === 'confirm') return 'confirm';
  return String(row.kind ?? 'other');
}

export function groupReports(
  items: Array<Record<string, unknown>>,
): ReportGroup[] {
  const groups = new Map<string, ReportGroup>();
  for (const row of items) {
    const reason = reasonOf(row);
    const name = String(row.name ?? '').trim();
    const lat = Number(row.lat);
    const lng = Number(row.lng);
    const target = row.targetMarketId ? String(row.targetMarketId) : '';
    const place = target
      ? target
      : `${name.toLowerCase()}@${Number.isFinite(lat) ? lat.toFixed(3) : '0'},${
          Number.isFinite(lng) ? lng.toFixed(3) : '0'
        }`;
    const key = `${place}|${reason}`;
    const current = groups.get(key);
    if (current) {
      current.count += 1;
      continue;
    }
    groups.set(key, {
      key,
      name: name || 'Mercado',
      reason,
      count: 1,
      targetMarketId: target || undefined,
      lat,
      lng,
      address: (row.address as string) ?? null,
      cnpj: (row.cnpj as string) ?? null,
    });
  }
  return [...groups.values()].sort((a, b) =>
    a.name.localeCompare(b.name, 'pt-BR'),
  );
}

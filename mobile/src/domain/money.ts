export function formatBrl(value: number): string {
  return value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

export function formatQty(value: number): string {
  if (Number.isInteger(value) || value === Math.round(value)) {
    return String(Math.round(value));
  }
  return value.toFixed(2);
}

export function parseBrl(raw: string): number | null {
  let s = raw.trim();
  if (!s) return null;
  s = s.replace(/[R$\s]/g, '');
  if (s.includes(',') && s.includes('.')) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (s.includes(',')) {
    s = s.replace(',', '.');
  }
  const n = Number.parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

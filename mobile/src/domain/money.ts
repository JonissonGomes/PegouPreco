export function formatBrl(value: number): string {
  return value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

/** Valor para input (ex.: 32,90) — sem símbolo R$. */
export function formatMoneyInput(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '';
  return value.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Máscara enquanto digita: só dígitos → centavos → "32,90".
 * Aceita também colagem já formatada.
 */
export function maskMoneyTyping(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  const cents = Number.parseInt(digits, 10);
  if (!Number.isFinite(cents)) return '';
  return formatMoneyInput(cents / 100);
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

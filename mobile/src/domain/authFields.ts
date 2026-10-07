/** Utilitários de máscara e validação dos campos de autenticação (pt-BR). */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function digitsOnly(raw: string, max?: number): string {
  const d = raw.replace(/\D/g, '');
  return max != null ? d.slice(0, max) : d;
}

/** Máscara enquanto digita: (81) 99999-0000 ou (81) 3333-0000. */
export function maskPhoneBrTyping(raw: string): string {
  let d = digitsOnly(raw);
  // Colagem com +55 / 55…
  if (d.startsWith('55') && d.length > 11) d = d.slice(2);
  d = d.slice(0, 11);
  if (!d) return '';
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) {
    return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  }
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

/**
 * Normaliza para o formato da API (dígitos com país 55), alinhado ao sync_api.
 * Aceita 10/11 dígitos (DDD+número) ou já com 55.
 */
export function phoneToApi(raw: string): string | null {
  const d = digitsOnly(raw);
  if (!d) return null;
  if (d.startsWith('55') && d.length >= 12) return d.slice(0, 13);
  if (d.length === 10 || d.length === 11) return `55${d}`;
  return null;
}

export function isValidPhoneBr(raw: string): boolean {
  return phoneToApi(raw) != null;
}

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isValidEmail(raw: string): boolean {
  return EMAIL_RE.test(normalizeEmail(raw));
}

/** Só dígitos, até 6 — código de confirmação. */
export function maskOtpTyping(raw: string): string {
  return digitsOnly(raw, 6);
}

export function isValidOtp(raw: string): boolean {
  return /^\d{6}$/.test(raw.trim());
}

export function normalizeDisplayName(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim().slice(0, 60);
}

export function isValidPassword(raw: string): boolean {
  return raw.length >= 6 && raw.length <= 72;
}

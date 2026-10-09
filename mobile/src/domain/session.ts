/** Mesma janela da API: 4 dias a partir do login. */
export const SESSION_MS = 4 * 24 * 60 * 60 * 1000;

export function sessionExpiresAt(iso?: string | null): string {
  const parsed = Date.parse(String(iso ?? ''));
  if (!Number.isNaN(parsed)) return new Date(parsed).toISOString();
  return new Date(Date.now() + SESSION_MS).toISOString();
}

export function sessionIsLive(expiresAt?: string | null): boolean {
  const exp = Date.parse(String(expiresAt ?? ''));
  return !Number.isNaN(exp) && exp > Date.now();
}

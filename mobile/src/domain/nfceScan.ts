/** Chave de acesso NFC-e (44 dígitos) e URL de consulta a partir do QR ou do OCR. */

const RECEIPT_HINT =
  /nfc[\s-]*e|danfe|documento auxiliar|chave de acesso|consumidor eletr/i;

const CUF_CONSULT: Record<string, string> = {
  '26': 'https://nfce.sefaz.pe.gov.br/nfce/consulta',
};

export function isValidAccessKey(key: string): boolean {
  if (!/^\d{44}$/.test(key)) return false;
  let weight = 2;
  let sum = 0;
  for (let i = 42; i >= 0; i--) {
    sum += Number(key[i]) * weight;
    weight = weight === 9 ? 2 : weight + 1;
  }
  const mod = sum % 11;
  const dv = mod < 2 ? 0 : 11 - mod;
  return dv === Number(key[43]);
}

export function extractAccessKey(text: string): string | null {
  const grouped = text.match(/(?:\d{4}[ .\t]+){10}\d{4}/);
  if (grouped) {
    const key = grouped[0].replace(/\D/g, '');
    if (isValidAccessKey(key)) return key;
  }
  const runs = text.match(/\d{44,}/g) ?? [];
  for (const run of runs) {
    for (let i = 0; i + 44 <= run.length; i++) {
      const key = run.slice(i, i + 44);
      if (isValidAccessKey(key)) return key;
    }
  }
  return null;
}

export function looksLikeReceipt(text: string): boolean {
  return RECEIPT_HINT.test(text) || extractAccessKey(text) != null;
}

function urlFromPrintedHost(text: string, key: string): string | null {
  const host = text.match(
    /nfce\.sefaz\.[a-z]{2}\.gov\.br(?:\/[\w./-]+)?/i,
  );
  if (!host) return null;
  const path = host[0].replace(/\/$/, '');
  const base = path.includes('/') ? path : `${path}/nfce/consulta`;
  return `https://${base}?p=${key}`;
}

/** URL pronta do QR, ou consulta montada com a chave impressa. */
export function nfceConsultUrl(payload: string): string | null {
  const raw = payload.trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw) && /nfce|sefaz|chnfe/i.test(raw)) return raw;
  const key = extractAccessKey(raw);
  if (!key) return null;
  return (
    urlFromPrintedHost(raw, key) ??
    (CUF_CONSULT[key.slice(0, 2)]
      ? `${CUF_CONSULT[key.slice(0, 2)]}?p=${key}`
      : null)
  );
}

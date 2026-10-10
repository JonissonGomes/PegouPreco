/** Chave de acesso NFC-e (44 dígitos) e URL de consulta a partir do QR ou do OCR. */

const RECEIPT_HINT =
  /nfc[\s-]*e|danfe|documento auxiliar|chave de acesso|consumidor eletr/i;

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

/**
 * Pernambuco publica o QR em `www.sefaz.pe.gov.br/nfce/consulta`, que responde 404.
 * A consulta que devolve a nota é `nfce-web/consultarNFCe` na porta 444.
 * A chave impressa, sem o hash do QR, não abre a nota.
 */
export function normalizeNfceConsultUrl(raw: string): string {
  const trimmed = raw.trim().replace(/^http:\/\//i, 'https://');
  const qIndex = trimmed.indexOf('?');
  const query = qIndex >= 0 ? trimmed.slice(qIndex) : '';
  const before = (qIndex >= 0 ? trimmed.slice(0, qIndex) : trimmed).toLowerCase();
  const pe = /sefaz\.pe\.gov\.br/.test(before);
  const hasParams = /[?&](?:p|chnfe)=/i.test(query);
  if (!pe || !hasParams) return trimmed;
  const host = /nfcehomolog/.test(before)
    ? 'nfcehomolog.sefaz.pe.gov.br'
    : 'nfce.sefaz.pe.gov.br';
  return `https://${host}:444/nfce-web/consultarNFCe${query}`;
}

/** URL do QR, já no endereço que a SEFAZ responde. */
export function nfceConsultUrl(payload: string): string | null {
  const raw = payload.trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw) && /nfce|sefaz|chnfe/i.test(raw)) {
    return normalizeNfceConsultUrl(raw);
  }
  return null;
}

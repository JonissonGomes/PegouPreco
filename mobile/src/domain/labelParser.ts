import {parseBrl} from './money';

export type LabelFields = {
  productName: string | null;
  retailPrice: number | null;
  wholesalePrice: number | null;
  minWholesaleQty: number | null;
  barcode: string | null;
  rawText: string;
  confidence: Partial<
    Record<
      | 'productName'
      | 'retailPrice'
      | 'wholesalePrice'
      | 'minWholesaleQty'
      | 'barcode',
      number
    >
  >;
};

/** Preço BR: 29,50 | 1.234,56 | 29.50 */
const PRICE_NUM =
  String.raw`(\d{1,3}(?:\.\d{3})*,\d{2}|\d{1,6},\d{2}|\d{1,6}\.\d{2})`;

const barcodeRe = /\b(\d{8,14})\b/g;
const wholesaleQtyRe =
  /a\s*partir\s*de\s*0*(\d+)\s*(?:unidades?|unid\.?|un\.?)?/i;

/** Linhas/trechos que não são nome de produto. */
const noiseExact =
  /^(pre[cç]o|precos|preços|varejo|atacado|oferta|promo[cç][aã]o|economia|unid(?:ade)?|kg|r\$|a\s*unidade|cada)$/i;

const discardChunk =
  /passai|pass\s*a[ií]|cred(?:ito)?|data\s*de\s*emiss|lj\s*\d+|ofertas?\s*at[eé]|%\s*de\s*desconto|economia\s*de|pre[cç]o\s*por\.?\s*(?:unid|kg|l)|cx\s*\d+|am\s*\d+/i;

const casePackRe =
  /\b(?:CX|AM|KG)\s*\d{1,3}\s*R?\$?\s*\d{1,3}(?:\.\d{3})*,\d{2}/gi;

function normalizeRaw(rawText: string): string {
  return rawText
    .replace(/\u00a0/g, ' ')
    .replace(/[|]/g, '\n')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function linesOf(rawText: string): string[] {
  return normalizeRaw(rawText)
    .split(/[\r\n]+/)
    .map(l => l.trim())
    .filter(Boolean);
}

function isNoiseName(line: string): boolean {
  const t = line.trim();
  if (!t || t.length < 3) return true;
  if (noiseExact.test(t)) return true;
  if (discardChunk.test(t)) return true;
  if (/^\d{8,14}$/.test(t)) return true;
  if (/^R\$\s*[\d.,]+$/i.test(t)) return true;
  if (/^(de|por)\s*r\$/i.test(t)) return true;
  return false;
}

function scrubProductLine(line: string): string {
  return line
    .replace(casePackRe, ' ')
    .replace(barcodeRe, ' ')
    .replace(new RegExp(String.raw`R\$\s*${PRICE_NUM}`, 'gi'), ' ')
    .replace(new RegExp(PRICE_NUM, 'g'), ' ')
    .replace(
      /\b(?:ATACADO|VAREJO|PASSAI\s*CRED|PRE[CÇ]O\s*POR\s*(?:UNIDADE|KG|L)|A\s*PARTIR\s*DE\s*\d+\s*UNIDADES?|A\s*UNIDADE|DE|POR|CADA)\b/gi,
      ' ',
    )
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function nameScore(cleaned: string): number {
  let score = cleaned.length;
  if (/\d+\s*(?:g|kg|ml|l)\b/i.test(cleaned)) score += 45;
  if (/[A-Za-zÀ-ÿ]{3,}/.test(cleaned)) score += 15;
  if (/fps|whisky|vodka|cerveja|arroz|protetor|file|mignon/i.test(cleaned)) {
    score += 25;
  }
  if (!/[A-Za-zÀ-ÿ]{3,}/.test(cleaned)) score -= 60;
  if (/^\d/.test(cleaned) && cleaned.length < 8) score -= 20;
  return score;
}

function pickProductName(lines: string[], full: string): string | null {
  let best: string | null = null;
  let bestScore = -9999;
  for (const line of lines) {
    const cleaned = scrubProductLine(line);
    if (isNoiseName(cleaned)) continue;
    const score = nameScore(cleaned);
    if (score > bestScore) {
      bestScore = score;
      best = cleaned;
    }
  }
  if (best) return best;

  // Fallback: primeiro trecho alfabético do texto inteiro
  const flat = scrubProductLine(full.replace(/[\r\n]+/g, ' '));
  const m = flat.match(/[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9 .%\-&/]{4,80}/);
  return m ? m[0].trim() : null;
}

function pickBarcode(text: string): string | null {
  const hits = [...text.matchAll(barcodeRe)].map(m => m[1]);
  // Prefer EAN-13
  const ean13 = hits.find(h => h.length === 13);
  if (ean13) return ean13;
  return hits.find(h => h.length >= 8) ?? null;
}

function priceAfterLabel(text: string, labelRe: RegExp): number | null {
  // Aceita "VAREJO R$ 32,90" e "Atacado a partir de 2 R$ 42,90"
  const re = new RegExp(
    `${labelRe.source}(?:(?!\\b(?:varejo|atacado|passai)\\b)[\\s\\S]){0,48}?${PRICE_NUM}`,
    'i',
  );
  const m = text.match(re);
  if (!m) return null;
  return parseBrl(m[1]);
}

/** Remove trechos de embalagem/caixa (CX12 354,00) do texto de preços. */
function stripDiscardPrices(text: string): string {
  return text
    .replace(casePackRe, ' ')
    .replace(
      /(?:passai|pass\s*a[ií])\s*cred(?:ito)?\s*(?:R\$)?\s*[\d.,]+/gi,
      ' ',
    )
    .replace(/\bDE\s*R\$\s*[\d.,]+/gi, ' '); // preço "de" em promoção
}

function pickPromoPor(text: string): number | null {
  const m = text.match(
    new RegExp(String.raw`\bPOR\s*R\$\s*${PRICE_NUM}(?:\s*CADA)?`, 'i'),
  );
  return m ? parseBrl(m[1]) : null;
}

function pickUnitPrice(text: string): number | null {
  // "Preço Por Unidade" / "Preco Por KG" seguido do valor grande
  const labeled = text.match(
    new RegExp(
      String.raw`pre[cç]o\s*por\s*(?:unidade|unid\.?|kg|l)\s*(?:R\$)?\s*${PRICE_NUM}`,
      'i',
    ),
  );
  if (labeled) return parseBrl(labeled[1]);

  // R$ grande logo após o rótulo em linha seguinte (OCR comum)
  const split = text.match(
    /pre[cç]o\s*por\s*(?:unidade|unid\.?|kg|l)[\s\S]{0,40}?R\$\s*([\d.,]+)/i,
  );
  if (split) return parseBrl(split[1]);
  return null;
}

function pickMinQty(text: string): number | null {
  const m = text.match(wholesaleQtyRe);
  if (!m) return null;
  const n = Number.parseInt(m[1], 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function allPrices(text: string): number[] {
  const re = new RegExp(PRICE_NUM, 'g');
  const out: number[] = [];
  for (const m of text.matchAll(re)) {
    const v = parseBrl(m[1]);
    if (v != null && v > 0 && v < 100000) out.push(v);
  }
  return out;
}

/**
 * Heurísticas para etiquetas BR (Assaí atacado/varejo, preço único, promo DE/POR).
 *
 * Captura: nome, preço varejo, preço atacado, qtd mín. atacado, EAN (se houver).
 * Descarta: Passaí Cred, totais CX/AM/KG, preço "DE" de promoção, datas/LJ.
 */
export function parseLabel(rawText: string): LabelFields | null {
  const full = normalizeRaw(rawText);
  if (!full) return null;
  const lines = linesOf(full);
  const cleaned = stripDiscardPrices(full);

  let retail = priceAfterLabel(cleaned, /varejo/);
  let wholesale = priceAfterLabel(cleaned, /atacado/);

  // Mini-bloco "Atacado: 85,90 / Varejo: 85,90"
  if (retail == null) {
    retail = priceAfterLabel(cleaned, /varejo\s*:/);
  }
  if (wholesale == null) {
    wholesale = priceAfterLabel(cleaned, /atacado\s*:/);
  }

  const promoPor = pickPromoPor(full);
  const unitPrice = pickUnitPrice(cleaned);

  if (retail == null && promoPor != null) retail = promoPor;
  if (retail == null && unitPrice != null) retail = unitPrice;

  // Etiqueta só com um preço grande (sem atacado/varejo)
  if (retail == null && wholesale == null) {
    const prices = allPrices(cleaned);
    if (prices.length === 1) {
      retail = prices[0];
    } else if (prices.length >= 2) {
      // Sem rótulos: maior costuma ser varejo, menor atacado — mas evita
      // pegar total de caixa já removido. Usa os dois mais frequentes/centrais.
      const sorted = [...new Set(prices)].sort((a, b) => a - b);
      // Prefer valores "de gôndola" (< 500) se houver
      const shelf = sorted.filter(p => p < 500);
      const pool = shelf.length ? shelf : sorted;
      retail = pool[pool.length - 1];
      if (pool.length >= 2) wholesale = pool[0];
    }
  }

  // Se só achou atacado rotulado, varejo pode ser unitPrice ou promo
  if (retail == null && wholesale != null) {
    retail = unitPrice ?? promoPor ?? wholesale;
  }

  if (retail == null && wholesale == null) return null;

  // Se varejo == atacado (carne kg etc.), mantém os dois iguais
  if (wholesale != null && retail != null && wholesale > retail) {
    // OCR invertido: troca
    const tmp = retail;
    retail = wholesale;
    wholesale = tmp;
  }

  const minQty = wholesale != null ? pickMinQty(full) : null;
  const productName = pickProductName(lines, full);
  const barcode = pickBarcode(full);

  return {
    productName,
    retailPrice: retail,
    wholesalePrice: wholesale,
    minWholesaleQty: minQty,
    barcode,
    rawText,
    confidence: {
      productName: productName ? 0.8 : 0.3,
      retailPrice: retail != null ? 0.9 : 0,
      wholesalePrice: wholesale != null ? 0.85 : 0,
      minWholesaleQty: minQty != null ? 0.8 : 0,
      barcode: barcode ? 0.9 : 0,
    },
  };
}

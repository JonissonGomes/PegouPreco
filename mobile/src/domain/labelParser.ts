import {parseBrl} from './money';

export type LabelFields = {
  productName: string | null;
  retailPrice: number | null;
  wholesalePrice: number | null;
  minWholesaleQty: number | null;
  rawText: string;
  confidence: Partial<
    Record<'productName' | 'retailPrice' | 'wholesalePrice' | 'minWholesaleQty', number>
  >;
};

const priceRe =
  /(?:R\$\s*)?(\d{1,3}(?:[.\s]\d{3})*,\d{2}|\d+,\d{2}|\d+\.\d{2})/gi;
const wholesaleQtyRe =
  /(?:a\s*partir\s*de|acima\s*de|mín(?:imo)?\.?|apartir|atacado)\s*[:\s]*(\d+(?:[.,]\d+)?)\s*(?:un|kg|g|l)?/i;
const noiseExact =
  /^(preço|precos|preços|varejo|atacado|oferta|promoção|promocao|economia|unid|kg|r\$)$/i;
const noisePartial =
  /pre[cç]os?\s*por\s*unidade|por\s*unidade\s*em|unidade\s*em\s*\(?\s*r\s*\$|pre[cç]o\s*unit[aá]rio|valor\s*unit[aá]rio|economia\s*de|pre[cç]o\s*de\s*varejo|pre[cç]o\s*de\s*atacado/i;
const productHint =
  /[A-Za-zÀ-ÿ].*\d+\s*(?:g|kg|ml|l|un|unid)\b|\d+\s*(?:g|kg|ml|l)\b|[A-Za-zÀ-ÿ]{3,}/i;

function isNoise(line: string): boolean {
  const t = line.trim();
  if (!t) return true;
  if (noiseExact.test(t)) return true;
  if (noisePartial.test(t)) return true;
  return false;
}

function nameScore(cleaned: string): number {
  let score = cleaned.length;
  if (productHint.test(cleaned)) score += 20;
  if (/\d+\s*(?:g|kg|ml|l)\b/i.test(cleaned)) score += 40;
  if (!/[A-Za-zÀ-ÿ]{3,}/.test(cleaned)) score -= 50;
  return score;
}

/** Heurísticas de etiqueta de gôndola → campos mapeados. */
export function parseLabel(rawText: string): LabelFields | null {
  const lines = rawText
    .split(/[\r\n]+/)
    .map(l => l.trim())
    .filter(Boolean);
  if (!lines.length) return null;

  const prices: number[] = [];
  for (const line of lines) {
    for (const m of line.matchAll(priceRe)) {
      const v = parseBrl(m[1]);
      if (v != null && v > 0) prices.push(v);
    }
  }
  if (!prices.length) return null;

  let minQty: number | null = null;
  for (const line of lines) {
    const m = line.match(wholesaleQtyRe);
    if (m) {
      minQty = Number.parseFloat(m[1].replace(',', '.'));
      break;
    }
  }

  let name: string | null = null;
  let bestScore = -9999;
  for (const line of lines) {
    const cleaned = line.replace(priceRe, '').trim();
    if (cleaned.length < 3 || isNoise(cleaned)) continue;
    const score = nameScore(cleaned);
    if (score > bestScore) {
      bestScore = score;
      name = cleaned;
    }
  }
  if (!name) {
    name =
      lines.find(l => !isNoise(l.replace(priceRe, '').trim())) ?? lines[0];
  }

  const distinct = [...new Set(prices)].sort((a, b) => a - b);
  const retail = distinct[distinct.length - 1];
  const wholesale = distinct.length >= 2 ? distinct[0] : null;

  return {
    productName: name,
    retailPrice: retail,
    wholesalePrice: wholesale,
    minWholesaleQty: minQty,
    rawText,
    confidence: {
      productName: bestScore > 20 ? 0.85 : 0.55,
      retailPrice: 0.9,
      wholesalePrice: wholesale != null ? 0.75 : 0,
      minWholesaleQty: minQty != null ? 0.7 : 0,
    },
  };
}

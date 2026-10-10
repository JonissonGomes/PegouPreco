import {parseBrl} from '@/domain/money';

export type NfceItem = {
  description: string;
  quantity: number;
  unitPrice: number;
};

export type NfceParseResult = {
  marketName: string | null;
  marketCnpj: string | null;
  issuedAt: string | null;
  items: NfceItem[];
};

function issuedAtFromHtml(html: string): string | null {
  const labeled = html.match(
    /(?:emiss[aã]o|autoriza[cç][aã]o)[^0-9]{0,48}(\d{2})[./](\d{2})[./](\d{2,4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?/i,
  );
  const m =
    labeled ??
    html.match(
      /(\d{2})[./](\d{2})[./](\d{2,4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?/,
    );
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  let year = Number(m[3]);
  if (year < 100) year += 2000;
  const hour = Number(m[4] ?? 12);
  const minute = Number(m[5] ?? 0);
  const second = Number(m[6] ?? 0);
  const date = new Date(year, month - 1, day, hour, minute, second);
  if (Number.isNaN(date.getTime())) return null;
  if (date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date.toISOString();
}

/** Parser genérico de HTML NFC-e (tabelas + regex Qtd x Unit). */
export function parseNfceHtml(html: string): NfceParseResult {
  const items: NfceItem[] = [];
  const cnpjMatch = html.match(
    /(\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}|\d{14})/,
  );
  const nameMatch =
    html.match(/<[^>]+nome[^>]*>([^<]{3,80})/i) ||
    html.match(/emitente[^>]*>([^<]{3,80})/i);

  const rowRe =
    /([A-Za-zÀ-ÿ0-9][\wÀ-ÿ\s\.\-\/%]{2,80}).{0,40}?(\d+[.,]?\d*)\s*(?:UN|KG|UNID)?\s*[xX×]\s*R?\$?\s*(\d+[.,]\d{2})/gi;
  for (const m of html.matchAll(rowRe)) {
    const unit = parseBrl(m[3]);
    const qty = Number.parseFloat(m[2].replace(',', '.'));
    if (unit != null && qty > 0) {
      items.push({
        description: m[1].trim(),
        quantity: qty,
        unitPrice: unit,
      });
    }
  }

  if (!items.length) {
    const priceOnly = html.matchAll(
      /([A-Za-zÀ-ÿ][\wÀ-ÿ\s\.\-]{3,60}).{0,20}R\$\s*(\d+[.,]\d{2})/gi,
    );
    for (const m of priceOnly) {
      const unit = parseBrl(m[2]);
      if (unit != null) {
        items.push({
          description: m[1].trim(),
          quantity: 1,
          unitPrice: unit,
        });
      }
      if (items.length >= 40) break;
    }
  }

  return {
    marketName: nameMatch?.[1]?.trim() ?? null,
    marketCnpj: cnpjMatch?.[1] ?? null,
    issuedAt: issuedAtFromHtml(html),
    items,
  };
}

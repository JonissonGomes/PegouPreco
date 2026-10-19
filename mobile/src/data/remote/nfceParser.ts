import {parseBrl} from '@/domain/money';
import {friendlyEmitName} from '@/domain/marketBrand';

export type NfceItem = {
  description: string;
  quantity: number;
  unitPrice: number;
};

export type NfceParseResult = {
  marketName: string | null;
  marketCnpj: string | null;
  marketAddress: string | null;
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

function decodeXml(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .trim();
}

function xmlTag(block: string, name: string): string | null {
  const m = block.match(new RegExp(`<(?:\\w+:)?${name}>([^<]*)</`));
  return m ? decodeXml(m[1]) : null;
}

function addressFromText(html: string): string | null {
  const text = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ');
  const labeled = text.match(
    /endere[cç]o\s*[:\-]?\s*([A-Za-zÀ-ÿ0-9][^|]{12,140})/i,
  );
  if (!labeled) return null;
  const line = labeled[1].split(/consumidor|chave de acesso|protocolo/i)[0].trim();
  if (!/\d/.test(line) || !/[A-Za-zÀ-ÿ]/.test(line)) return null;
  return line.replace(/[,.\s]+$/, '').slice(0, 140);
}

function emitAddress(emit: string): string | null {
  const block =
    emit.match(/<(?:\w+:)?enderEmit[\s>][\s\S]*?<\/(?:\w+:)?enderEmit>/)?.[0] ??
    '';
  if (!block) return null;
  const street = xmlTag(block, 'xLgr');
  const number = xmlTag(block, 'nro');
  const district = xmlTag(block, 'xBairro');
  const city = xmlTag(block, 'xMun');
  const uf = xmlTag(block, 'UF');
  const cep = xmlTag(block, 'CEP');
  const line = [street, number && number !== 'S/N' ? number : null]
    .filter(Boolean)
    .join(', ');
  const place = [city, uf].filter(Boolean).join(' - ');
  const parts = [line, district, place, cep].filter(Boolean);
  return parts.length >= 2 ? parts.join(', ') : null;
}

const SEFAZ_ERRORS: Record<string, string> = {
  '217': 'A SEFAZ não encontrou essa nota.',
  '236': 'O QR não confere. Enquadre o código inteiro, inclusive as bordas.',
};

export function sefazErrorMessage(code: string): string {
  return SEFAZ_ERRORS[code] ?? `A SEFAZ recusou a consulta (código ${code}).`;
}

/** Resposta XML da consulta por QR (nfeProc), usada em Pernambuco. */
export function parseNfceXml(xml: string): NfceParseResult {
  const items: NfceItem[] = [];
  for (const det of xml.split(/<(?:\w+:)?det[\s>]/).slice(1)) {
    const description = xmlTag(det, 'xProd');
    const qty = Number.parseFloat(xmlTag(det, 'qCom') ?? '1');
    const unit = Number.parseFloat(xmlTag(det, 'vUnCom') ?? '');
    if (!description || !Number.isFinite(unit) || unit <= 0 || !(qty > 0)) {
      continue;
    }
    items.push({description, quantity: qty, unitPrice: unit});
  }
  const emit = xml.split(/<(?:\w+:)?dest[\s>]/)[0] ?? xml;
  const issued = xmlTag(xml, 'dhEmi');
  const issuedDate = issued ? new Date(issued) : null;
  return {
    marketName: friendlyEmitName(xmlTag(emit, 'xFant'), xmlTag(emit, 'xNome')),
    marketCnpj: xmlTag(emit, 'CNPJ'),
    marketAddress: emitAddress(emit),
    issuedAt:
      issuedDate && !Number.isNaN(issuedDate.getTime())
        ? issuedDate.toISOString()
        : null,
    items,
  };
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
    marketAddress: emitAddress(html) ?? addressFromText(html),
    issuedAt: issuedAtFromHtml(html),
    items,
  };
}

import axios from 'axios';
import {normalizeNfceConsultUrl} from '@/domain/nfceScan';
import {
  parseNfceHtml,
  parseNfceXml,
  sefazErrorMessage,
  type NfceParseResult,
} from './nfceParser';

async function readBody(url: string): Promise<string> {
  const res = await axios.get<string>(url, {
    timeout: 25000,
    responseType: 'text',
    maxRedirects: 5,
    headers: {
      Accept: 'application/xml,text/xml,text/html,*/*',
      'User-Agent':
        'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile',
    },
  });
  return typeof res.data === 'string' ? res.data : String(res.data);
}

export async function fetchAndParseNfce(qrUrl: string): Promise<NfceParseResult> {
  const url = normalizeNfceConsultUrl(qrUrl);
  let body: string;
  try {
    body = await readBody(url);
  } catch (error) {
    const fallback = url.replace(':444', '');
    const network = axios.isAxiosError(error) && !error.response;
    if (network && fallback !== url) {
      body = await readBody(fallback);
    } else if (axios.isAxiosError(error) && error.response?.status === 404) {
      throw new Error(
        'A SEFAZ não encontrou essa consulta. Leia o QR do rodapé da nota.',
      );
    } else if (network) {
      throw new Error(
        'Sem resposta da SEFAZ. Confira a internet e enquadre o QR de novo.',
      );
    } else {
      throw error;
    }
  }

  const err = body.match(/<(?:\w+:)?erro>(\d+)<\/(?:\w+:)?erro>/);
  if (err && err[1] !== '0') throw new Error(sefazErrorMessage(err[1]));
  if (/captcha/i.test(body) && !body.includes('<det')) {
    throw new Error(
      'A consulta pediu verificação. Use o QR do rodapé, não só a chave impressa.',
    );
  }
  if (body.includes('<nfeProc') || body.includes('<NFe')) return parseNfceXml(body);
  return parseNfceHtml(body);
}

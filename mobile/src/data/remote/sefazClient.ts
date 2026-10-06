import axios from 'axios';
import {parseNfceHtml, type NfceParseResult} from './nfceParser';

export async function fetchAndParseNfce(qrUrl: string): Promise<NfceParseResult> {
  const res = await axios.get<string>(qrUrl, {
    timeout: 25000,
    responseType: 'text',
    headers: {
      'User-Agent': 'PegouPreco/1.0 (React Native)',
      Accept: 'text/html',
    },
  });
  const html = typeof res.data === 'string' ? res.data : String(res.data);
  if (/captcha/i.test(html)) {
    throw new Error('Portal SEFAZ pediu CAPTCHA — use OCR ou edição manual');
  }
  return parseNfceHtml(html);
}

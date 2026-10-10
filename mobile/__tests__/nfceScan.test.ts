import {
  extractAccessKey,
  isValidAccessKey,
  looksLikeReceipt,
  nfceConsultUrl,
} from '../src/domain/nfceScan';

function withDv(base43: string): string {
  let weight = 2;
  let sum = 0;
  for (let i = 42; i >= 0; i--) {
    sum += Number(base43[i]) * weight;
    weight = weight === 9 ? 2 : weight + 1;
  }
  const mod = sum % 11;
  const dv = mod < 2 ? 0 : 11 - mod;
  return base43 + String(dv);
}

const KEY = withDv('2626102030815708510365103000000361030000809');

describe('nfceScan', () => {
  it('valida o dígito da chave', () => {
    expect(isValidAccessKey(KEY)).toBe(true);
    expect(isValidAccessKey(KEY.slice(0, 43) + '0')).toBe(KEY.endsWith('0'));
  });

  it('lê a chave impressa em blocos de 4', () => {
    const printed = KEY.replace(/(\d{4})(?=\d)/g, '$1 ');
    const text = `NFC-e\nConsulta pela Chave de Acesso em nfce.sefaz.pe.gov.br/nfce/consulta\n${printed}`;
    expect(extractAccessKey(text)).toBe(KEY);
    expect(looksLikeReceipt(text)).toBe(true);
    expect(nfceConsultUrl(text)).toBeNull();
  });

  it('troca a URL antiga de PE, que responde 404, pela consulta na porta 444', () => {
    const url = `http://www.sefaz.pe.gov.br/nfce/consulta?p=${KEY}|2|1|1|ABC`;
    expect(nfceConsultUrl(url)).toBe(
      `https://nfce.sefaz.pe.gov.br:444/nfce-web/consultarNFCe?p=${KEY}|2|1|1|ABC`,
    );
  });

  it('não trata etiqueta de gôndola como nota', () => {
    expect(looksLikeReceipt('ARROZ CAMIL 5KG\nVAREJO R$ 24,90')).toBe(false);
    expect(nfceConsultUrl('7891234567895')).toBeNull();
  });
});

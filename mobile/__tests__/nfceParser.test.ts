import {parseNfceHtml, parseNfceXml} from '../src/data/remote/nfceParser';

describe('nfceParser', () => {
  it('extrai itens de padrão Qtd x Unit', () => {
    const html = `
      <html><body>
      Emitente Nome Fantasia Mercado Bom
      CNPJ 12.345.678/0001-99
      Arroz Camil 5kg 1 UN x R$ 24,90
      Feijão Kicaldo 2 UN x R$ 8,49
      </body></html>
    `;
    const result = parseNfceHtml(html);
    expect(result.items.length).toBeGreaterThanOrEqual(1);
    expect(result.items[0].unitPrice).toBeGreaterThan(0);
  });

  it('lê o XML devolvido pelo QR de Pernambuco', () => {
    const xml = `
      <nfeProc xmlns="http://www.portalfiscal.inf.br/nfe">
        <NFe><infNFe>
          <ide><dhEmi>2026-10-10T15:32:29-03:00</dhEmi></ide>
          <emit>
            <CNPJ>20308157085103</CNPJ>
            <xNome>ATACAREJO IGARASSU</xNome>
            <enderEmit>
              <xLgr>AV NORTE</xLgr>
              <nro>100</nro>
              <xBairro>CENTRO</xBairro>
              <xMun>IGARASSU</xMun>
              <UF>PE</UF>
              <CEP>53610000</CEP>
            </enderEmit>
          </emit>
          <det nItem="1"><prod><xProd>CEBOLA ROXA KG</xProd><qCom>0.1600</qCom><vUnCom>7.98</vUnCom></prod></det>
        </infNFe></NFe>
      </nfeProc>`;
    const result = parseNfceXml(xml);
    expect(result.marketName).toBe('ATACAREJO IGARASSU');
    expect(result.marketAddress).toBe('AV NORTE, 100, CENTRO, IGARASSU - PE, 53610000');
    expect(result.items).toEqual([
      {description: 'CEBOLA ROXA KG', quantity: 0.16, unitPrice: 7.98},
    ]);
    expect(result.issuedAt).toBe(new Date('2026-10-10T15:32:29-03:00').toISOString());
  });

  it('guarda a data de emissão', () => {
    const html = 'Data de autorização: 10/10/2026 15:32:29';
    const result = parseNfceHtml(html);
    expect(result.issuedAt).toBe(new Date(2026, 9, 10, 15, 32, 29).toISOString());
  });
});

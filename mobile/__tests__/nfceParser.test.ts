import {parseNfceHtml} from '../src/data/remote/nfceParser';

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
});

import {parseLabel} from '../src/domain/labelParser';
import {effectiveUnitPrice, lineSavings} from '../src/domain/pricing';
import {parseBrl, formatBrl} from '../src/domain/money';

describe('labelParser', () => {
  it('mapeia produto, varejo, atacado e qtd mínima', () => {
    const raw = [
      'Cerveja Spaten 350ml c/12',
      'Preço varejo R$ 47,90',
      'Atacado a partir de 2 R$ 42,90',
    ].join('\n');
    const fields = parseLabel(raw);
    expect(fields).not.toBeNull();
    expect(fields!.productName?.toLowerCase()).toContain('spaten');
    expect(fields!.retailPrice).toBeCloseTo(47.9, 1);
    expect(fields!.wholesalePrice).toBeCloseTo(42.9, 1);
    expect(fields!.minWholesaleQty).toBe(2);
  });

  it('ignora ruído de cabeçalho', () => {
    const fields = parseLabel('Preço\nArroz Tipo 1 Camil 5kg\nR$ 24,90');
    expect(fields!.productName?.toLowerCase()).toContain('arroz');
    expect(fields!.retailPrice).toBeCloseTo(24.9, 1);
  });
});

describe('pricing', () => {
  it('usa atacado quando atinge cota', () => {
    expect(
      effectiveUnitPrice({
        quantity: 3,
        retailPrice: 10,
        wholesalePrice: 8,
        minWholesaleQty: 3,
      }),
    ).toBe(8);
    expect(
      lineSavings({
        quantity: 3,
        retailPrice: 10,
        wholesalePrice: 8,
        minWholesaleQty: 3,
      }),
    ).toBe(6);
  });
});

describe('money', () => {
  it('parse e format BRL', () => {
    expect(parseBrl('R$ 1.234,56')).toBeCloseTo(1234.56);
    expect(formatBrl(10)).toContain('10');
  });
});

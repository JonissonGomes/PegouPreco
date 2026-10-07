import {parseLabel} from '../src/domain/labelParser';
import {effectiveUnitPrice, lineSavings} from '../src/domain/pricing';
import {
  parseBrl,
  formatBrl,
  formatMoneyInput,
  maskMoneyTyping,
} from '../src/domain/money';

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

  it('Assaí: ATACADO + VAREJO + ignora PASSAI CRED e CX', () => {
    const raw = `
VODKA NAC ORLOFF 1L
VODKA NAC ORLOFF 1L
ATACADO R$ 29,50
A PARTIR DE 02 UNIDADES
PASSAI CRED R$ 29,50
A UNIDADE
VAREJO R$ 32,90
A UNIDADE
CX12 354,00
AM2 59,00
7891050000903
LJ 109
DATA DE EMISSAO 18-MAY-25
`;
    const f = parseLabel(raw)!;
    expect(f.productName?.toUpperCase()).toContain('ORLOFF');
    expect(f.retailPrice).toBeCloseTo(32.9, 1);
    expect(f.wholesalePrice).toBeCloseTo(29.5, 1);
    expect(f.minWholesaleQty).toBe(2);
    expect(f.barcode).toBe('7891050000903');
    // não confundir total da caixa com varejo
    expect(f.retailPrice).toBeLessThan(100);
  });

  it('preço por unidade único vira varejo', () => {
    const raw = `
WHISKY BALLANTINES BOURBON B 750ml
Preço Por Unidade
R$ 99,90
5410058
`;
    const f = parseLabel(raw)!;
    expect(f.productName?.toUpperCase()).toContain('BALLANTINES');
    expect(f.retailPrice).toBeCloseTo(99.9, 1);
    expect(f.wholesalePrice).toBeNull();
  });

  it('promo DE/POR usa o POR como varejo', () => {
    const raw = `
PROTETOR SOLAR NIVEA SUN PROTECT & TOQUE SECO FPS50 SPRAY 200ML
4005900741158
DE R$ 97,99
69% DE DESCONTO
POR R$ 29,90 CADA
Ofertas até 27/09/2026
`;
    const f = parseLabel(raw)!;
    expect(f.productName?.toUpperCase()).toContain('NIVEA');
    expect(f.retailPrice).toBeCloseTo(29.9, 1);
    expect(f.retailPrice).not.toBeCloseTo(97.99, 1);
  });

  it('etiqueta kg com Atacado/Varejo iguais', () => {
    const raw = `
CAR BOV RESF MASTERBOI FILE MIGNON kg
Preco Por KG
R$ 85,90
Atacado: 85,90
Varejo: 85,90
KG15 1288,50
`;
    const f = parseLabel(raw)!;
    expect(f.productName?.toUpperCase()).toContain('MIGNON');
    expect(f.retailPrice).toBeCloseTo(85.9, 1);
    expect(f.wholesalePrice).toBeCloseTo(85.9, 1);
    expect(f.retailPrice).not.toBeCloseTo(1288.5, 1);
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

  it('input monetário pt-BR', () => {
    expect(formatMoneyInput(32.9)).toBe('32,90');
    expect(maskMoneyTyping('3290')).toBe('32,90');
    expect(parseBrl(maskMoneyTyping('2990'))).toBeCloseTo(29.9, 1);
  });
});

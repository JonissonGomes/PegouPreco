import 'package:flutter_test/flutter_test.dart';
import 'package:pegou_preco/core/utils/levenshtein.dart';
import 'package:pegou_preco/core/utils/pricing.dart';
import 'package:pegou_preco/features/vision/parsers/label_parser.dart';

void main() {
  test('Levenshtein similarity detects close product names', () {
    expect(FuzzyMatch.similarity('Arroz Tipo 1 5kg', 'Arroz Tipo 1 5 kg'),
        greaterThan(0.8));
    expect(FuzzyMatch.similarity('Arroz', 'Feijao'), lessThan(0.5));
  });

  test('Pricing applies wholesale when qty reaches minimum', () {
    final unit = effectiveUnitPrice(
      quantity: 6,
      retailPrice: 10,
      wholesalePrice: 8,
      minWholesaleQty: 5,
    );
    expect(unit, 8);
    expect(
      lineSavings(
        quantity: 6,
        retailPrice: 10,
        wholesalePrice: 8,
        minWholesaleQty: 5,
      ),
      12,
    );
  });

  test('LabelParser extracts retail and wholesale', () {
    const text = '''
ARROZ TIPO 1 5KG
Varejo R\$ 24,90
Atacado R\$ 21,90
A partir de 3 un
''';
    final item = LabelParser.parse(text);
    expect(item, isNotNull);
    expect(item!.description.toUpperCase(), contains('ARROZ'));
    expect(item.unitPrice, 24.90);
    expect(item.wholesalePrice, 21.90);
    expect(item.minWholesaleQty, 3);
  });

  test('LabelParser prefers product name over unit-price header', () {
    const text = '''
Preços por unidade em (R\$)
Salg Pippos Churrasco 75G
R\$ 5,49
R\$ 4,99
A partir de 3 un
''';
    final item = LabelParser.parse(text);
    expect(item, isNotNull);
    expect(item!.description.toLowerCase(), contains('pippos'));
    expect(item.description.toLowerCase(), isNot(contains('unidade')));
    expect(item.unitPrice, 5.49);
    expect(item.wholesalePrice, 4.99);
    expect(item.minWholesaleQty, 3);
  });

  test('LabelParser leaves minWholesaleQty null when not detected', () {
    const text = '''
Biscoito Cream Cracker 400G
Varejo R\$ 8,90
Atacado R\$ 7,50
''';
    final item = LabelParser.parse(text);
    expect(item, isNotNull);
    expect(item!.wholesalePrice, 7.50);
    expect(item.minWholesaleQty, isNull);
  });
}

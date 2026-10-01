import 'package:flutter_test/flutter_test.dart';
import 'package:pegou_preco/features/vision/parsers/nfce_html_parser.dart';

void main() {
  test('NfceHtmlParser lê linhas Qtd x Unit = Total', () {
    const html = '''
<html><body>
<table>
<tr><td>Descricao</td><td>Qtde</td><td>Unit</td><td>Total</td></tr>
<tr><td>FEIJAO CARIOCA 1KG</td><td>2</td><td>x</td><td>8,50</td><td>=</td><td>17,00</td></tr>
</table>
<p>FEIJAO CARIOCA 1KG 2 x 8,50 = 17,00</p>
<p>CNPJ: 12.345.678/0001-90</p>
<p>Chave 35240112345678000190550010000000011000000010</p>
</body></html>
''';
    final result = NfceHtmlParser.parse(html);
    expect(result.items, isNotEmpty);
    expect(result.marketCnpj, '12345678000190');
    expect(result.nfceKey?.length, 44);
    expect(
      result.items.any((i) => i.description.toUpperCase().contains('FEIJAO')),
      isTrue,
    );
  });
}

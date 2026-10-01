import 'package:html/dom.dart';
import 'package:html/parser.dart' as html_parser;
import 'package:pegou_preco/core/utils/money.dart';
import 'package:pegou_preco/features/vision/models/review_item.dart';

class NfceParseResult {
  NfceParseResult({
    required this.items,
    this.marketName,
    this.marketCnpj,
    this.nfceKey,
  });

  final List<ReviewItem> items;
  final String? marketName;
  final String? marketCnpj;
  final String? nfceKey;
}

/// Parser genérico + heurísticas para HTML de consulta NFC-e (UF piloto).
class NfceHtmlParser {
  static NfceParseResult parse(String html, {String? sourceUrl}) {
    final doc = html_parser.parse(html);
    final text = doc.body?.text ?? '';

    final nfceKey = _extractKey(text) ?? _extractKeyFromUrl(sourceUrl);
    final marketName = _extractMarketName(doc, text);
    final marketCnpj = _extractCnpj(text);

    var items = _parseTableRows(doc);
    if (items.isEmpty) {
      items = _parseTextLines(text);
    }

    return NfceParseResult(
      items: items,
      marketName: marketName,
      marketCnpj: marketCnpj,
      nfceKey: nfceKey,
    );
  }

  static String? _extractKey(String text) {
    final compact = text.replaceAll(RegExp(r'\s+'), '');
    // Prefere sequência de 44 dígitos isolada (chave de acesso NFC-e).
    final matches = RegExp(r'(\d{44})').allMatches(compact).toList();
    if (matches.isEmpty) return null;
    // Se houver várias, escolhe a que não é só concatenação óbvia de CNPJ curto.
    return matches.last.group(1);
  }

  static String? _extractKeyFromUrl(String? url) {
    if (url == null) return null;
    final m = RegExp(r'(\d{44})').firstMatch(url.replaceAll('%7C', '|'));
    return m?.group(1);
  }

  static String? _extractCnpj(String text) {
    final m = RegExp(
      r'CNPJ[:\s]*([\d./-]{14,18})',
      caseSensitive: false,
    ).firstMatch(text);
    return m?.group(1)?.replaceAll(RegExp(r'\D'), '');
  }

  static String? _extractMarketName(Document doc, String text) {
    final title = doc.querySelector('title')?.text.trim();
    if (title != null &&
        title.isNotEmpty &&
        title.length > 3 &&
        !title.toLowerCase().contains('nfc')) {
      return title;
    }
    final m = RegExp(
      r'(?:Nome|Razão Social|Emitente)[:\s]+([^\n]{5,80})',
      caseSensitive: false,
    ).firstMatch(text);
    return m?.group(1)?.trim();
  }

  static List<ReviewItem> _parseTableRows(Document doc) {
    final items = <ReviewItem>[];
    final rows = doc.querySelectorAll('tr');
    for (final row in rows) {
      final cells = <String>[];
      for (final c in row.querySelectorAll('td')) {
        final t = c.text.trim();
        if (t.isNotEmpty) cells.add(t);
      }
      if (cells.length < 3) continue;
      final joined = cells.join(' | ');
      final parsed = _parseItemLine(joined) ?? _parseFromCells(cells);
      if (parsed != null) items.add(parsed);
    }
    return items;
  }

  static List<ReviewItem> _parseTextLines(String text) {
    final items = <ReviewItem>[];
    for (final line in text.split(RegExp(r'[\r\n]+'))) {
      final item = _parseItemLine(line.trim());
      if (item != null) items.add(item);
    }
    return items;
  }

  /// Padrão: Descrição Qtd x Unit = Total
  static final _lineRe = RegExp(
    r'^(.+?)\s+(\d+(?:[.,]\d+)?)\s*(?:un|unid|kg|g|l|lt|pc)?\s*[xX×]\s*'
    r'(?:R\$\s*)?(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2}|\d+\.\d{2})\s*=?\s*'
    r'(?:R\$\s*)?(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2}|\d+\.\d{2})?',
  );

  static ReviewItem? _parseItemLine(String line) {
    final m = _lineRe.firstMatch(line);
    if (m == null) return null;
    final desc = m.group(1)!.trim();
    if (desc.length < 2) return null;
    final qty = double.tryParse(m.group(2)!.replaceAll(',', '.')) ?? 1;
    final unit = parseBrl(m.group(3)!) ?? 0;
    final total = m.group(4) != null ? parseBrl(m.group(4)!) : null;
    if (unit <= 0) return null;
    return ReviewItem(
      description: desc,
      quantity: qty,
      unitPrice: unit,
      lineTotal: total,
    );
  }

  static ReviewItem? _parseFromCells(List<String> cells) {
    // Heurística: última célula com preço = total ou unitário; penúltima qtd.
    final prices = <double>[];
    for (final c in cells) {
      final p = parseBrl(c);
      if (p != null) prices.add(p);
    }
    if (prices.isEmpty) return null;
    final desc = cells.firstWhere(
      (c) => parseBrl(c) == null && c.length > 2,
      orElse: () => cells.first,
    );
    if (RegExp(r'total|qtde|descri', caseSensitive: false).hasMatch(desc)) {
      return null;
    }
    double qty = 1;
    for (final c in cells) {
      final q = double.tryParse(c.replaceAll(',', '.'));
      if (q != null && q > 0 && q < 10000 && parseBrl(c) == null) {
        qty = q;
        break;
      }
    }
    return ReviewItem(
      description: desc,
      quantity: qty,
      unitPrice: prices.length >= 2 ? prices[prices.length - 2] : prices.last,
      lineTotal: prices.last,
    );
  }
}

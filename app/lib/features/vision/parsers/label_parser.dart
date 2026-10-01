import 'package:pegou_preco/core/utils/money.dart';
import 'package:pegou_preco/features/vision/models/review_item.dart';

/// Heurísticas para etiquetas de gôndola (varejo / atacado / qtd mínima).
class LabelParser {
  static final _priceRe = RegExp(
    r'(?:R\$\s*)?(\d{1,3}(?:[.\s]\d{3})*,\d{2}|\d+,\d{2}|\d+\.\d{2})',
    caseSensitive: false,
  );
  static final _wholesaleQtyRe = RegExp(
    r'(?:a\s*partir\s*de|acima\s*de|mín(?:imo)?\.?|apartir|atacado)\s*[:\s]*(\d+(?:[.,]\d+)?)\s*(?:un|kg|g|l)?',
    caseSensitive: false,
  );
  static final _noise = RegExp(
    r'^(preço|varejo|atacado|oferta|promoção|economia|unid|kg|r\$)$',
    caseSensitive: false,
  );

  static ReviewItem? parse(String rawText) {
    final lines = rawText
        .split(RegExp(r'[\r\n]+'))
        .map((l) => l.trim())
        .where((l) => l.isNotEmpty)
        .toList();
    if (lines.isEmpty) return null;

    final prices = <double>[];
    for (final line in lines) {
      for (final m in _priceRe.allMatches(line)) {
        final v = parseBrl(m.group(1)!);
        if (v != null && v > 0) prices.add(v);
      }
    }
    if (prices.isEmpty) return null;

    double? minQty;
    for (final line in lines) {
      final m = _wholesaleQtyRe.firstMatch(line);
      if (m != null) {
        minQty = double.tryParse(m.group(1)!.replaceAll(',', '.'));
        break;
      }
    }

    // Nome: maior linha sem preço dominante e sem ruído.
    String? name;
    var bestLen = 0;
    for (final line in lines) {
      final cleaned = line.replaceAll(_priceRe, '').trim();
      if (cleaned.length < 3) continue;
      if (_noise.hasMatch(cleaned)) continue;
      if (cleaned.length > bestLen) {
        bestLen = cleaned.length;
        name = cleaned;
      }
    }
    name ??= lines.first;

    // Heurística: menor preço = atacado se houver 2+ preços distintos.
    final distinct = prices.toSet().toList()..sort();
    final retail = distinct.last;
    final wholesale = distinct.length >= 2 ? distinct.first : null;

    return ReviewItem(
      description: name,
      quantity: 1,
      unitPrice: retail,
      wholesalePrice: wholesale,
      minWholesaleQty: wholesale != null ? (minQty ?? 3) : minQty,
    );
  }
}

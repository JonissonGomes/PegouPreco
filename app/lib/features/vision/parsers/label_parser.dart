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
  static final _noiseExact = RegExp(
    r'^(preço|precos|preços|varejo|atacado|oferta|promoção|promocao|economia|unid|kg|r\$)$',
    caseSensitive: false,
  );
  static final _noisePartial = RegExp(
    r'pre[cç]os?\s*por\s*unidade|por\s*unidade\s*em|unidade\s*em\s*\(?\s*r\s*\$|'
    r'pre[cç]o\s*unit[aá]rio|valor\s*unit[aá]rio|economia\s*de|'
    r'pre[cç]o\s*de\s*varejo|pre[cç]o\s*de\s*atacado',
    caseSensitive: false,
  );
  static final _productHint = RegExp(
    r'[A-Za-zÀ-ÿ].*\d+\s*(?:g|kg|ml|l|un|unid)\b|'
    r'\d+\s*(?:g|kg|ml|l)\b|'
    r'[A-Za-zÀ-ÿ]{3,}',
    caseSensitive: false,
  );

  static bool _isNoise(String line) {
    final t = line.trim();
    if (t.isEmpty) return true;
    if (_noiseExact.hasMatch(t)) return true;
    if (_noisePartial.hasMatch(t)) return true;
    return false;
  }

  static int _nameScore(String cleaned) {
    var score = cleaned.length;
    if (_productHint.hasMatch(cleaned)) score += 20;
    if (RegExp(r'\d+\s*(?:g|kg|ml|l)\b', caseSensitive: false)
        .hasMatch(cleaned)) {
      score += 40;
    }
    // Penaliza linhas só com símbolos / preços residuais.
    if (!RegExp(r'[A-Za-zÀ-ÿ]{3,}').hasMatch(cleaned)) score -= 50;
    return score;
  }

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

    String? name;
    var bestScore = -9999;
    for (final line in lines) {
      final cleaned = line.replaceAll(_priceRe, '').trim();
      if (cleaned.length < 3) continue;
      if (_isNoise(cleaned)) continue;
      final score = _nameScore(cleaned);
      if (score > bestScore) {
        bestScore = score;
        name = cleaned;
      }
    }
    name ??= lines.firstWhere(
      (l) => !_isNoise(l.replaceAll(_priceRe, '').trim()),
      orElse: () => lines.first,
    );

    // Heurística: menor preço = atacado se houver 2+ preços distintos.
    final distinct = prices.toSet().toList()..sort();
    final retail = distinct.last;
    final wholesale = distinct.length >= 2 ? distinct.first : null;

    return ReviewItem(
      description: name,
      quantity: 1,
      unitPrice: retail,
      wholesalePrice: wholesale,
      minWholesaleQty: minQty,
    );
  }
}

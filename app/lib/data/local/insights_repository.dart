import 'package:isar/isar.dart';
import 'package:pegou_preco/data/local/schemas.dart';

class BestDateHint {
  BestDateHint({
    required this.label,
    required this.minPrice,
    required this.marketName,
    required this.date,
  });

  final String label;
  final double minPrice;
  final String? marketName;
  final DateTime date;
}

class CheapNowRow {
  CheapNowRow({
    required this.product,
    required this.log,
    required this.marketName,
  });

  final Product product;
  final PriceLog log;
  final String? marketName;
}

class OpportunityRow {
  OpportunityRow({
    required this.product,
    required this.lastPrice,
    required this.avgPrice,
    required this.pctAbove,
  });

  final Product product;
  final double lastPrice;
  final double avgPrice;
  final double pctAbove;
}

class MarketInsight {
  MarketInsight({
    required this.market,
    required this.productCount,
    required this.cheapestCount,
    required this.lastVisit,
  });

  final Market market;
  final int productCount;
  final int cheapestCount;
  final DateTime? lastVisit;
}

class InsightsRepository {
  InsightsRepository(this._isar);
  final Isar _isar;

  Future<List<PriceLog>> allLogs() =>
      _isar.priceLogs.where().sortByCapturedAtDesc().findAll();

  Future<BestDateHint?> bestDateForProduct(int productId) async {
    final logs = await _isar.priceLogs
        .filter()
        .productIdEqualTo(productId)
        .sortByRetailPrice()
        .findAll();
    if (logs.isEmpty) return null;
    final best = logs.first;
    String? marketName;
    if (best.marketId != null) {
      marketName = (await _isar.markets.get(best.marketId!))?.name;
    }
    final weekday = _weekdayPt(best.capturedAt.toLocal().weekday);
    return BestDateHint(
      label: 'Menor preço: ${_fmt(best.capturedAt)} ($weekday)',
      minPrice: best.retailPrice,
      marketName: marketName,
      date: best.capturedAt,
    );
  }

  /// Contagem de menores preços por dia da semana.
  Future<Map<int, int>> weekdayWins(int productId) async {
    final logs = await _isar.priceLogs
        .filter()
        .productIdEqualTo(productId)
        .findAll();
    if (logs.isEmpty) return {};
    final prices = logs.map((l) => l.retailPrice).toList()..sort();
    final q1 = prices[(prices.length * 0.25).floor().clamp(0, prices.length - 1)];
    final wins = <int, int>{};
    for (final log in logs) {
      if (log.retailPrice <= q1) {
        final wd = log.capturedAt.toLocal().weekday;
        wins[wd] = (wins[wd] ?? 0) + 1;
      }
    }
    return wins;
  }

  Future<List<CheapNowRow>> cheapestNow({int limit = 20}) async {
    final products = await _isar.products.where().findAll();
    final rows = <CheapNowRow>[];
    for (final p in products) {
      final logs = await _isar.priceLogs
          .filter()
          .productIdEqualTo(p.id)
          .sortByCapturedAtDesc()
          .findAll();
      PriceLog? best;
      for (final log in logs) {
        if (log.trustLevel == TrustLevel.hidden) continue;
        if (best == null || log.retailPrice < best.retailPrice) {
          // Prefer recent per market — use overall min among last 30d
          final age = DateTime.now().toUtc().difference(log.capturedAt);
          if (age.inDays <= 30) {
            if (best == null || log.retailPrice < best.retailPrice) {
              best = log;
            }
          }
        }
      }
      best ??= logs.where((l) => l.trustLevel != TrustLevel.hidden).fold<PriceLog?>(
            null,
            (prev, l) =>
                prev == null || l.retailPrice < prev.retailPrice ? l : prev,
          );
      if (best == null) continue;
      String? marketName;
      if (best.marketId != null) {
        marketName = (await _isar.markets.get(best.marketId!))?.name;
      }
      rows.add(CheapNowRow(product: p, log: best, marketName: marketName));
    }
    rows.sort((a, b) => a.log.retailPrice.compareTo(b.log.retailPrice));
    return rows.take(limit).toList();
  }

  Future<List<OpportunityRow>> opportunities({int limit = 15}) async {
    final products = await _isar.products.where().findAll();
    final rows = <OpportunityRow>[];
    for (final p in products) {
      final logs = await _isar.priceLogs
          .filter()
          .productIdEqualTo(p.id)
          .sortByCapturedAtDesc()
          .findAll();
      if (logs.length < 2) continue;
      final last = logs.first;
      final avg =
          logs.map((l) => l.retailPrice).reduce((a, b) => a + b) / logs.length;
      if (last.retailPrice <= avg) continue;
      final pct = ((last.retailPrice - avg) / avg) * 100;
      rows.add(
        OpportunityRow(
          product: p,
          lastPrice: last.retailPrice,
          avgPrice: avg,
          pctAbove: pct,
        ),
      );
    }
    rows.sort((a, b) => b.pctAbove.compareTo(a.pctAbove));
    return rows.take(limit).toList();
  }

  Future<List<MarketInsight>> marketInsights() async {
    final markets = await _isar.markets.where().findAll();
    final allLogs = await _isar.priceLogs.where().findAll();
    final byProduct = <int, List<PriceLog>>{};
    for (final log in allLogs) {
      byProduct.putIfAbsent(log.productId, () => []).add(log);
    }

    final cheapestMarket = <int, int>{};
    for (final entry in byProduct.entries) {
      PriceLog? best;
      for (final log in entry.value) {
        if (log.trustLevel == TrustLevel.hidden) continue;
        if (best == null || log.retailPrice < best.retailPrice) best = log;
      }
      if (best?.marketId != null) {
        cheapestMarket[best!.marketId!] =
            (cheapestMarket[best.marketId!] ?? 0) + 1;
      }
    }

    final insights = <MarketInsight>[];
    for (final m in markets) {
      final logs = allLogs.where((l) => l.marketId == m.id).toList();
      final products = logs.map((l) => l.productId).toSet();
      DateTime? last;
      for (final l in logs) {
        if (last == null || l.capturedAt.isAfter(last)) last = l.capturedAt;
      }
      insights.add(
        MarketInsight(
          market: m,
          productCount: products.length,
          cheapestCount: cheapestMarket[m.id] ?? 0,
          lastVisit: last,
        ),
      );
    }
    insights.sort((a, b) => b.cheapestCount.compareTo(a.cheapestCount));
    return insights;
  }

  static String _weekdayPt(int wd) {
    const names = [
      '',
      'segunda',
      'terça',
      'quarta',
      'quinta',
      'sexta',
      'sábado',
      'domingo',
    ];
    return names[wd.clamp(1, 7)];
  }

  static String _fmt(DateTime d) {
    final l = d.toLocal();
    final dd = l.day.toString().padLeft(2, '0');
    final mm = l.month.toString().padLeft(2, '0');
    return '$dd/$mm/${l.year}';
  }
}

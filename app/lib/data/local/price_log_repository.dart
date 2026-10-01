import 'package:isar/isar.dart';
import 'package:pegou_preco/data/local/schemas.dart';

class ProductPriceStats {
  ProductPriceStats({
    required this.minPrice,
    required this.avgPrice,
    required this.lastPrice,
    required this.lastCapturedAt,
    this.lastMarketName,
  });

  final double minPrice;
  final double avgPrice;
  final double lastPrice;
  final DateTime lastCapturedAt;
  final String? lastMarketName;
}

/// Contexto de comparação para cards do carrinho (mockup).
class CartPriceContext {
  CartPriceContext({
    this.previousPrice,
    this.previousAt,
    this.bestPrice,
    this.bestMarketName,
    this.bestMarketId,
  });

  final double? previousPrice;
  final DateTime? previousAt;
  final double? bestPrice;
  final String? bestMarketName;
  final int? bestMarketId;
}

class PriceLogRepository {
  PriceLogRepository(this._isar);
  final Isar _isar;

  Future<List<PriceLog>> forProduct(int productId) => _isar.priceLogs
      .filter()
      .productIdEqualTo(productId)
      .sortByCapturedAtDesc()
      .findAll();

  Future<List<PriceLog>> recent({int limit = 100}) =>
      _isar.priceLogs.where().sortByCapturedAtDesc().limit(limit).findAll();

  Future<PriceLog?> byNfceKey(String key) =>
      _isar.priceLogs.filter().nfceKeyEqualTo(key).findFirst();

  Future<int> put(PriceLog log) async {
    return _isar.writeTxn(() => _isar.priceLogs.put(log));
  }

  Future<void> putAll(List<PriceLog> logs) async {
    await _isar.writeTxn(() => _isar.priceLogs.putAll(logs));
  }

  Future<ProductPriceStats?> statsForProduct(int productId) async {
    final logs = await forProduct(productId);
    if (logs.isEmpty) return null;

    final prices = logs.map((l) => l.retailPrice).toList();
    final min = prices.reduce((a, b) => a < b ? a : b);
    final avg = prices.reduce((a, b) => a + b) / prices.length;
    final last = logs.first;
    String? marketName;
    if (last.marketId != null) {
      marketName = (await _isar.markets.get(last.marketId!))?.name;
    }
    return ProductPriceStats(
      minPrice: min,
      avgPrice: avg,
      lastPrice: last.retailPrice,
      lastCapturedAt: last.capturedAt,
      lastMarketName: marketName,
    );
  }

  /// Compra anterior + menor preço conhecido (para UI do carrinho).
  Future<CartPriceContext> cartContextForProduct({
    required int productId,
    required double currentUnitPrice,
    int? currentMarketId,
  }) async {
    final logs = await forProduct(productId);
    if (logs.isEmpty) return CartPriceContext();

    // Compra anterior: segundo log mais recente, ou o primeiro se o atual
    // acabou de ser gravado com o mesmo preço.
    PriceLog? previous;
    for (final log in logs) {
      final sameAsCurrent =
          (log.retailPrice - currentUnitPrice).abs() < 0.009 &&
              (currentMarketId == null || log.marketId == currentMarketId);
      if (!sameAsCurrent) {
        previous = log;
        break;
      }
    }
    previous ??= logs.length > 1 ? logs[1] : null;

    PriceLog? best;
    for (final log in logs) {
      if (best == null || log.retailPrice < best.retailPrice) {
        best = log;
      }
    }

    String? bestMarketName;
    if (best?.marketId != null) {
      bestMarketName = (await _isar.markets.get(best!.marketId!))?.name;
    }

    return CartPriceContext(
      previousPrice: previous?.retailPrice,
      previousAt: previous?.capturedAt,
      bestPrice: best?.retailPrice,
      bestMarketName: bestMarketName,
      bestMarketId: best?.marketId,
    );
  }

  Future<List<PriceLog>> unsynced({int limit = 100}) => _isar.priceLogs
      .filter()
      .syncedEqualTo(false)
      .limit(limit)
      .findAll();

  Future<void> markSynced(int id, String remoteId) async {
    await _isar.writeTxn(() async {
      final log = await _isar.priceLogs.get(id);
      if (log == null) return;
      log
        ..remoteId = remoteId
        ..synced = true;
      await _isar.priceLogs.put(log);
    });
  }

  Future<void> upsertFromRemote(PriceLog incoming) async {
    await _isar.writeTxn(() async {
      PriceLog? existing;
      if (incoming.remoteId != null) {
        existing = await _isar.priceLogs
            .filter()
            .remoteIdEqualTo(incoming.remoteId!)
            .findFirst();
      }
      if (existing == null && incoming.nfceKey != null) {
        existing = await _isar.priceLogs
            .filter()
            .nfceKeyEqualTo(incoming.nfceKey!)
            .findFirst();
      }
      if (existing != null) {
        if (incoming.updatedAt.isAfter(existing.updatedAt)) {
          incoming.id = existing.id;
          incoming.synced = true;
          incoming.confirmScore = incoming.confirmScore;
          incoming.rejectScore = incoming.rejectScore;
          incoming.trustLevel = incoming.trustLevel;
          incoming.lastConfirmedAt = incoming.lastConfirmedAt;
          await _isar.priceLogs.put(incoming);
        }
      } else {
        incoming.synced = true;
        await _isar.priceLogs.put(incoming);
      }
    });
  }
}

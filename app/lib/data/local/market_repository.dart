import 'package:isar/isar.dart';
import 'package:pegou_preco/data/local/schemas.dart';

class MarketRepository {
  MarketRepository(this._isar);
  final Isar _isar;

  Future<Market> resolveOrCreate({
    required String name,
    String? cnpj,
    String? uf,
  }) async {
    Market? existing;
    if (cnpj != null && cnpj.isNotEmpty) {
      final normalized = cnpj.replaceAll(RegExp(r'\D'), '');
      existing = await _isar.markets
          .filter()
          .cnpjEqualTo(normalized)
          .findFirst();
    }
    existing ??= await _isar.markets
        .filter()
        .nameEqualTo(name, caseSensitive: false)
        .findFirst();

    if (existing != null) {
      var dirty = false;
      if (cnpj != null && (existing.cnpj == null || existing.cnpj!.isEmpty)) {
        existing.cnpj = cnpj.replaceAll(RegExp(r'\D'), '');
        dirty = true;
      }
      if (uf != null && existing.uf == null) {
        existing.uf = uf;
        dirty = true;
      }
      if (dirty) {
        existing
          ..updatedAt = DateTime.now().toUtc()
          ..synced = false;
        await _isar.writeTxn(() => _isar.markets.put(existing!));
      }
      return existing;
    }

    final market = Market()
      ..name = name.trim()
      ..cnpj = cnpj?.replaceAll(RegExp(r'\D'), '')
      ..uf = uf
      ..updatedAt = DateTime.now().toUtc()
      ..synced = false;

    await _isar.writeTxn(() => _isar.markets.put(market));
    return market;
  }

  Future<Market?> getById(int id) => _isar.markets.get(id);

  Future<List<Market>> all() =>
      _isar.markets.where().sortByName().findAll();

  Future<void> updateGeo(
    int id, {
    double? lat,
    double? lng,
    String? address,
    double? avgRating,
    int? ratingsCount,
    String? priceLevel,
    String? remoteId,
  }) async {
    await _isar.writeTxn(() async {
      final m = await _isar.markets.get(id);
      if (m == null) return;
      if (lat != null) m.lat = lat;
      if (lng != null) m.lng = lng;
      if (address != null) m.address = address;
      if (avgRating != null) m.avgRating = avgRating;
      if (ratingsCount != null) m.ratingsCount = ratingsCount;
      if (priceLevel != null) m.priceLevel = priceLevel;
      if (remoteId != null) m.remoteId = remoteId;
      m
        ..updatedAt = DateTime.now().toUtc()
        ..synced = remoteId != null ? true : m.synced;
      await _isar.markets.put(m);
    });
  }

  Future<List<Market>> unsynced({int limit = 100}) =>
      _isar.markets.filter().syncedEqualTo(false).limit(limit).findAll();

  Future<void> markSynced(int id, String remoteId) async {
    await _isar.writeTxn(() async {
      final m = await _isar.markets.get(id);
      if (m == null) return;
      m
        ..remoteId = remoteId
        ..synced = true;
      await _isar.markets.put(m);
    });
  }

  Future<void> upsertFromRemote(Market incoming) async {
    await _isar.writeTxn(() async {
      Market? existing;
      if (incoming.remoteId != null) {
        existing = await _isar.markets
            .filter()
            .remoteIdEqualTo(incoming.remoteId!)
            .findFirst();
      }
      if (existing == null && incoming.cnpj != null) {
        existing = await _isar.markets
            .filter()
            .cnpjEqualTo(incoming.cnpj!)
            .findFirst();
      }
      if (existing != null) {
        if (incoming.updatedAt.isAfter(existing.updatedAt)) {
          incoming.id = existing.id;
          incoming.synced = true;
          await _isar.markets.put(incoming);
        }
      } else {
        incoming.synced = true;
        await _isar.markets.put(incoming);
      }
    });
  }
}

import 'package:isar/isar.dart';
import 'package:pegou_preco/core/utils/levenshtein.dart';
import 'package:pegou_preco/data/local/schemas.dart';

class ProductMatch {
  ProductMatch({required this.product, required this.similarity});
  final Product product;
  final double similarity;
}

class ProductRepository {
  ProductRepository(this._isar);
  final Isar _isar;

  Future<List<Product>> search(String query, {int limit = 50}) async {
    final q = query.trim();
    if (q.isEmpty) {
      return _isar.products.where().sortByName().limit(limit).findAll();
    }
    return _isar.products
        .filter()
        .nameContains(q, caseSensitive: false)
        .or()
        .aliasesElementContains(q, caseSensitive: false)
        .sortByName()
        .limit(limit)
        .findAll();
  }

  Future<List<Product>> all() =>
      _isar.products.where().sortByName().findAll();

  Future<Product?> getById(int id) => _isar.products.get(id);

  Future<void> setCategory(int productId, String? category) async {
    await _isar.writeTxn(() async {
      final p = await _isar.products.get(productId);
      if (p == null) return;
      p
        ..category = category
        ..updatedAt = DateTime.now().toUtc()
        ..synced = false;
      await _isar.products.put(p);
    });
  }

  Future<List<String>> distinctCategories() async {
    final products = await all();
    final set = <String>{};
    for (final p in products) {
      if (p.category != null && p.category!.isNotEmpty) {
        set.add(p.category!);
      }
    }
    final list = set.toList()..sort();
    return list;
  }

  Future<ProductMatch?> findFuzzy(
    String name, {
    double threshold = FuzzyMatch.defaultThreshold,
  }) async {
    final products = await all();
    ProductMatch? best;
    for (final p in products) {
      final names = [p.name, ...p.aliases];
      for (final candidate in names) {
        final sim = FuzzyMatch.similarity(name, candidate);
        if (sim >= threshold &&
            (best == null || sim > best.similarity)) {
          best = ProductMatch(product: p, similarity: sim);
        }
      }
    }
    return best;
  }

  /// Resolve produto existente (fuzzy) ou cria novo.
  Future<Product> resolveOrCreate(String rawName) async {
    final name = rawName.trim();
    final match = await findFuzzy(name);
    if (match != null) {
      if (FuzzyMatch.similarity(name, match.product.name) < 1.0 &&
          !match.product.aliases
              .map((a) => a.toLowerCase())
              .contains(name.toLowerCase()) &&
          name.toLowerCase() != match.product.name.toLowerCase()) {
        await _isar.writeTxn(() async {
          match.product.aliases = [...match.product.aliases, name];
          match.product.updatedAt = DateTime.now().toUtc();
          match.product.synced = false;
          await _isar.products.put(match.product);
        });
      }
      return match.product;
    }

    final product = Product()
      ..name = name
      ..aliases = []
      ..updatedAt = DateTime.now().toUtc()
      ..synced = false;

    await _isar.writeTxn(() async {
      await _isar.products.put(product);
    });
    return product;
  }

  Future<void> upsertFromRemote(Product product) async {
    await _isar.writeTxn(() async {
      Product? existing;
      if (product.remoteId != null) {
        existing = await _isar.products
            .filter()
            .remoteIdEqualTo(product.remoteId!)
            .findFirst();
      }
      existing ??= await findFuzzy(product.name).then((m) => m?.product);

      if (existing != null) {
        if (product.updatedAt.isAfter(existing.updatedAt)) {
          existing
            ..name = product.name
            ..aliases = product.aliases
            ..category = product.category
            ..remoteId = product.remoteId ?? existing.remoteId
            ..updatedAt = product.updatedAt
            ..synced = true;
          await _isar.products.put(existing);
        }
      } else {
        product.synced = true;
        await _isar.products.put(product);
      }
    });
  }

  Future<List<Product>> unsynced({int limit = 100}) => _isar.products
      .filter()
      .syncedEqualTo(false)
      .limit(limit)
      .findAll();

  Future<void> markSynced(int id, String remoteId) async {
    await _isar.writeTxn(() async {
      final p = await _isar.products.get(id);
      if (p == null) return;
      p
        ..remoteId = remoteId
        ..synced = true;
      await _isar.products.put(p);
    });
  }
}

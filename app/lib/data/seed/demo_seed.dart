import 'dart:convert';
import 'dart:math';

import 'package:isar/isar.dart';
import 'package:pegou_preco/core/prefs/app_prefs.dart';
import 'package:pegou_preco/core/utils/pricing.dart';
import 'package:pegou_preco/data/local/schemas.dart';

/// Popula o Isar com dados realistas para demonstração.
/// Ativado via `--dart-define=SEED_DEMO=true`.
class DemoSeed {
  DemoSeed._();

  static const envFlag = 'SEED_DEMO';
  static const seedVersion = 2;

  static bool get requested =>
      const bool.fromEnvironment(envFlag, defaultValue: false);

  static Future<void> runIfRequested(Isar isar, AppPrefs prefs) async {
    if (!requested) return;
    // ignore: avoid_print
    print('==> DemoSeed v$seedVersion: limpando e populando dados…');
    await populate(isar, prefs);
    // ignore: avoid_print
    print('==> DemoSeed concluído.');
  }

  static Future<void> populate(Isar isar, AppPrefs prefs) async {
    await isar.writeTxn(() async {
      await isar.clear();
    });

    final now = DateTime.now().toUtc();
    final rnd = Random(42);

    final markets = <Market>[
      _market(
        'Atacadão Cruz de Rebouças',
        cnpj: '75315333000109',
        uf: 'PE',
        lat: -8.0284,
        lng: -34.9352,
        address: 'Av. Dr. José Rufino, Recife - PE',
        avgRating: 4.3,
        ratingsCount: 128,
        priceLevel: 'low',
        now: now,
      ),
      _market(
        'Carrefour Dourados',
        cnpj: '45543915045218',
        uf: 'PE',
        lat: -8.0476,
        lng: -34.8770,
        address: 'Av. Mal. Mascarenhas de Morais, Recife - PE',
        avgRating: 4.0,
        ratingsCount: 86,
        priceLevel: 'fair',
        now: now,
      ),
      _market(
        "Sam's Club Recife",
        cnpj: '00776574006711',
        uf: 'PE',
        lat: -8.1121,
        lng: -34.9148,
        address: 'Av. Eng. Domingos Ferreira, Recife - PE',
        avgRating: 4.5,
        ratingsCount: 210,
        priceLevel: 'fair',
        now: now,
      ),
      _market(
        'Assaí Atacadista Imbiribeira',
        cnpj: '06057223014855',
        uf: 'PE',
        lat: -8.1015,
        lng: -34.9255,
        address: 'Av. Marechal Mascarenhas, Recife - PE',
        avgRating: 3.9,
        ratingsCount: 64,
        priceLevel: 'low',
        now: now,
      ),
      _market(
        'Extra Bompreço Boa Viagem',
        cnpj: '47508411030266',
        uf: 'PE',
        lat: -8.1198,
        lng: -34.9012,
        address: 'Av. Conselheiro Aguiar, Recife - PE',
        avgRating: 3.7,
        ratingsCount: 41,
        priceLevel: 'high',
        now: now,
      ),
      _market(
        'Mercado da Esquina',
        cnpj: null,
        uf: 'PE',
        lat: -8.0550,
        lng: -34.8850,
        address: 'Rua da Aurora, Recife - PE',
        avgRating: 4.1,
        ratingsCount: 19,
        priceLevel: 'fair',
        now: now,
      ),
    ];

    await isar.writeTxn(() async {
      await isar.markets.putAll(markets);
    });

    final catalog = <_SeedProduct>[
      _SeedProduct('Picanha bovina Maturatta 1,2 kg', 'Açougue', 89.90, 84.90, 3),
      _SeedProduct('Cerveja Spaten 350ml c/12', 'Bebidas', 47.90, 42.90, 2),
      _SeedProduct('Arroz Tipo 1 Camil 5kg', 'Mercearia', 24.90, 21.90, 3),
      _SeedProduct('Feijão Carioca Kicaldo 1kg', 'Mercearia', 8.49, 7.49, 5),
      _SeedProduct('Leite Integral Italac 1L c/12', 'Laticínios', 58.80, 54.90, 2),
      _SeedProduct('Óleo de Soja Liza 900ml', 'Mercearia', 6.99, 5.99, 6),
      _SeedProduct('Café Pilão Tradicional 500g', 'Mercearia', 18.90, 16.90, 3),
      _SeedProduct('Açúcar Cristal União 1kg', 'Mercearia', 4.79, 4.29, 6),
      _SeedProduct('Papel Higiênico Neve 12un', 'Limpeza', 22.90, 19.90, 2),
      _SeedProduct('Detergente Ypê Clear 500ml', 'Limpeza', 2.49, 1.99, 10),
      _SeedProduct('Salg Pippos Churrasco 75G', 'Snacks', 5.49, 4.99, 3),
      _SeedProduct('Whisky Ballantines Finest 750ml', 'Bebidas', 89.90, 79.90, 2),
      _SeedProduct('Queijo Mussarela Fatiado 500g', 'Frios', 32.90, 29.90, 2),
      _SeedProduct('Presunto Seara 200g', 'Frios', 9.90, 8.90, 3),
      _SeedProduct('Banana Prata kg', 'Hortifruti', 5.99, null, null),
      _SeedProduct('Tomate Carmem kg', 'Hortifruti', 7.49, null, null),
      _SeedProduct('Batata Inglesa kg', 'Hortifruti', 4.99, null, null),
      _SeedProduct('Refrigerante Coca-Cola 2L', 'Bebidas', 10.99, 9.49, 4),
      _SeedProduct('Água Mineral Crystal 1,5L c/6', 'Bebidas', 14.90, 12.90, 2),
      _SeedProduct('Biscoito Cream Cracker 400g', 'Mercearia', 8.90, 7.50, 3),
    ];

    final products = <Product>[];
    for (final c in catalog) {
      products.add(
        Product()
          ..name = c.name
          ..aliases = []
          ..category = c.category
          ..updatedAt = now
          ..synced = false,
      );
    }
    await isar.writeTxn(() async {
      await isar.products.putAll(products);
    });

    final logs = <PriceLog>[];
    for (var i = 0; i < products.length; i++) {
      final p = products[i];
      final c = catalog[i];
      // Histórico em vários mercados / datas (para comparar e alertas).
      for (var d = 0; d < 5; d++) {
        final market = markets[rnd.nextInt(markets.length)];
        final drift = 1 + (rnd.nextDouble() * 0.18 - 0.06);
        final retail = double.parse((c.retail * drift).toStringAsFixed(2));
        final wholesale = c.wholesale == null
            ? null
            : double.parse((c.wholesale! * drift).toStringAsFixed(2));
        logs.add(
          PriceLog()
            ..productId = p.id
            ..marketId = market.id
            ..retailPrice = retail
            ..wholesalePrice = wholesale
            ..minWholesaleQty = c.minQty
            ..source = d == 0 ? PriceSource.label : PriceSource.manual
            ..capturedAt = now.subtract(Duration(days: 3 + d * 7))
            ..updatedAt = now.subtract(Duration(days: 3 + d * 7))
            ..synced = false
            ..trustLevel =
                d == 0 ? TrustLevel.verified : TrustLevel.suspect
            ..confirmScore = d == 0 ? 4 : 1
            ..rejectScore = 0
            ..lastConfirmedAt = d == 0 ? now.subtract(const Duration(days: 1)) : null
            ..contributorId = 'seed_demo',
        );
      }
      // Preço “atual” no mercado principal (Atacadão).
      logs.add(
        PriceLog()
          ..productId = p.id
          ..marketId = markets.first.id
          ..retailPrice = c.retail
          ..wholesalePrice = c.wholesale
          ..minWholesaleQty = c.minQty
          ..source = PriceSource.label
          ..capturedAt = now.subtract(const Duration(hours: 6))
          ..updatedAt = now.subtract(const Duration(hours: 6))
          ..synced = false
          ..trustLevel = TrustLevel.verified
          ..confirmScore = 5
          ..rejectScore = 0
          ..lastConfirmedAt = now.subtract(const Duration(hours: 2))
          ..contributorId = 'seed_demo',
      );
    }
    await isar.writeTxn(() async {
      await isar.priceLogs.putAll(logs);
    });

    // Carrinho ativo (lista em andamento).
    final cartCatalogIndexes = [0, 1, 2, 4, 6, 10, 11, 12];
    final cartItems = <CartItem>[];
    for (final idx in cartCatalogIndexes) {
      final p = products[idx];
      final c = catalog[idx];
      final qty = idx == 0 ? 1.2 : (idx == 1 ? 2.0 : 1.0);
      cartItems.add(
        CartItem()
          ..productId = p.id
          ..productName = p.name
          ..quantity = qty
          ..retailPrice = c.retail
          ..wholesalePrice = c.wholesale
          ..minWholesaleQty = c.minQty
          ..checkedOff = idx == 1
          ..updatedAt = now,
      );
    }
    await isar.writeTxn(() async {
      await isar.cartItems.putAll(cartItems);
    });

    // Listas finalizadas (histórico).
    final finishedLists = <ShoppingList>[
      await _buildFinishedList(
        name: 'Churrasco de domingo',
        market: markets[0],
        products: products,
        catalog: catalog,
        indexes: const [0, 1, 11, 12, 13, 17],
        daysAgo: 14,
        now: now,
      ),
      await _buildFinishedList(
        name: 'Compras da semana',
        market: markets[1],
        products: products,
        catalog: catalog,
        indexes: const [2, 3, 4, 5, 6, 7, 8, 9],
        daysAgo: 7,
        now: now,
      ),
      await _buildFinishedList(
        name: 'Feira rápida',
        market: markets[3],
        products: products,
        catalog: catalog,
        indexes: const [14, 15, 16, 18],
        daysAgo: 3,
        now: now,
      ),
    ];
    await isar.writeTxn(() async {
      await isar.shoppingLists.putAll(finishedLists);
    });

    // Avaliações locais de mercado.
    final reviews = <MarketReview>[];
    for (final m in markets) {
      for (var s = 0; s < 3; s++) {
        reviews.add(
          MarketReview()
            ..marketId = m.id
            ..marketRemoteId = m.remoteId
            ..stars = 3 + rnd.nextInt(3)
            ..comment = null
            ..voterHash = 'seed_${m.id}_$s'
            ..createdAt = now.subtract(Duration(days: s + 1))
            ..synced = false,
        );
      }
    }
    await isar.writeTxn(() async {
      await isar.marketReviews.putAll(reviews);
    });

    await prefs.setOnboardingDone(true);
    await prefs.setActiveList(
      name: 'Compras de hoje',
      marketId: markets.first.id,
    );
    await prefs.setCurrentMarketId(markets.first.id);
  }

  static Market _market(
    String name, {
    required String? cnpj,
    required String uf,
    required double lat,
    required double lng,
    required String address,
    required double avgRating,
    required int ratingsCount,
    required String priceLevel,
    required DateTime now,
  }) {
    return Market()
      ..name = name
      ..cnpj = cnpj
      ..uf = uf
      ..lat = lat
      ..lng = lng
      ..address = address
      ..avgRating = avgRating
      ..ratingsCount = ratingsCount
      ..priceLevel = priceLevel
      ..remoteId = null
      ..updatedAt = now
      ..synced = false;
  }

  static Future<ShoppingList> _buildFinishedList({
    required String name,
    required Market market,
    required List<Product> products,
    required List<_SeedProduct> catalog,
    required List<int> indexes,
    required int daysAgo,
    required DateTime now,
  }) async {
    final finishedAt = now.subtract(Duration(days: daysAgo));
    final snapshot = <Map<String, dynamic>>[];
    var subtotal = 0.0;
    var savings = 0.0;
    for (final idx in indexes) {
      final p = products[idx];
      final c = catalog[idx];
      const qty = 1.0;
      final lt = lineTotal(
        quantity: qty,
        retailPrice: c.retail,
        wholesalePrice: c.wholesale,
        minWholesaleQty: c.minQty,
      );
      final sv = lineSavings(
        quantity: qty,
        retailPrice: c.retail,
        wholesalePrice: c.wholesale,
        minWholesaleQty: c.minQty,
      );
      subtotal += lt;
      savings += sv;
      snapshot.add({
        'productId': p.id,
        'productName': p.name,
        'quantity': qty,
        'retailPrice': c.retail,
        'wholesalePrice': c.wholesale,
        'minWholesaleQty': c.minQty,
        'checkedOff': true,
        'lineTotal': lt,
      });
    }
    return ShoppingList()
      ..name = name
      ..marketId = market.id
      ..marketName = market.name
      ..itemsJson = jsonEncode(snapshot)
      ..subtotal = double.parse(subtotal.toStringAsFixed(2))
      ..savings = double.parse(savings.toStringAsFixed(2))
      ..itemCount = indexes.length
      ..finishedAt = finishedAt
      ..updatedAt = finishedAt
      ..synced = false;
  }
}

class _SeedProduct {
  _SeedProduct(
    this.name,
    this.category,
    this.retail,
    this.wholesale,
    this.minQty,
  );

  final String name;
  final String category;
  final double retail;
  final double? wholesale;
  final double? minQty;
}

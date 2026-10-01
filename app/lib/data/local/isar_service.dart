import 'dart:io';

import 'package:isar/isar.dart';
import 'package:path_provider/path_provider.dart';
import 'package:pegou_preco/data/local/schemas.dart';

class IsarService {
  IsarService._();

  static const _name = 'pegou_preco';

  static final _schemas = [
    ProductSchema,
    MarketSchema,
    PriceLogSchema,
    CartItemSchema,
    PendingReceiptSchema,
    AppUserSchema,
    PriceVoteSchema,
    UserReputationSchema,
    MarketReviewSchema,
    ShoppingListSchema,
  ];

  static Future<Isar> open() async {
    if (Isar.instanceNames.contains(_name)) {
      return Isar.getInstance(_name)!;
    }
    final dir = await getApplicationDocumentsDirectory();
    try {
      return await Isar.open(
        _schemas,
        directory: dir.path,
        name: _name,
      );
    } catch (_) {
      // Schema mudou (mapa/geo/reviews) — apaga DB e reabre.
      // Sem isso o APK entra em loop "apresenta falhas contínuas".
      await _wipeIsarFiles(dir.path);
      return Isar.open(
        _schemas,
        directory: dir.path,
        name: _name,
      );
    }
  }

  static Future<void> _wipeIsarFiles(String directory) async {
    try {
      final existing = Isar.getInstance(_name);
      if (existing != null) {
        await existing.close(deleteFromDisk: true);
      }
    } catch (_) {}

    for (final fileName in [
      '$_name.isar',
      '$_name.isar.lock',
    ]) {
      final file = File('$directory${Platform.pathSeparator}$fileName');
      if (await file.exists()) {
        try {
          await file.delete();
        } catch (_) {}
      }
    }
  }
}

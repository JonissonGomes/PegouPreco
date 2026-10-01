import 'dart:convert';

import 'package:isar/isar.dart';
import 'package:pegou_preco/core/utils/pricing.dart';
import 'package:pegou_preco/data/local/cart_repository.dart';
import 'package:pegou_preco/data/local/schemas.dart';

class ShoppingListRepository {
  ShoppingListRepository(this._isar);
  final Isar _isar;

  Future<List<ShoppingList>> all() =>
      _isar.shoppingLists.where().sortByFinishedAtDesc().findAll();

  Stream<List<ShoppingList>> watchAll() => _isar.shoppingLists
      .where()
      .sortByFinishedAtDesc()
      .watch(fireImmediately: true);

  Future<ShoppingList?> getById(int id) => _isar.shoppingLists.get(id);

  Future<List<ShoppingList>> unsynced({int limit = 50}) => _isar.shoppingLists
      .filter()
      .syncedEqualTo(false)
      .limit(limit)
      .findAll();

  Future<ShoppingList> finalizeFromCart({
    required String name,
    required int? marketId,
    required String? marketName,
    required List<CartItem> items,
    required CartTotals totals,
  }) async {
    final snapshot = [
      for (final i in items)
        {
          'productId': i.productId,
          'productName': i.productName,
          'quantity': i.quantity,
          'retailPrice': i.retailPrice,
          'wholesalePrice': i.wholesalePrice,
          'minWholesaleQty': i.minWholesaleQty,
          'checkedOff': i.checkedOff,
          'lineTotal': lineTotal(
            quantity: i.quantity,
            retailPrice: i.retailPrice,
            wholesalePrice: i.wholesalePrice,
            minWholesaleQty: i.minWholesaleQty,
          ),
        },
    ];

    final now = DateTime.now().toUtc();
    final list = ShoppingList()
      ..name = name.trim()
      ..marketId = marketId
      ..marketName = marketName
      ..itemsJson = jsonEncode(snapshot)
      ..subtotal = totals.subtotal
      ..savings = totals.savings
      ..itemCount = totals.itemCount
      ..finishedAt = now
      ..updatedAt = now
      ..synced = false;

    await _isar.writeTxn(() => _isar.shoppingLists.put(list));
    return list;
  }

  Future<void> markSynced(int id, String remoteId) async {
    await _isar.writeTxn(() async {
      final list = await _isar.shoppingLists.get(id);
      if (list == null) return;
      list
        ..remoteId = remoteId
        ..synced = true;
      await _isar.shoppingLists.put(list);
    });
  }

  Future<void> upsertFromRemote(ShoppingList incoming) async {
    await _isar.writeTxn(() async {
      ShoppingList? existing;
      if (incoming.remoteId != null) {
        existing = await _isar.shoppingLists
            .filter()
            .remoteIdEqualTo(incoming.remoteId!)
            .findFirst();
      }
      if (existing != null) {
        if (incoming.updatedAt.isAfter(existing.updatedAt)) {
          incoming.id = existing.id;
          incoming.synced = true;
          await _isar.shoppingLists.put(incoming);
        }
      } else {
        incoming.synced = true;
        await _isar.shoppingLists.put(incoming);
      }
    });
  }
}

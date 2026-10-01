import 'package:isar/isar.dart';
import 'package:pegou_preco/core/utils/pricing.dart';
import 'package:pegou_preco/data/local/schemas.dart';

class CartTotals {
  CartTotals({
    required this.subtotal,
    required this.savings,
    required this.itemCount,
    required this.checkedCount,
  });

  final double subtotal;
  final double savings;
  final int itemCount;
  final int checkedCount;
}

class CartRepository {
  CartRepository(this._isar);
  final Isar _isar;

  Future<List<CartItem>> all() =>
      _isar.cartItems.where().sortByProductName().findAll();

  Stream<List<CartItem>> watchAll() =>
      _isar.cartItems.where().sortByProductName().watch(fireImmediately: true);

  Future<void> upsert({
    required Product product,
    required double quantity,
    required double retailPrice,
    double? wholesalePrice,
    double? minWholesaleQty,
  }) async {
    if (product.id == Isar.autoIncrement) {
      throw StateError('Produto sem id Isar — não é possível upsert no carrinho');
    }
    await _isar.writeTxn(() async {
      var item = await _isar.cartItems.getByProductId(product.id);
      item ??= CartItem()
        ..productId = product.id
        ..checkedOff = false;
      item
        ..productId = product.id
        ..productName = product.name
        ..quantity = quantity
        ..retailPrice = retailPrice
        ..wholesalePrice = wholesalePrice
        ..minWholesaleQty = minWholesaleQty
        ..updatedAt = DateTime.now().toUtc();
      // putByProductId respeita o índice único (replace) em productId.
      await _isar.cartItems.putByProductId(item);
    });
  }

  Future<void> setQuantity(int id, double quantity) async {
    await _isar.writeTxn(() async {
      final item = await _isar.cartItems.get(id);
      if (item == null) return;
      if (quantity <= 0) {
        await _isar.cartItems.delete(id);
        return;
      }
      item
        ..quantity = quantity
        ..updatedAt = DateTime.now().toUtc();
      await _isar.cartItems.put(item);
    });
  }

  Future<void> updateItem({
    required int id,
    required String productName,
    required double quantity,
    required double retailPrice,
    double? wholesalePrice,
    double? minWholesaleQty,
  }) async {
    await _isar.writeTxn(() async {
      final item = await _isar.cartItems.get(id);
      if (item == null) return;
      if (quantity <= 0) {
        await _isar.cartItems.delete(id);
        return;
      }
      item
        ..productName = productName.trim()
        ..quantity = quantity
        ..retailPrice = retailPrice
        ..wholesalePrice = wholesalePrice
        ..minWholesaleQty = minWholesaleQty
        ..updatedAt = DateTime.now().toUtc();
      await _isar.cartItems.put(item);
    });
  }

  Future<void> toggleChecked(int id) async {
    await _isar.writeTxn(() async {
      final item = await _isar.cartItems.get(id);
      if (item == null) return;
      item
        ..checkedOff = !item.checkedOff
        ..updatedAt = DateTime.now().toUtc();
      await _isar.cartItems.put(item);
    });
  }

  Future<void> remove(int id) async {
    await _isar.writeTxn(() => _isar.cartItems.delete(id));
  }

  Future<void> clear() async {
    await _isar.writeTxn(() => _isar.cartItems.clear());
  }

  CartTotals computeTotals(List<CartItem> items) {
    var subtotal = 0.0;
    var savings = 0.0;
    var checked = 0;
    for (final i in items) {
      subtotal += lineTotal(
        quantity: i.quantity,
        retailPrice: i.retailPrice,
        wholesalePrice: i.wholesalePrice,
        minWholesaleQty: i.minWholesaleQty,
      );
      savings += lineSavings(
        quantity: i.quantity,
        retailPrice: i.retailPrice,
        wholesalePrice: i.wholesalePrice,
        minWholesaleQty: i.minWholesaleQty,
      );
      if (i.checkedOff) checked++;
    }
    return CartTotals(
      subtotal: subtotal,
      savings: savings,
      itemCount: items.length,
      checkedCount: checked,
    );
  }
}

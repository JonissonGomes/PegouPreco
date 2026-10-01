import 'package:isar/isar.dart';
import 'package:pegou_preco/data/local/schemas.dart';

class PendingReceiptRepository {
  PendingReceiptRepository(this._isar);
  final Isar _isar;

  Future<PendingReceipt> enqueue(String qrUrl, {String? nfceKey}) async {
    final existing =
        await _isar.pendingReceipts.filter().qrUrlEqualTo(qrUrl).findFirst();
    if (existing != null) return existing;

    final receipt = PendingReceipt()
      ..qrUrl = qrUrl
      ..nfceKey = nfceKey
      ..status = ReceiptStatus.queued
      ..createdAt = DateTime.now().toUtc()
      ..updatedAt = DateTime.now().toUtc()
      ..synced = false;

    await _isar.writeTxn(() => _isar.pendingReceipts.put(receipt));
    return receipt;
  }

  Future<List<PendingReceipt>> all() =>
      _isar.pendingReceipts.where().sortByCreatedAtDesc().findAll();

  Stream<List<PendingReceipt>> watchAll() => _isar.pendingReceipts
      .where()
      .sortByCreatedAtDesc()
      .watch(fireImmediately: true);

  Future<List<PendingReceipt>> queuedOrFailed() => _isar.pendingReceipts
      .filter()
      .statusEqualTo(ReceiptStatus.queued)
      .or()
      .statusEqualTo(ReceiptStatus.failed)
      .findAll();

  Future<PendingReceipt?> getById(int id) => _isar.pendingReceipts.get(id);

  Future<void> update(PendingReceipt receipt) async {
    receipt.updatedAt = DateTime.now().toUtc();
    await _isar.writeTxn(() => _isar.pendingReceipts.put(receipt));
  }

  Future<void> delete(int id) async {
    await _isar.writeTxn(() => _isar.pendingReceipts.delete(id));
  }
}

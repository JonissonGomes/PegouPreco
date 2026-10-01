import 'dart:async';
import 'dart:convert';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:pegou_preco/data/local/market_repository.dart';
import 'package:pegou_preco/data/local/pending_receipt_repository.dart';
import 'package:pegou_preco/data/local/price_log_repository.dart';
import 'package:pegou_preco/data/local/product_repository.dart';
import 'package:pegou_preco/data/local/schemas.dart';
import 'package:pegou_preco/data/remote/sefaz_client.dart';
import 'package:pegou_preco/data/remote/sync_api_client.dart';

class SyncWorker {
  SyncWorker({
    required this.productRepo,
    required this.priceLogRepo,
    required this.marketRepo,
    required this.pendingRepo,
    required this.sefaz,
    required this.api,
  });

  final ProductRepository productRepo;
  final PriceLogRepository priceLogRepo;
  final MarketRepository marketRepo;
  final PendingReceiptRepository pendingRepo;
  final SefazClient sefaz;
  final SyncApiClient api;

  StreamSubscription<List<ConnectivityResult>>? _sub;
  var _running = false;
  String? _authToken;
  DateTime _lastPull = DateTime.fromMillisecondsSinceEpoch(0, isUtc: true);

  final _statusController = StreamController<String>.broadcast();
  Stream<String> get statusStream => _statusController.stream;
  String lastStatus = 'idle';

  void setSessionToken(String? token) {
    _authToken = token;
  }

  void start() {
    _sub = Connectivity().onConnectivityChanged.listen((results) {
      final online = results.any((r) => r != ConnectivityResult.none);
      if (online) {
        unawaited(runFullSync());
      }
    });
    unawaited(runFullSync());
  }

  void dispose() {
    _sub?.cancel();
    _statusController.close();
  }

  void _setStatus(String s) {
    lastStatus = s;
    if (!_statusController.isClosed) _statusController.add(s);
  }

  Future<void> runFullSync() async {
    if (_running) return;
    _running = true;
    try {
      await processPendingQueue();
      await pushAndPull();
    } finally {
      _running = false;
    }
  }

  Future<void> processPendingQueue() async {
    final pending = await pendingRepo.queuedOrFailed();
    for (final r in pending) {
      await processPendingReceipt(r.id);
    }
  }

  Future<void> processPendingReceipt(int id) async {
    final receipt = await pendingRepo.getById(id);
    if (receipt == null) return;
    if (receipt.status == ReceiptStatus.done) return;

    receipt.status = ReceiptStatus.fetching;
    receipt.errorMessage = null;
    await pendingRepo.update(receipt);

    try {
      final parsed = await sefaz.fetchAndParse(receipt.qrUrl);
      receipt
        ..status = ReceiptStatus.review
        ..marketName = parsed.marketName
        ..marketCnpj = parsed.marketCnpj
        ..nfceKey = parsed.nfceKey ?? receipt.nfceKey
        ..parsedPayloadJson =
            jsonEncode(parsed.items.map((e) => e.toJson()).toList());
      await pendingRepo.update(receipt);
      _setStatus('NFC-e ${receipt.id} pronta para conferência');
    } catch (e) {
      receipt
        ..status = ReceiptStatus.failed
        ..errorMessage = e.toString();
      await pendingRepo.update(receipt);
      _setStatus('Falha NFC-e ${receipt.id}: $e');
    }
  }

  Future<void> pushAndPull() async {
    _setStatus('Sincronizando…');
    try {
      final healthy = await api.health();
      if (!healthy) {
        _setStatus('API offline — sync adiado');
        return;
      }
      final token = _authToken;
      if (token == null) {
        _setStatus('Faça login no Perfil para sincronizar');
        return;
      }

      final products = await productRepo.unsynced();
      final markets = await marketRepo.unsynced();
      final logs = await priceLogRepo.unsynced();

      final payload = {
        'products': [
          for (final p in products)
            {
              'localId': p.id,
              'remoteId': p.remoteId,
              'name': p.name,
              'aliases': p.aliases,
              'category': p.category,
              'updatedAt': p.updatedAt.toIso8601String(),
            },
        ],
        'markets': [
          for (final m in markets)
            {
              'localId': m.id,
              'remoteId': m.remoteId,
              'name': m.name,
              'cnpj': m.cnpj,
              'uf': m.uf,
              'lat': m.lat,
              'lng': m.lng,
              'address': m.address,
              'priceLevel': m.priceLevel,
              'updatedAt': m.updatedAt.toIso8601String(),
            },
        ],
        'priceLogs': [
          for (final l in logs)
            {
              'localId': l.id,
              'remoteId': l.remoteId,
              'productLocalId': l.productId,
              'marketLocalId': l.marketId,
              'retailPrice': l.retailPrice,
              'wholesalePrice': l.wholesalePrice,
              'minWholesaleQty': l.minWholesaleQty,
              'source': l.source.name,
              'capturedAt': l.capturedAt.toIso8601String(),
              'nfceKey': l.nfceKey,
              'confirmScore': l.confirmScore,
              'rejectScore': l.rejectScore,
              'trustLevel': l.trustLevel.name,
              'lastConfirmedAt': l.lastConfirmedAt?.toIso8601String(),
              'contributorId': l.contributorId,
              'updatedAt': l.updatedAt.toIso8601String(),
            },
        ],
      };

      final pushResult = await api.pushBatch(token: token, payload: payload);
      final productMap =
          Map<String, String>.from(pushResult['productIdMap'] as Map? ?? {});
      final marketMap =
          Map<String, String>.from(pushResult['marketIdMap'] as Map? ?? {});
      final logMap =
          Map<String, String>.from(pushResult['priceLogIdMap'] as Map? ?? {});

      for (final e in productMap.entries) {
        await productRepo.markSynced(int.parse(e.key), e.value);
      }
      for (final e in marketMap.entries) {
        await marketRepo.markSynced(int.parse(e.key), e.value);
      }
      for (final e in logMap.entries) {
        await priceLogRepo.markSynced(int.parse(e.key), e.value);
      }

      final pull = await api.pullSince(token: token, since: _lastPull);
      _lastPull = DateTime.now().toUtc();

      for (final m in (pull['markets'] as List? ?? const [])) {
        final map = Map<String, dynamic>.from(m as Map);
        final market = Market()
          ..name = map['name'] as String
          ..cnpj = map['cnpj'] as String?
          ..uf = map['uf'] as String?
          ..lat = (map['lat'] as num?)?.toDouble()
          ..lng = (map['lng'] as num?)?.toDouble()
          ..address = map['address'] as String?
          ..avgRating = (map['avgRating'] as num?)?.toDouble()
          ..ratingsCount = (map['ratingsCount'] as num?)?.toInt() ?? 0
          ..priceLevel = map['priceLevel'] as String?
          ..remoteId = map['id'] as String?
          ..updatedAt = DateTime.parse(map['updatedAt'] as String)
          ..synced = true;
        await marketRepo.upsertFromRemote(market);
      }

      // Map remote product ids → local for price logs.
      final remoteProductToLocal = <String, int>{};
      for (final p in (pull['products'] as List? ?? const [])) {
        final map = Map<String, dynamic>.from(p as Map);
        final product = Product()
          ..name = map['name'] as String
          ..aliases = (map['aliases'] as List? ?? const [])
              .map((e) => e.toString())
              .toList()
          ..category = map['category'] as String?
          ..remoteId = map['id'] as String?
          ..updatedAt = DateTime.parse(map['updatedAt'] as String)
          ..synced = true;
        await productRepo.upsertFromRemote(product);
        final local = await productRepo.findFuzzy(product.name);
        if (local != null && product.remoteId != null) {
          remoteProductToLocal[product.remoteId!] = local.product.id;
        }
      }

      for (final l in (pull['priceLogs'] as List? ?? const [])) {
        final map = Map<String, dynamic>.from(l as Map);
        final remoteProductId = map['productId'] as String?;
        final localProductId = remoteProductToLocal[remoteProductId ?? ''];
        if (localProductId == null) continue;

        final sourceName = map['source'] as String? ?? 'manual';
        final source = PriceSource.values.firstWhere(
          (e) => e.name == sourceName,
          orElse: () => PriceSource.manual,
        );

        final trustName = map['trustLevel'] as String? ?? 'suspect';
        final trust = TrustLevel.values.firstWhere(
          (e) => e.name == trustName,
          orElse: () => TrustLevel.suspect,
        );
        final log = PriceLog()
          ..productId = localProductId
          ..retailPrice = (map['retailPrice'] as num).toDouble()
          ..wholesalePrice = (map['wholesalePrice'] as num?)?.toDouble()
          ..minWholesaleQty = (map['minWholesaleQty'] as num?)?.toDouble()
          ..source = source
          ..capturedAt = DateTime.parse(map['capturedAt'] as String)
          ..nfceKey = map['nfceKey'] as String?
          ..remoteId = map['id'] as String?
          ..confirmScore = (map['confirmScore'] as num?)?.toDouble() ?? 0
          ..rejectScore = (map['rejectScore'] as num?)?.toDouble() ?? 0
          ..trustLevel = trust
          ..lastConfirmedAt = map['lastConfirmedAt'] != null
              ? DateTime.tryParse(map['lastConfirmedAt'] as String)
              : null
          ..contributorId = map['contributorId'] as String?
          ..updatedAt = DateTime.parse(map['updatedAt'] as String)
          ..synced = true;
        await priceLogRepo.upsertFromRemote(log);
      }

      _setStatus(
        'Sync OK · push ${products.length}p/${markets.length}m/${logs.length}l',
      );
    } catch (e) {
      _setStatus('Sync erro: $e');
    }
  }
}

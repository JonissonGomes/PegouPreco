import 'package:isar/isar.dart';

part 'schemas.g.dart';

@collection
class Product {
  Id id = Isar.autoIncrement;

  @Index(caseSensitive: false)
  late String name;

  List<String> aliases = [];

  String? category;

  String? remoteId;

  @Index()
  late DateTime updatedAt;

  @Index()
  bool synced = false;
}

@collection
class Market {
  Id id = Isar.autoIncrement;

  @Index(caseSensitive: false)
  late String name;

  @Index(unique: true, replace: true, caseSensitive: false)
  String? cnpj;

  String? uf;

  double? lat;

  double? lng;

  String? address;

  double? avgRating;

  int ratingsCount = 0;

  /// low | fair | high
  String? priceLevel;

  String? remoteId;

  @Index()
  late DateTime updatedAt;

  @Index()
  bool synced = false;
}

enum PriceSource { label, nfce, manual }

enum TrustLevel { verified, suspect, hidden }

@collection
class PriceLog {
  Id id = Isar.autoIncrement;

  @Index()
  late int productId;

  int? marketId;

  late double retailPrice;

  double? wholesalePrice;

  double? minWholesaleQty;

  @enumerated
  late PriceSource source;

  late DateTime capturedAt;

  String? remoteId;

  @Index()
  String? nfceKey;

  double confirmScore = 0;

  double rejectScore = 0;

  @enumerated
  TrustLevel trustLevel = TrustLevel.suspect;

  DateTime? lastConfirmedAt;

  String? contributorId;

  @Index()
  late DateTime updatedAt;

  @Index()
  bool synced = false;
}

@collection
class CartItem {
  Id id = Isar.autoIncrement;

  @Index(unique: true, replace: true)
  late int productId;

  late String productName;

  late double quantity;

  late double retailPrice;

  double? wholesalePrice;

  double? minWholesaleQty;

  bool checkedOff = false;

  late DateTime updatedAt;
}

enum ReceiptStatus { queued, fetching, parsed, review, failed, done }

@collection
class PendingReceipt {
  Id id = Isar.autoIncrement;

  @Index(unique: true, replace: true)
  late String qrUrl;

  String? nfceKey;

  @enumerated
  late ReceiptStatus status;

  String? parsedPayloadJson;

  String? marketName;

  String? marketCnpj;

  String? errorMessage;

  late DateTime createdAt;

  late DateTime updatedAt;

  @Index()
  bool synced = false;
}

@collection
class AppUser {
  Id id = Isar.autoIncrement;

  late String localId;

  String? remoteId;

  String? email;

  String? displayName;

  String? uf;

  String? city;

  String? authToken;

  bool emailVerified = false;

  late DateTime updatedAt;
}

enum VoteType { confirm, reject }

enum FiscalLevel { bronze, silver, gold }

@collection
class PriceVote {
  Id id = Isar.autoIncrement;

  @Index()
  late int priceLogId;

  String? priceLogRemoteId;

  @Index()
  late String voterId;

  @enumerated
  late VoteType vote;

  late double weight;

  late DateTime createdAt;

  String? remoteId;

  @Index()
  bool synced = false;
}

@collection
class UserReputation {
  Id id = Isar.autoIncrement;

  @Index(unique: true, replace: true)
  late String userId;

  late int points;

  @enumerated
  late FiscalLevel level;

  late int validationsCount;

  late DateTime updatedAt;
}

@collection
class MarketReview {
  Id id = Isar.autoIncrement;

  @Index()
  late int marketId;

  String? marketRemoteId;

  late int stars;

  String? comment;

  /// Hash anônimo do votante — nunca exibir na UI.
  late String voterHash;

  late DateTime createdAt;

  String? remoteId;

  @Index()
  bool synced = false;
}

/// Snapshot de uma lista de compras finalizada (histórico local + sync).
@collection
class ShoppingList {
  Id id = Isar.autoIncrement;

  @Index(caseSensitive: false)
  late String name;

  int? marketId;

  String? marketName;

  /// JSON array com snapshot dos itens do carrinho.
  late String itemsJson;

  late double subtotal;

  late double savings;

  late int itemCount;

  late DateTime finishedAt;

  String? remoteId;

  @Index()
  late DateTime updatedAt;

  @Index()
  bool synced = false;
}

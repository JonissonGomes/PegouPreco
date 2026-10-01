import 'package:equatable/equatable.dart';

class ReviewItem extends Equatable {
  const ReviewItem({
    required this.description,
    required this.quantity,
    required this.unitPrice,
    this.wholesalePrice,
    this.minWholesaleQty,
    this.lineTotal,
  });

  final String description;
  final double quantity;
  final double unitPrice;
  final double? wholesalePrice;
  final double? minWholesaleQty;
  final double? lineTotal;

  ReviewItem copyWith({
    String? description,
    double? quantity,
    double? unitPrice,
    double? wholesalePrice,
    double? minWholesaleQty,
    double? lineTotal,
  }) {
    return ReviewItem(
      description: description ?? this.description,
      quantity: quantity ?? this.quantity,
      unitPrice: unitPrice ?? this.unitPrice,
      wholesalePrice: wholesalePrice ?? this.wholesalePrice,
      minWholesaleQty: minWholesaleQty ?? this.minWholesaleQty,
      lineTotal: lineTotal ?? this.lineTotal,
    );
  }

  Map<String, dynamic> toJson() => {
        'description': description,
        'quantity': quantity,
        'unitPrice': unitPrice,
        'wholesalePrice': wholesalePrice,
        'minWholesaleQty': minWholesaleQty,
        'lineTotal': lineTotal,
      };

  factory ReviewItem.fromJson(Map<String, dynamic> json) => ReviewItem(
        description: json['description'] as String? ?? '',
        quantity: (json['quantity'] as num?)?.toDouble() ?? 1,
        unitPrice: (json['unitPrice'] as num?)?.toDouble() ?? 0,
        wholesalePrice: (json['wholesalePrice'] as num?)?.toDouble(),
        minWholesaleQty: (json['minWholesaleQty'] as num?)?.toDouble(),
        lineTotal: (json['lineTotal'] as num?)?.toDouble(),
      );

  @override
  List<Object?> get props =>
      [description, quantity, unitPrice, wholesalePrice, minWholesaleQty];
}

enum ReviewSource { label, nfce }

class ReviewArgs {
  ReviewArgs({
    required this.items,
    required this.source,
    this.marketName,
    this.marketCnpj,
    this.marketUf,
    this.nfceKey,
    this.pendingReceiptId,
    this.addToCart = true,
  });

  final List<ReviewItem> items;
  final ReviewSource source;
  final String? marketName;
  final String? marketCnpj;
  final String? marketUf;
  final String? nfceKey;
  final int? pendingReceiptId;
  final bool addToCart;
}

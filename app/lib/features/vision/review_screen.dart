import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gap/gap.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:pegou_preco/core/constants/product_categories.dart';
import 'package:pegou_preco/core/di/providers.dart';
import 'package:pegou_preco/core/theme/app_theme.dart';
import 'package:pegou_preco/core/utils/money.dart';
import 'package:pegou_preco/core/widgets/app_button.dart';
import 'package:pegou_preco/core/widgets/brand_app_bar.dart';
import 'package:pegou_preco/core/widgets/product_item_card.dart';
import 'package:pegou_preco/data/local/schemas.dart';
import 'package:pegou_preco/features/market/market_picker_sheet.dart';
import 'package:pegou_preco/features/vision/models/review_item.dart';

export 'package:pegou_preco/features/vision/models/review_item.dart'
    show ReviewArgs, ReviewItem, ReviewSource;

class ReviewScreen extends ConsumerStatefulWidget {
  const ReviewScreen({super.key, required this.args});

  final ReviewArgs args;

  @override
  ConsumerState<ReviewScreen> createState() => _ReviewScreenState();
}

class _ReviewScreenState extends ConsumerState<ReviewScreen> {
  late List<ReviewItem> _items;
  final Map<int, String?> _categories = {};
  var _saving = false;
  String? _priceAlert;

  @override
  void initState() {
    super.initState();
    _items = List.of(widget.args.items);
    _computeAlert();
  }

  Future<void> _computeAlert() async {
    if (_items.length != 1) return;
    final item = _items.first;
    final match =
        await ref.read(productRepositoryProvider).findFuzzy(item.description);
    if (match == null) return;
    final stats = await ref
        .read(priceLogRepositoryProvider)
        .statsForProduct(match.product.id);
    if (stats == null || !mounted) return;
    final delta = ((item.unitPrice - stats.avgPrice) / stats.avgPrice) * 100;
    if (delta.abs() < 8) return;
    setState(() {
      _priceAlert = delta > 0
          ? 'Atenção: ${delta.toStringAsFixed(0)}% acima da média (${formatBrl(stats.avgPrice)})'
          : 'Boa: ${delta.abs().toStringAsFixed(0)}% abaixo da média (${formatBrl(stats.avgPrice)})';
    });
  }

  Future<void> _save() async {
    if (_items.isEmpty) return;
    setState(() => _saving = true);
    try {
      final productRepo = ref.read(productRepositoryProvider);
      final priceRepo = ref.read(priceLogRepositoryProvider);
      final marketRepo = ref.read(marketRepositoryProvider);
      final cartRepo = ref.read(cartRepositoryProvider);
      final pendingRepo = ref.read(pendingReceiptRepositoryProvider);

      int? marketId = ref.read(currentMarketIdProvider).valueOrNull;
      if (widget.args.marketName != null &&
          widget.args.marketName!.trim().isNotEmpty) {
        final market = await marketRepo.resolveOrCreate(
          name: widget.args.marketName!,
          cnpj: widget.args.marketCnpj,
          uf: widget.args.marketUf,
        );
        marketId = market.id;
        await ref.read(currentMarketIdProvider.notifier).setMarketId(marketId);
      } else if (marketId == null) {
        final picked = await showMarketPickerSheet(context);
        marketId = picked?.id;
      }

      final now = DateTime.now().toUtc();
      for (var i = 0; i < _items.length; i++) {
        final item = _items[i];
        if (item.description.trim().isEmpty || item.unitPrice <= 0) continue;
        final product = await productRepo.resolveOrCreate(item.description);
        final cat = _categories[i];
        if (cat != null) {
          await productRepo.setCategory(product.id, cat);
        }
        final log = PriceLog()
          ..productId = product.id
          ..marketId = marketId
          ..retailPrice = item.unitPrice
          ..wholesalePrice = item.wholesalePrice
          ..minWholesaleQty = item.minWholesaleQty
          ..source = widget.args.source == ReviewSource.nfce
              ? PriceSource.nfce
              : PriceSource.label
          ..capturedAt = now
          ..nfceKey = widget.args.source == ReviewSource.nfce &&
                  widget.args.nfceKey != null
              ? '${widget.args.nfceKey}_${product.id}'
              : null
          ..updatedAt = now
          ..synced = false
          ..trustLevel = TrustLevel.suspect;
        await priceRepo.put(log);

        if (widget.args.addToCart) {
          await cartRepo.upsert(
            product: product,
            quantity: item.quantity,
            retailPrice: item.unitPrice,
            wholesalePrice: item.wholesalePrice,
            minWholesaleQty: item.minWholesaleQty,
          );
        }
      }

      if (widget.args.pendingReceiptId != null) {
        final receipt =
            await pendingRepo.getById(widget.args.pendingReceiptId!);
        if (receipt != null) {
          receipt
            ..status = ReceiptStatus.done
            ..parsedPayloadJson =
                jsonEncode(_items.map((e) => e.toJson()).toList());
          await pendingRepo.update(receipt);
        }
      }

      HapticFeedback.mediumImpact();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              _priceAlert == null
                  ? '${_items.length} item(ns) salvos'
                  : 'Salvo. $_priceAlert',
            ),
          ),
        );
        context.go('/cart');
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final marketAsync = ref.watch(currentMarketProvider);

    return Scaffold(
      appBar: BrandAppBar(
        title: widget.args.source == ReviewSource.nfce
            ? 'Conferir NFC-e'
            : 'Conferir etiqueta',
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(
              AppTheme.pagePadding,
              12,
              AppTheme.pagePadding,
              0,
            ),
            child: marketAsync.when(
              loading: () => const SizedBox.shrink(),
              error: (_, __) => const SizedBox.shrink(),
              data: (market) => ListTile(
                contentPadding: EdgeInsets.zero,
                leading: const Icon(LucideIcons.store, color: AppTheme.navy),
                title: Text(
                  widget.args.marketName ??
                      market?.name ??
                      'Definir mercado atual',
                  style:
                      GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w700),
                ),
                subtitle: Text(
                  widget.args.marketCnpj ??
                      market?.cnpj ??
                      'Toque para escolher',
                ),
                trailing: const Icon(LucideIcons.chevronRight),
                onTap: () => showMarketPickerSheet(context),
              ),
            ),
          ),
          if (_priceAlert != null)
            Padding(
              padding: const EdgeInsets.symmetric(
                horizontal: AppTheme.pagePadding,
                vertical: 8,
              ),
              child: Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: const Color(0xFFFEF3C7),
                  borderRadius: BorderRadius.circular(AppTheme.controlRadius),
                ),
                child: Row(
                  children: [
                    const Icon(LucideIcons.alertTriangle,
                        size: 18, color: AppTheme.trustYellow),
                    const Gap(8),
                    Expanded(
                      child: Text(
                        _priceAlert!,
                        style: GoogleFonts.plusJakartaSans(
                          fontWeight: FontWeight.w600,
                          fontSize: 13,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          Expanded(
            child: ListView.separated(
              padding: const EdgeInsets.fromLTRB(
                AppTheme.pagePadding,
                8,
                AppTheme.pagePadding,
                16,
              ),
              itemCount: _items.length,
              separatorBuilder: (_, __) => const Gap(AppTheme.sectionGap),
              itemBuilder: (context, index) {
                final item = _items[index];
                return Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    ProductItemCard(
                      title: item.description,
                      subtitle:
                          'Qtd ${item.quantity} · ${formatBrl(item.unitPrice)}'
                          '${item.wholesalePrice != null ? ' · atacado ${formatBrl(item.wholesalePrice!)}' : ''}',
                      onTap: () async {
                        final edited = await _editItem(item);
                        if (edited != null) {
                          setState(() => _items[index] = edited);
                          _computeAlert();
                        }
                      },
                      trailing: IconButton(
                        icon: const Icon(LucideIcons.trash2,
                            color: Color(0xFFEF4444)),
                        onPressed: () =>
                            setState(() => _items.removeAt(index)),
                      ),
                    ),
                    const Gap(8),
                    Wrap(
                      spacing: 6,
                      runSpacing: 6,
                      children: kProductCategories.map((c) {
                        final selected = _categories[index] == c;
                        return ChoiceChip(
                          label: Text(c, style: const TextStyle(fontSize: 12)),
                          selected: selected,
                          selectedColor: AppTheme.yellow.withValues(alpha: 0.55),
                          onSelected: (_) =>
                              setState(() => _categories[index] = c),
                        );
                      }).toList(),
                    ),
                  ],
                );
              },
            ),
          ),
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(
                AppTheme.pagePadding,
                0,
                AppTheme.pagePadding,
                16,
              ),
              child: AppButton(
                label: _saving ? 'Salvando…' : 'Confirmar e salvar',
                icon: LucideIcons.check,
                onPressed: _saving || _items.isEmpty ? null : _save,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Future<ReviewItem?> _editItem(ReviewItem item) async {
    final nameCtrl = TextEditingController(text: item.description);
    final qtyCtrl = TextEditingController(text: item.quantity.toString());
    final retailCtrl =
        TextEditingController(text: item.unitPrice.toStringAsFixed(2));
    final wholesaleCtrl = TextEditingController(
      text: item.wholesalePrice?.toStringAsFixed(2) ?? '',
    );
    final minQtyCtrl = TextEditingController(
      text: item.minWholesaleQty?.toString() ?? '',
    );

    return showDialog<ReviewItem>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Editar item'),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: nameCtrl,
                decoration: const InputDecoration(labelText: 'Descrição'),
              ),
              TextField(
                controller: qtyCtrl,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(labelText: 'Quantidade'),
              ),
              TextField(
                controller: retailCtrl,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(labelText: 'Preço varejo'),
              ),
              TextField(
                controller: wholesaleCtrl,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(labelText: 'Preço atacado'),
              ),
              TextField(
                controller: minQtyCtrl,
                keyboardType: TextInputType.number,
                decoration:
                    const InputDecoration(labelText: 'Qtd mín. atacado'),
              ),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Cancelar'),
          ),
          FilledButton(
            onPressed: () {
              Navigator.pop(
                ctx,
                item.copyWith(
                  description: nameCtrl.text.trim(),
                  quantity: double.tryParse(
                        qtyCtrl.text.replaceAll(',', '.'),
                      ) ??
                      item.quantity,
                  unitPrice: parseBrl(retailCtrl.text) ?? item.unitPrice,
                  wholesalePrice: wholesaleCtrl.text.trim().isEmpty
                      ? null
                      : parseBrl(wholesaleCtrl.text),
                  minWholesaleQty: minQtyCtrl.text.trim().isEmpty
                      ? null
                      : double.tryParse(
                          minQtyCtrl.text.replaceAll(',', '.'),
                        ),
                ),
              );
            },
            child: const Text('OK'),
          ),
        ],
      ),
    );
  }
}

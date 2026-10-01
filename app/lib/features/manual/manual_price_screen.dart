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
import 'package:pegou_preco/core/widgets/app_text_field.dart';
import 'package:pegou_preco/core/widgets/brand_app_bar.dart';
import 'package:pegou_preco/data/local/schemas.dart';
import 'package:pegou_preco/features/market/market_picker_sheet.dart';

class ManualPriceScreen extends ConsumerStatefulWidget {
  const ManualPriceScreen({super.key});

  @override
  ConsumerState<ManualPriceScreen> createState() => _ManualPriceScreenState();
}

class _ManualPriceScreenState extends ConsumerState<ManualPriceScreen> {
  final _nameCtrl = TextEditingController();
  final _priceCtrl = TextEditingController();
  final _wholesaleCtrl = TextEditingController();
  final _minQtyCtrl = TextEditingController();
  String? _category;
  var _saving = false;
  String? _alert;

  Future<void> _checkAlert(String name, double price) async {
    final match =
        await ref.read(productRepositoryProvider).findFuzzy(name);
    if (match == null) {
      setState(() => _alert = null);
      return;
    }
    final stats = await ref
        .read(priceLogRepositoryProvider)
        .statsForProduct(match.product.id);
    if (stats == null) {
      setState(() => _alert = null);
      return;
    }
    final delta = ((price - stats.avgPrice) / stats.avgPrice) * 100;
    if (delta.abs() < 8) {
      setState(() => _alert = null);
      return;
    }
    setState(() {
      _alert = delta > 0
          ? 'Atenção: ${delta.toStringAsFixed(0)}% acima da sua média (${formatBrl(stats.avgPrice)})'
          : 'Boa: ${delta.abs().toStringAsFixed(0)}% abaixo da sua média (${formatBrl(stats.avgPrice)})';
    });
  }

  Future<void> _save() async {
    final name = _nameCtrl.text.trim();
    final price = parseBrl(_priceCtrl.text);
    if (name.isEmpty || price == null || price <= 0) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Informe produto e preço')),
      );
      return;
    }

    setState(() => _saving = true);
    try {
      await _checkAlert(name, price);
      final market = await ref.read(currentMarketProvider.future);
      if (market == null && mounted) {
        final picked = await showMarketPickerSheet(context);
        if (picked == null) return;
      }
      final marketId = ref.read(currentMarketIdProvider).valueOrNull;

      final product =
          await ref.read(productRepositoryProvider).resolveOrCreate(name);
      if (_category != null && product.category != _category) {
        await ref
            .read(productRepositoryProvider)
            .setCategory(product.id, _category);
      }

      final now = DateTime.now().toUtc();
      final log = PriceLog()
        ..productId = product.id
        ..marketId = marketId
        ..retailPrice = price
        ..wholesalePrice = _wholesaleCtrl.text.trim().isEmpty
            ? null
            : parseBrl(_wholesaleCtrl.text)
        ..minWholesaleQty = _minQtyCtrl.text.trim().isEmpty
            ? null
            : double.tryParse(_minQtyCtrl.text.replaceAll(',', '.'))
        ..source = PriceSource.manual
        ..capturedAt = now
        ..updatedAt = now
        ..synced = false
        ..trustLevel = TrustLevel.suspect;

      await ref.read(priceLogRepositoryProvider).put(log);
      await ref.read(cartRepositoryProvider).upsert(
            product: product,
            quantity: 1,
            retailPrice: price,
            wholesalePrice: log.wholesalePrice,
            minWholesaleQty: log.minWholesaleQty,
          );

      HapticFeedback.mediumImpact();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            _alert == null
                ? 'Preço manual salvo'
                : 'Salvo. $_alert',
          ),
        ),
      );
      context.pop();
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  void dispose() {
    _nameCtrl.dispose();
    _priceCtrl.dispose();
    _wholesaleCtrl.dispose();
    _minQtyCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final marketAsync = ref.watch(currentMarketProvider);

    return Scaffold(
      appBar: const BrandAppBar(title: 'Preço manual'),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(
          AppTheme.pagePadding,
          16,
          AppTheme.pagePadding,
          40,
        ),
        children: [
          marketAsync.when(
            loading: () => const SizedBox.shrink(),
            error: (_, __) => const SizedBox.shrink(),
            data: (market) => ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const Icon(LucideIcons.store, color: AppTheme.navy),
              title: Text(
                market?.name ?? 'Definir mercado atual',
                style: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w700),
              ),
              subtitle: Text(
                market == null
                    ? 'Toque para escolher'
                    : (market.cnpj ?? 'Mercado selecionado'),
              ),
              trailing: const Icon(LucideIcons.chevronRight),
              onTap: () => showMarketPickerSheet(context),
            ),
          ),
          const Gap(12),
          AppTextField(
            controller: _nameCtrl,
            label: 'Produto',
            hint: 'Nome do produto',
            prefixIcon: LucideIcons.package,
            onChanged: (v) {
              final p = parseBrl(_priceCtrl.text);
              if (p != null) _checkAlert(v, p);
            },
          ),
          const Gap(12),
          Text(
            'Categoria',
            style: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w700),
          ),
          const Gap(8),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: kProductCategories.map((c) {
              final selected = _category == c;
              return ChoiceChip(
                label: Text(c),
                selected: selected,
                selectedColor: AppTheme.yellow.withValues(alpha: 0.55),
                onSelected: (_) => setState(() => _category = c),
              );
            }).toList(),
          ),
          const Gap(12),
          AppTextField(
            controller: _priceCtrl,
            label: 'Preço varejo',
            keyboardType: TextInputType.number,
            prefixIcon: LucideIcons.badgeDollarSign,
            onChanged: (v) {
              final p = parseBrl(v);
              if (p != null) _checkAlert(_nameCtrl.text, p);
            },
          ),
          if (_alert != null) ...[
            const Gap(10),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: const Color(0xFFFEF3C7),
                borderRadius: BorderRadius.circular(AppTheme.controlRadius),
              ),
              child: Row(
                children: [
                  const Icon(LucideIcons.alertTriangle,
                      color: AppTheme.trustYellow, size: 18),
                  const Gap(8),
                  Expanded(
                    child: Text(
                      _alert!,
                      style: GoogleFonts.plusJakartaSans(
                        fontWeight: FontWeight.w600,
                        fontSize: 13,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
          const Gap(12),
          AppTextField(
            controller: _wholesaleCtrl,
            label: 'Preço atacado (opcional)',
            keyboardType: TextInputType.number,
            prefixIcon: LucideIcons.tags,
          ),
          const Gap(12),
          AppTextField(
            controller: _minQtyCtrl,
            label: 'Qtd mín. atacado',
            keyboardType: TextInputType.number,
            prefixIcon: LucideIcons.hash,
          ),
          const Gap(24),
          AppButton(
            label: _saving ? 'Salvando…' : 'Salvar',
            icon: LucideIcons.check,
            onPressed: _saving ? null : _save,
          ),
        ],
      ),
    );
  }
}

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gap/gap.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:pegou_preco/core/di/providers.dart';
import 'package:pegou_preco/core/theme/app_theme.dart';
import 'package:pegou_preco/core/utils/money.dart';
import 'package:pegou_preco/core/utils/pricing.dart';
import 'package:pegou_preco/core/widgets/empty_state.dart';
import 'package:pegou_preco/data/local/cart_repository.dart';
import 'package:pegou_preco/data/local/price_log_repository.dart';
import 'package:pegou_preco/data/local/schemas.dart';
import 'package:pegou_preco/features/cart/cart_item_edit_sheet.dart';
import 'package:pegou_preco/features/cart/list_session_actions.dart';
import 'package:pegou_preco/features/cart/start_list_sheet.dart';

final cartItemsProvider = StreamProvider<List<CartItem>>((ref) {
  return ref.watch(cartRepositoryProvider).watchAll();
});

final _activeMarketNameProvider = FutureProvider<String?>((ref) async {
  final active = ref.watch(activeShoppingListProvider).valueOrNull;
  if (active != null) {
    final m =
        await ref.watch(marketRepositoryProvider).getById(active.marketId);
    if (m != null) return m.name;
  }
  final current = await ref.watch(currentMarketProvider.future);
  return current?.name;
});

const _monthPt = [
  'jan.',
  'fev.',
  'mar.',
  'abr.',
  'mai.',
  'jun.',
  'jul.',
  'ago.',
  'set.',
  'out.',
  'nov.',
  'dez.',
];

String _shortMonth(DateTime dt) => _monthPt[dt.toLocal().month - 1];

class CartScreen extends ConsumerWidget {
  const CartScreen({super.key});

  Future<void> _confirmClear(BuildContext context, CartRepository repo) async {
    final ok = await showModalBottomSheet<bool>(
      context: context,
      showDragHandle: true,
      builder: (ctx) => Padding(
        padding: const EdgeInsets.fromLTRB(24, 8, 24, 32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              'Limpar carrinho?',
              style: GoogleFonts.plusJakartaSans(
                fontSize: 20,
                fontWeight: FontWeight.w800,
              ),
            ),
            const Gap(8),
            Text(
              'Todos os itens serão removidos. Essa ação não desfaz.',
              style: GoogleFonts.plusJakartaSans(color: AppTheme.muted),
            ),
            const Gap(20),
            FilledButton(
              onPressed: () => Navigator.pop(ctx, true),
              style: FilledButton.styleFrom(
                backgroundColor: const Color(0xFFEF4444),
              ),
              child: const Text('Limpar tudo'),
            ),
            const Gap(8),
            TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Cancelar'),
            ),
          ],
        ),
      ),
    );
    if (ok == true) await repo.clear();
  }

  Future<void> _finalize(BuildContext context, WidgetRef ref) async {
    final active = ref.read(activeShoppingListProvider).valueOrNull;
    final items = await ref.read(cartRepositoryProvider).all();
    if (!context.mounted) return;

    if (items.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Carrinho vazio')),
      );
      return;
    }

    if (active == null) {
      final started =
          await showStartListSheet(context, barrierDismissible: true);
      if (started != true || !context.mounted) return;
    }

    final list = ref.read(activeShoppingListProvider).valueOrNull;
    final listName = list?.name ?? 'Lista';

    final ok = await showModalBottomSheet<bool>(
      context: context,
      showDragHandle: true,
      builder: (ctx) => Padding(
        padding: const EdgeInsets.fromLTRB(24, 8, 24, 32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              'Finalizar compras?',
              style: GoogleFonts.plusJakartaSans(
                fontSize: 20,
                fontWeight: FontWeight.w800,
              ),
            ),
            const Gap(8),
            Text(
              'A lista "$listName" será salva no histórico e o carrinho '
              'será limpo.',
              style: GoogleFonts.plusJakartaSans(color: AppTheme.muted),
            ),
            const Gap(20),
            FilledButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('Finalizar e salvar'),
            ),
            const Gap(8),
            TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Cancelar'),
            ),
          ],
        ),
      ),
    );
    if (ok != true) return;

    await finalizeActiveList(ref);
    if (!context.mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Lista salva no histórico')),
    );
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final itemsAsync = ref.watch(cartItemsProvider);
    final cartRepo = ref.watch(cartRepositoryProvider);
    final active = ref.watch(activeShoppingListProvider).valueOrNull;
    final marketName = ref.watch(_activeMarketNameProvider).valueOrNull;
    final topPad = MediaQuery.paddingOf(context).top;

    return Scaffold(
      backgroundColor: const Color(0xFFF3F4F6),
      body: itemsAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('Erro: $e')),
        data: (items) {
          final totals = cartRepo.computeTotals(items);
          final pending = totals.itemCount - totals.checkedCount;

          if (items.isEmpty) {
            return Column(
              children: [
                _YellowHeader(
                  topPad: topPad,
                  listName: active?.name ?? 'Nova lista',
                  marketName: marketName,
                  onLists: () => context.push('/shopping-lists'),
                  onHistory: () => context.push('/history'),
                  onSync: () => ref.read(syncWorkerProvider).runFullSync(),
                  onClear: () => _confirmClear(context, cartRepo),
                ),
                Expanded(
                  child: EmptyState(
                    icon: LucideIcons.shoppingCart,
                    title: active == null
                        ? 'Nenhuma lista ativa'
                        : 'Carrinho vazio',
                    message: active == null
                        ? 'Inicie uma lista de compras para começar.'
                        : 'Capture uma etiqueta para adicionar itens.',
                    actionLabel:
                        active == null ? 'Nova lista' : 'Ir para Capturar',
                    onAction: () async {
                      if (active == null) {
                        await showStartListSheet(context);
                      } else {
                        context.go('/capture');
                      }
                    },
                  ),
                ),
              ],
            );
          }

          return Column(
            children: [
              _YellowHeader(
                topPad: topPad,
                listName: active?.name ?? 'Lista em andamento',
                marketName: marketName,
                onLists: () => context.push('/shopping-lists'),
                onHistory: () => context.push('/history'),
                onSync: () => ref.read(syncWorkerProvider).runFullSync(),
                onClear: () => _confirmClear(context, cartRepo),
              ),
              _NavyTotals(
                subtotal: totals.subtotal,
                savings: totals.savings,
                checked: totals.checkedCount,
                total: totals.itemCount,
              ),
              Expanded(
                child: Column(
                  children: [
                    Padding(
                      padding: const EdgeInsets.fromLTRB(20, 16, 20, 8),
                      child: Row(
                        children: [
                          Text(
                            'Itens da lista',
                            style: GoogleFonts.plusJakartaSans(
                              fontSize: 16,
                              fontWeight: FontWeight.w800,
                              color: AppTheme.navy,
                            ),
                          ),
                          const Spacer(),
                          Text(
                            '$pending pendentes',
                            style: GoogleFonts.plusJakartaSans(
                              fontSize: 13,
                              fontWeight: FontWeight.w600,
                              color: AppTheme.muted,
                            ),
                          ),
                        ],
                      ),
                    ),
                    Expanded(
                      child: ListView.separated(
                        physics: const BouncingScrollPhysics(),
                        padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
                        itemCount: items.length,
                        separatorBuilder: (_, __) => const Gap(10),
                        itemBuilder: (context, index) =>
                            _CartItemCard(item: items[index]),
                      ),
                    ),
                  ],
                ),
              ),
              _FinalizeButton(
                subtotal: totals.subtotal,
                onPressed: () => _finalize(context, ref),
              ),
            ],
          );
        },
      ),
    );
  }
}

class _YellowHeader extends StatelessWidget {
  const _YellowHeader({
    required this.topPad,
    required this.listName,
    required this.marketName,
    required this.onLists,
    required this.onHistory,
    required this.onSync,
    required this.onClear,
  });

  final double topPad;
  final String listName;
  final String? marketName;
  final VoidCallback onLists;
  final VoidCallback onHistory;
  final VoidCallback onSync;
  final VoidCallback onClear;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      color: AppTheme.yellowBright,
      padding: EdgeInsets.fromLTRB(16, topPad + 8, 8, 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              ClipRRect(
                borderRadius: BorderRadius.circular(10),
                child: Image.asset(
                  'assets/branding/logo.png',
                  height: 36,
                  fit: BoxFit.contain,
                  errorBuilder: (_, __, ___) => Image.asset(
                    'assets/branding/app_icon.png',
                    width: 36,
                    height: 36,
                  ),
                ),
              ),
              const Spacer(),
              IconButton(
                tooltip: 'Listas salvas',
                onPressed: onLists,
                icon: const Icon(LucideIcons.clipboardList, color: AppTheme.navy),
              ),
              IconButton(
                tooltip: 'Histórico',
                onPressed: onHistory,
                icon: const Icon(LucideIcons.history, color: AppTheme.navy),
              ),
              IconButton(
                tooltip: 'Sincronizar',
                onPressed: onSync,
                icon: const Icon(LucideIcons.refreshCw, color: AppTheme.navy),
              ),
              IconButton(
                tooltip: 'Limpar',
                onPressed: onClear,
                icon: const Icon(LucideIcons.trash2, color: AppTheme.navy),
              ),
            ],
          ),
          const Gap(10),
          Text(
            listName,
            style: GoogleFonts.plusJakartaSans(
              fontSize: 26,
              fontWeight: FontWeight.w800,
              color: AppTheme.navy,
              height: 1.15,
              letterSpacing: -0.4,
            ),
          ),
          const Gap(6),
          Row(
            children: [
              const Icon(LucideIcons.mapPin, size: 15, color: AppTheme.navy),
              const Gap(4),
              Expanded(
                child: Text(
                  (marketName ?? 'Mercado não definido').toUpperCase(),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: GoogleFonts.plusJakartaSans(
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                    color: AppTheme.navy,
                    letterSpacing: 0.3,
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _NavyTotals extends StatelessWidget {
  const _NavyTotals({
    required this.subtotal,
    required this.savings,
    required this.checked,
    required this.total,
  });

  final double subtotal;
  final double savings;
  final int checked;
  final int total;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      color: AppTheme.navy,
      padding: const EdgeInsets.fromLTRB(20, 14, 20, 14),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'TOTAL DA LISTA',
                  style: GoogleFonts.plusJakartaSans(
                    color: Colors.white70,
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 0.6,
                  ),
                ),
                Text(
                  formatBrl(subtotal),
                  style: GoogleFonts.plusJakartaSans(
                    color: Colors.white,
                    fontSize: 28,
                    fontWeight: FontWeight.w800,
                    letterSpacing: -0.5,
                    height: 1.15,
                  ),
                ),
              ],
            ),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                decoration: BoxDecoration(
                  color: AppTheme.yellowBright,
                  borderRadius: BorderRadius.circular(999),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(
                      LucideIcons.trendingDown,
                      size: 14,
                      color: AppTheme.navy,
                    ),
                    const Gap(4),
                    Text(
                      '${formatBrl(savings)} economizados',
                      style: GoogleFonts.plusJakartaSans(
                        color: AppTheme.navy,
                        fontSize: 11,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ],
                ),
              ),
              const Gap(6),
              Text(
                '$checked / $total ITENS',
                style: GoogleFonts.plusJakartaSans(
                  color: Colors.white,
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 0.4,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _FinalizeButton extends StatelessWidget {
  const _FinalizeButton({
    required this.subtotal,
    required this.onPressed,
  });

  final double subtotal;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 72),
        child: SizedBox(
          width: double.infinity,
          height: 54,
          child: FilledButton.icon(
            onPressed: onPressed,
            style: FilledButton.styleFrom(
              backgroundColor: AppTheme.navy,
              foregroundColor: Colors.white,
              elevation: 2,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(16),
              ),
            ),
            icon: const Icon(LucideIcons.check, size: 20),
            label: Text(
              'Finalizar compras · ${formatBrl(subtotal)}',
              style: GoogleFonts.plusJakartaSans(
                fontWeight: FontWeight.w800,
                fontSize: 15,
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _CartItemCard extends ConsumerWidget {
  const _CartItemCard({required this.item});
  final CartItem item;

  Future<void> _edit(BuildContext context, WidgetRef ref) async {
    final result = await showCartItemEditSheet(context, item: item);
    if (result == null) return;
    await ref.read(cartRepositoryProvider).updateItem(
          id: item.id,
          productName: result.productName,
          quantity: result.quantity,
          retailPrice: result.retailPrice,
          wholesalePrice: result.wholesalePrice,
          minWholesaleQty: result.minWholesaleQty,
        );
    if (result.productName != item.productName) {
      await ref
          .read(productRepositoryProvider)
          .rename(item.productId, result.productName);
    }
  }

  Future<void> _applyBetterPrice(
    WidgetRef ref,
    CartPriceContext ctx,
  ) async {
    final best = ctx.bestPrice;
    if (best == null) return;
    HapticFeedback.mediumImpact();
    await ref.read(cartRepositoryProvider).updateItem(
          id: item.id,
          productName: item.productName,
          quantity: item.quantity,
          retailPrice: best,
          wholesalePrice: item.wholesalePrice,
          minWholesaleQty: item.minWholesaleQty,
        );
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final repo = ref.watch(cartRepositoryProvider);
    final marketId =
        ref.watch(activeShoppingListProvider).valueOrNull?.marketId;
    final unit = effectiveUnitPrice(
      quantity: item.quantity,
      retailPrice: item.retailPrice,
      wholesalePrice: item.wholesalePrice,
      minWholesaleQty: item.minWholesaleQty,
    );
    final total = lineTotal(
      quantity: item.quantity,
      retailPrice: item.retailPrice,
      wholesalePrice: item.wholesalePrice,
      minWholesaleQty: item.minWholesaleQty,
    );

    final ctxAsync = ref.watch(_cartContextProvider((
      productId: item.productId,
      unit: unit,
      marketId: marketId,
    )));

    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onLongPress: () => _edit(context, ref),
        child: Container(
          padding: const EdgeInsets.fromLTRB(12, 12, 14, 12),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: const Color(0xFFE5E7EB)),
          ),
          child: ctxAsync.when(
            loading: () => _ItemBody(
              item: item,
              unit: unit,
              total: total,
              ctx: null,
              currentMarketId: marketId,
              onToggle: () => repo.toggleChecked(item.id),
              onEdit: () => _edit(context, ref),
              onSwap: null,
            ),
            error: (_, __) => _ItemBody(
              item: item,
              unit: unit,
              total: total,
              ctx: null,
              currentMarketId: marketId,
              onToggle: () => repo.toggleChecked(item.id),
              onEdit: () => _edit(context, ref),
              onSwap: null,
            ),
            data: (ctx) => _ItemBody(
              item: item,
              unit: unit,
              total: total,
              ctx: ctx,
              currentMarketId: marketId,
              onToggle: () => repo.toggleChecked(item.id),
              onEdit: () => _edit(context, ref),
              onSwap: () => _applyBetterPrice(ref, ctx),
            ),
          ),
        ),
      ),
    );
  }
}

typedef _CtxKey = ({int productId, double unit, int? marketId});

final _cartContextProvider =
    FutureProvider.family<CartPriceContext, _CtxKey>((ref, key) {
  return ref.watch(priceLogRepositoryProvider).cartContextForProduct(
        productId: key.productId,
        currentUnitPrice: key.unit,
        currentMarketId: key.marketId,
      );
});

class _ItemBody extends StatelessWidget {
  const _ItemBody({
    required this.item,
    required this.unit,
    required this.total,
    required this.ctx,
    required this.currentMarketId,
    required this.onToggle,
    required this.onEdit,
    required this.onSwap,
  });

  final CartItem item;
  final double unit;
  final double total;
  final CartPriceContext? ctx;
  final int? currentMarketId;
  final VoidCallback onToggle;
  final VoidCallback onEdit;
  final VoidCallback? onSwap;

  @override
  Widget build(BuildContext context) {
    final previous = ctx?.previousPrice;
    final previousAt = ctx?.previousAt;
    final best = ctx?.bestPrice;
    final bestMarket = ctx?.bestMarketName;
    final bestMarketId = ctx?.bestMarketId;

    final pctBelow = previous != null && previous > 0
        ? ((previous - unit) / previous) * 100
        : null;
    final showBelowBadge = pctBelow != null && pctBelow >= 1;

    final showCompare =
        (previous != null) || (best != null && best + 0.009 < unit);

    final canSwap = best != null &&
        bestMarket != null &&
        best + 0.05 < unit &&
        (bestMarketId == null || bestMarketId != currentMarketId);
    final swapPrice = canSwap ? best : null;
    final swapMarket = canSwap ? bestMarket : null;
    final swapSave =
        swapPrice == null ? 0.0 : (unit - swapPrice) * item.quantity;

    final qtyLabel = item.quantity == item.quantity.roundToDouble()
        ? '${formatQty(item.quantity)} unidade${item.quantity > 1 ? 's' : ''}'
        : '${formatQty(item.quantity)} un.';

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            SizedBox(
              width: 28,
              height: 28,
              child: Checkbox(
                value: item.checkedOff,
                activeColor: AppTheme.navy,
                side: const BorderSide(color: Color(0xFF93C5FD), width: 1.6),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(5),
                ),
                onChanged: (_) => onToggle(),
              ),
            ),
            const Gap(8),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    item.productName,
                    style: GoogleFonts.plusJakartaSans(
                      fontWeight: FontWeight.w800,
                      fontSize: 14,
                      height: 1.25,
                      color: AppTheme.navy,
                      decoration: item.checkedOff
                          ? TextDecoration.lineThrough
                          : null,
                      decorationColor: AppTheme.muted,
                    ),
                  ),
                  const Gap(3),
                  Text(
                    '$qtyLabel · ${formatBrl(unit)}/un',
                    style: GoogleFonts.plusJakartaSans(
                      fontSize: 12,
                      fontWeight: FontWeight.w500,
                      color: AppTheme.muted,
                      decoration: item.checkedOff
                          ? TextDecoration.lineThrough
                          : null,
                    ),
                  ),
                ],
              ),
            ),
            const Gap(8),
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                GestureDetector(
                  onTap: onEdit,
                  child: Text(
                    formatBrl(total),
                    style: GoogleFonts.plusJakartaSans(
                      fontWeight: FontWeight.w800,
                      fontSize: 16,
                      color: AppTheme.navy,
                    ),
                  ),
                ),
                if (showBelowBadge) ...[
                  const Gap(4),
                  Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
                    decoration: BoxDecoration(
                      color: const Color(0xFFDCFCE7),
                      borderRadius: BorderRadius.circular(999),
                    ),
                    child: Text(
                      '${pctBelow.toStringAsFixed(0)}% ABAIXO DA ÚLTIMA',
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 9,
                        fontWeight: FontWeight.w800,
                        color: const Color(0xFF166534),
                        letterSpacing: 0.2,
                      ),
                    ),
                  ),
                ],
              ],
            ),
          ],
        ),
        if (swapPrice != null && swapMarket != null) ...[
          const Gap(10),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.fromLTRB(12, 10, 8, 10),
            decoration: BoxDecoration(
              color: AppTheme.yellowBright,
              borderRadius: BorderRadius.circular(12),
            ),
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        '${formatBrl(swapPrice)} no $swapMarket',
                        style: GoogleFonts.plusJakartaSans(
                          fontWeight: FontWeight.w800,
                          fontSize: 13,
                          color: AppTheme.navy,
                        ),
                      ),
                      Text(
                        'Economize ${formatBrl(swapSave)} nesta compra',
                        style: GoogleFonts.plusJakartaSans(
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                          color: AppTheme.navy.withValues(alpha: 0.85),
                        ),
                      ),
                    ],
                  ),
                ),
                const Gap(8),
                FilledButton(
                  onPressed: onSwap,
                  style: FilledButton.styleFrom(
                    backgroundColor: AppTheme.navy,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(
                      horizontal: 14,
                      vertical: 10,
                    ),
                    minimumSize: Size.zero,
                    tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(10),
                    ),
                  ),
                  child: Text(
                    'Trocar',
                    style: GoogleFonts.plusJakartaSans(
                      fontWeight: FontWeight.w800,
                      fontSize: 13,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ] else if (showCompare) ...[
          const Gap(10),
          Row(
            children: [
              if (previous != null)
                Expanded(
                  child: _CompareBox(
                    label: 'COMPRA ANTERIOR',
                    value:
                        '${formatBrl(previous)} · ${_shortMonth(previousAt ?? DateTime.now())}',
                    highlighted: false,
                  ),
                ),
              if (previous != null && best != null && best + 0.009 < unit)
                const Gap(8),
              if (best != null && best + 0.009 < unit)
                Expanded(
                  child: _CompareBox(
                    label: 'MENOR PREÇO',
                    value: bestMarket != null
                        ? '${formatBrl(best)} · $bestMarket'
                        : formatBrl(best),
                    highlighted: true,
                  ),
                ),
            ],
          ),
        ],
      ],
    );
  }
}

class _CompareBox extends StatelessWidget {
  const _CompareBox({
    required this.label,
    required this.value,
    required this.highlighted,
  });

  final String label;
  final String value;
  final bool highlighted;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      decoration: BoxDecoration(
        color: highlighted
            ? const Color(0xFFFFF3C4)
            : const Color(0xFFF3F4F6),
        borderRadius: BorderRadius.circular(10),
        border: highlighted
            ? Border.all(color: const Color(0xFFF59E0B), width: 1.2)
            : null,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: GoogleFonts.plusJakartaSans(
              fontSize: 10,
              fontWeight: FontWeight.w700,
              color: AppTheme.muted,
              letterSpacing: 0.4,
            ),
          ),
          const Gap(2),
          Text(
            value,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: GoogleFonts.plusJakartaSans(
              fontSize: 12,
              fontWeight: FontWeight.w800,
              color: AppTheme.navy,
            ),
          ),
        ],
      ),
    );
  }
}

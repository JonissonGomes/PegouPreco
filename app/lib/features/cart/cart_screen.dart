import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gap/gap.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:pegou_preco/core/di/providers.dart';
import 'package:pegou_preco/core/routing/app_router.dart';
import 'package:pegou_preco/core/theme/app_theme.dart';
import 'package:pegou_preco/core/utils/money.dart';
import 'package:pegou_preco/core/utils/pricing.dart';
import 'package:pegou_preco/core/widgets/app_screen_chrome.dart';
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

  List<AppHeaderAction> _headerActions(
    BuildContext context,
    WidgetRef ref,
    CartRepository cartRepo,
  ) {
    return [
      AppHeaderAction(
        icon: LucideIcons.clipboardList,
        label: 'Listas salvas',
        onTap: () => context.push('/shopping-lists'),
      ),
      AppHeaderAction(
        icon: LucideIcons.history,
        label: 'Histórico de preços',
        onTap: () => context.push('/history'),
      ),
      AppHeaderAction(
        icon: LucideIcons.refreshCw,
        label: 'Sincronizar',
        onTap: () => ref.read(syncWorkerProvider).runFullSync(),
      ),
      AppHeaderAction(
        icon: LucideIcons.trash2,
        label: 'Limpar carrinho',
        onTap: () => _confirmClear(context, cartRepo),
        destructive: true,
      ),
    ];
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final itemsAsync = ref.watch(cartItemsProvider);
    final cartRepo = ref.watch(cartRepositoryProvider);
    final active = ref.watch(activeShoppingListProvider).valueOrNull;
    final marketName = ref.watch(_activeMarketNameProvider).valueOrNull;
    final actions = _headerActions(context, ref, cartRepo);
    final navVisible = ref.watch(bottomNavVisibleProvider);
    final bottomClearance = navVisible ? appBottomNavClearance : 16.0;

    return Scaffold(
      backgroundColor: appScreenBg,
      floatingActionButton: Padding(
        // Acima do botão Finalizar (+ barra inferior quando visível).
        padding: EdgeInsets.only(bottom: bottomClearance + 44),
        child: AppActionsFab(
          heroTag: 'cart_actions_fab',
          actions: actions,
        ),
      ),
      floatingActionButtonLocation: FloatingActionButtonLocation.endFloat,
      body: itemsAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('Erro: $e')),
        data: (items) {
          final totals = cartRepo.computeTotals(items);
          final pending = totals.itemCount - totals.checkedCount;

          if (items.isEmpty) {
            return Column(
              children: [
                _CartHeader(
                  listName: active?.name ?? 'Nova lista',
                  marketName: marketName,
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
              _CartHeader(
                listName: active?.name ?? 'Lista em andamento',
                marketName: marketName,
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
                    AppSectionTitle(
                      title: 'Itens da lista',
                      trailing: '$pending pendentes',
                    ),
                    Expanded(
                      child: ListView.separated(
                        physics: const BouncingScrollPhysics(),
                        padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
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
                bottomClearance: bottomClearance,
                onPressed: () => _finalize(context, ref),
              ),
            ],
          );
        },
      ),
    );
  }
}

class _CartHeader extends StatelessWidget {
  const _CartHeader({
    required this.listName,
    required this.marketName,
  });

  final String listName;
  final String? marketName;

  @override
  Widget build(BuildContext context) {
    return AppScreenHeader(
      title: listName,
      subtitle: marketName ?? 'Mercado não definido',
      subtitleIcon: LucideIcons.mapPin,
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
    return AppScreenNavyBar(
      label: 'total · $checked/$total itens',
      value: formatBrl(subtotal),
      trailing: Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
        decoration: BoxDecoration(
          color: AppTheme.yellowBright,
          borderRadius: BorderRadius.circular(999),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(
              LucideIcons.trendingDown,
              size: 12,
              color: AppTheme.navy,
            ),
            const Gap(3),
            Text(
              formatBrl(savings),
              style: GoogleFonts.plusJakartaSans(
                color: AppTheme.navy,
                fontSize: 11,
                fontWeight: FontWeight.w800,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _FinalizeButton extends StatelessWidget {
  const _FinalizeButton({
    required this.subtotal,
    required this.bottomClearance,
    required this.onPressed,
  });

  final double subtotal;
  final double bottomClearance;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    // Colado logo acima da barra flutuante (extendBody no shell).
    return Padding(
      padding: EdgeInsets.fromLTRB(16, 4, 16, bottomClearance),
      child: SizedBox(
        width: double.infinity,
        height: 48,
        child: FilledButton.icon(
          onPressed: onPressed,
          style: FilledButton.styleFrom(
            backgroundColor: AppTheme.navy,
            foregroundColor: Colors.white,
            elevation: 2,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(14),
            ),
          ),
          icon: const Icon(LucideIcons.check, size: 18),
          label: Text(
            'Finalizar · ${formatBrl(subtotal)}',
            style: GoogleFonts.plusJakartaSans(
              fontWeight: FontWeight.w800,
              fontSize: 14,
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
              onToggle: () => repo.toggleChecked(item.id),
              onEdit: () => _edit(context, ref),
            ),
            error: (_, __) => _ItemBody(
              item: item,
              unit: unit,
              total: total,
              ctx: null,
              onToggle: () => repo.toggleChecked(item.id),
              onEdit: () => _edit(context, ref),
            ),
            data: (ctx) => _ItemBody(
              item: item,
              unit: unit,
              total: total,
              ctx: ctx,
              onToggle: () => repo.toggleChecked(item.id),
              onEdit: () => _edit(context, ref),
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
    required this.onToggle,
    required this.onEdit,
  });

  final CartItem item;
  final double unit;
  final double total;
  final CartPriceContext? ctx;
  final VoidCallback onToggle;
  final VoidCallback onEdit;

  @override
  Widget build(BuildContext context) {
    final previous = ctx?.previousPrice;
    final previousAt = ctx?.previousAt;
    final best = ctx?.bestPrice;
    final bestMarket = ctx?.bestMarketName;

    final pctBelow = previous != null && previous > 0
        ? ((previous - unit) / previous) * 100
        : null;
    final showBelowBadge = pctBelow != null && pctBelow >= 1;

    // Comparativo só informativo — sem "Trocar" (não faz sentido na compra atual).
    final showCompare =
        (previous != null) || (best != null && best + 0.009 < unit);

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
            const Gap(4),
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      formatBrl(total),
                      style: GoogleFonts.plusJakartaSans(
                        fontWeight: FontWeight.w800,
                        fontSize: 16,
                        color: AppTheme.navy,
                      ),
                    ),
                    IconButton(
                      tooltip: 'Editar item',
                      onPressed: onEdit,
                      visualDensity: VisualDensity.compact,
                      padding: EdgeInsets.zero,
                      constraints: const BoxConstraints(
                        minWidth: 32,
                        minHeight: 32,
                      ),
                      icon: const Icon(
                        LucideIcons.pencil,
                        size: 16,
                        color: AppTheme.navy,
                      ),
                    ),
                  ],
                ),
                if (showBelowBadge)
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
            ),
          ],
        ),
        if (showCompare) ...[
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

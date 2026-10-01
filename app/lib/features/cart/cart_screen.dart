import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gap/gap.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:pegou_preco/core/di/providers.dart';
import 'package:pegou_preco/core/theme/app_theme.dart';
import 'package:pegou_preco/core/utils/money.dart';
import 'package:pegou_preco/core/utils/pricing.dart';
import 'package:pegou_preco/core/widgets/brand_app_bar.dart';
import 'package:pegou_preco/core/widgets/empty_state.dart';
import 'package:pegou_preco/core/widgets/pressable.dart';
import 'package:pegou_preco/data/local/cart_repository.dart';
import 'package:pegou_preco/data/local/schemas.dart';

final cartItemsProvider = StreamProvider<List<CartItem>>((ref) {
  return ref.watch(cartRepositoryProvider).watchAll();
});

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

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final itemsAsync = ref.watch(cartItemsProvider);
    final cartRepo = ref.watch(cartRepositoryProvider);

    return Scaffold(
      appBar: BrandAppBar(
        logoOnly: true,
        actions: [
          IconButton(
            tooltip: 'Histórico',
            onPressed: () => context.push('/history'),
            icon: const Icon(LucideIcons.history),
          ),
          IconButton(
            tooltip: 'Limpar carrinho',
            onPressed: () => _confirmClear(context, cartRepo),
            icon: const Icon(LucideIcons.trash2),
          ),
        ],
      ),
      body: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [Color(0xFFFFF3B0), AppTheme.canvas],
          ),
        ),
        child: itemsAsync.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => Center(child: Text('Erro: $e')),
          data: (items) {
            final totals = cartRepo.computeTotals(items);
            if (items.isEmpty) {
              return EmptyState(
                icon: LucideIcons.shoppingCart,
                title: 'Carrinho vazio',
                message:
                    'Capture uma etiqueta ou NFC-e, ou adicione um produto pelo histórico.',
                actionLabel: 'Ir para Capturar',
                onAction: () => context.go('/capture'),
              );
            }
            return Column(
              children: [
                _TotalsBar(totals: totals)
                    .animate()
                    .fadeIn(duration: 280.ms)
                    .slideY(begin: -0.08, end: 0),
                Expanded(
                  child: ListView.separated(
                    physics: const BouncingScrollPhysics(),
                    padding: const EdgeInsets.fromLTRB(20, 4, 20, 110),
                    itemCount: items.length,
                    separatorBuilder: (_, __) => const Gap(10),
                    itemBuilder: (context, index) {
                      return _CartTile(item: items[index])
                          .animate()
                          .fadeIn(delay: (40 * index).ms, duration: 280.ms)
                          .slideY(begin: 0.12, end: 0);
                    },
                  ),
                ),
              ],
            );
          },
        ),
      ),
    );
  }
}

class _TotalsBar extends StatelessWidget {
  const _TotalsBar({required this.totals});
  final CartTotals totals;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.fromLTRB(16, 12, 16, 8),
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xFF0B2A6B), Color(0xFF163F8C)],
        ),
        borderRadius: BorderRadius.circular(22),
        boxShadow: [
          BoxShadow(
            color: AppTheme.navy.withValues(alpha: 0.22),
            blurRadius: 18,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Subtotal',
            style: GoogleFonts.plusJakartaSans(
              color: Colors.white70,
              fontSize: 13,
              fontWeight: FontWeight.w500,
            ),
          ),
          Text(
            formatBrl(totals.subtotal),
            style: GoogleFonts.plusJakartaSans(
              color: Colors.white,
              fontSize: 28,
              fontWeight: FontWeight.w800,
              letterSpacing: -0.5,
            ),
          ),
          const Gap(10),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              _Chip(
                icon: LucideIcons.piggyBank,
                label: 'Economia ${formatBrl(totals.savings)}',
                bg: AppTheme.yellow,
                fg: AppTheme.navy,
              ),
              _Chip(
                icon: LucideIcons.checkCircle2,
                label: 'Check-off ${totals.checkedCount}/${totals.itemCount}',
                bg: Colors.white.withValues(alpha: 0.12),
                fg: Colors.white,
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _Chip extends StatelessWidget {
  const _Chip({
    required this.icon,
    required this.label,
    required this.bg,
    required this.fg,
  });

  final IconData icon;
  final String label;
  final Color bg;
  final Color fg;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 14, color: fg),
          const Gap(6),
          Text(
            label,
            style: GoogleFonts.plusJakartaSans(
              color: fg,
              fontSize: 12,
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
    );
  }
}

class _CartTile extends ConsumerWidget {
  const _CartTile({required this.item});
  final CartItem item;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final repo = ref.watch(cartRepositoryProvider);
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
    final usingWholesale = unit < item.retailPrice - 0.0001;

    return Pressable(
      onTap: () => repo.toggleChecked(item.id),
      child: Container(
        padding: const EdgeInsets.fromLTRB(12, 12, 8, 12),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: const Color(0xFFE2E8F0)),
        ),
        child: Row(
          children: [
            Checkbox(
              value: item.checkedOff,
              activeColor: AppTheme.navy,
              onChanged: (_) => repo.toggleChecked(item.id),
            ),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    item.productName,
                    style: GoogleFonts.plusJakartaSans(
                      fontWeight: FontWeight.w700,
                      fontSize: 15,
                      decoration:
                          item.checkedOff ? TextDecoration.lineThrough : null,
                      color: item.checkedOff ? AppTheme.muted : AppTheme.ink,
                    ),
                  ),
                  const Gap(4),
                  Text(
                    '${formatBrl(unit)} un. · ${formatBrl(total)}'
                    '${usingWholesale ? ' · atacado' : ''}',
                    style: GoogleFonts.plusJakartaSans(
                      fontSize: 13,
                      color: AppTheme.muted,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ],
              ),
            ),
            _QtyButton(
              icon: LucideIcons.minus,
              onTap: () => repo.setQuantity(item.id, item.quantity - 1),
            ),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 8),
              child: Text(
                item.quantity.toStringAsFixed(
                  item.quantity == item.quantity.roundToDouble() ? 0 : 2,
                ),
                style: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w800),
              ),
            ),
            _QtyButton(
              icon: LucideIcons.plus,
              onTap: () => repo.setQuantity(item.id, item.quantity + 1),
            ),
          ],
        ),
      ),
    );
  }
}

class _QtyButton extends StatelessWidget {
  const _QtyButton({required this.icon, required this.onTap});
  final IconData icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppTheme.canvas,
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: SizedBox(
          width: 36,
          height: 36,
          child: Icon(icon, size: 18, color: AppTheme.navy),
        ),
      ),
    );
  }
}

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gap/gap.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:pegou_preco/core/di/providers.dart';
import 'package:pegou_preco/core/theme/app_theme.dart';
import 'package:pegou_preco/data/local/schemas.dart';
import 'package:pegou_preco/features/cart/start_list_sheet.dart';

/// Finaliza a lista ativa: snapshot Isar, limpa carrinho e sessão.
Future<bool> finalizeActiveList(WidgetRef ref) async {
  final active = ref.read(activeShoppingListProvider).valueOrNull;
  if (active == null) return false;

  final cartRepo = ref.read(cartRepositoryProvider);
  final items = await cartRepo.all();
  if (items.isEmpty) {
    await ref.read(activeShoppingListProvider.notifier).clear();
    return true;
  }

  final market =
      await ref.read(marketRepositoryProvider).getById(active.marketId);
  final totals = cartRepo.computeTotals(items);
  await ref.read(shoppingListRepositoryProvider).finalizeFromCart(
        name: active.name,
        marketId: active.marketId,
        marketName: market?.name,
        items: items,
        totals: totals,
      );
  await cartRepo.clear();
  await ref.read(activeShoppingListProvider.notifier).clear();

  // Dispara sync se possível.
  try {
    ref.read(syncWorkerProvider).runFullSync();
  } catch (_) {}
  return true;
}

/// Descarta itens do carrinho e limpa a sessão ativa.
Future<void> discardActiveList(WidgetRef ref) async {
  await ref.read(cartRepositoryProvider).clear();
  await ref.read(activeShoppingListProvider.notifier).clear();
}

/// Se o carrinho tem itens, pede salvar/descartar antes de nova lista.
/// Retorna true se o usuário pode iniciar uma nova lista.
Future<bool> confirmNewListOrWarn(BuildContext context, WidgetRef ref) async {
  final items = await ref.read(cartRepositoryProvider).all();
  if (!context.mounted) return false;
  if (items.isEmpty) {
    await ref.read(activeShoppingListProvider.notifier).clear();
    if (!context.mounted) return false;
    return showStartListSheet(context);
  }

  final choice = await showModalBottomSheet<String>(
    context: context,
    showDragHandle: true,
    builder: (ctx) => Padding(
      padding: const EdgeInsets.fromLTRB(24, 8, 24, 32),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            'Lista em andamento',
            style: GoogleFonts.plusJakartaSans(
              fontSize: 20,
              fontWeight: FontWeight.w800,
            ),
          ),
          const Gap(8),
          Text(
            'Ainda há itens no carrinho. Salve a lista ou você perderá '
            'todos os itens já cadastrados.',
            style: GoogleFonts.plusJakartaSans(color: AppTheme.muted),
          ),
          const Gap(20),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, 'save'),
            child: const Text('Salvar lista'),
          ),
          const Gap(8),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, 'discard'),
            style: FilledButton.styleFrom(
              backgroundColor: const Color(0xFFEF4444),
            ),
            child: const Text('Descartar itens'),
          ),
          const Gap(8),
          TextButton(
            onPressed: () => Navigator.pop(ctx, 'cancel'),
            child: const Text('Cancelar'),
          ),
        ],
      ),
    ),
  );

  if (choice == 'save') {
    await finalizeActiveList(ref);
    if (!context.mounted) return false;
    return showStartListSheet(context);
  }
  if (choice == 'discard') {
    await discardActiveList(ref);
    if (!context.mounted) return false;
    return showStartListSheet(context);
  }
  return false;
}

/// Garante lista ativa antes da captura. Retorna false se o usuário cancelar.
Future<bool> ensureActiveListForCapture(
  BuildContext context,
  WidgetRef ref,
) async {
  final active = ref.read(activeShoppingListProvider).valueOrNull;
  if (active != null) return true;

  final items = await ref.read(cartRepositoryProvider).all();
  if (items.isNotEmpty) {
    if (!context.mounted) return false;
    return confirmNewListOrWarn(context, ref);
  }
  if (!context.mounted) return false;
  return showStartListSheet(context);
}

Future<Market?> resolveActiveMarket(WidgetRef ref) async {
  final active = ref.read(activeShoppingListProvider).valueOrNull;
  if (active == null) return null;
  return ref.read(marketRepositoryProvider).getById(active.marketId);
}

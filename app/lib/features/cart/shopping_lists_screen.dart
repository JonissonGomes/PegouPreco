import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gap/gap.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:pegou_preco/core/di/providers.dart';
import 'package:pegou_preco/core/theme/app_theme.dart';
import 'package:pegou_preco/core/utils/money.dart';
import 'package:pegou_preco/core/widgets/brand_app_bar.dart';
import 'package:pegou_preco/core/widgets/empty_state.dart';
import 'package:pegou_preco/data/local/schemas.dart';

final shoppingListsProvider = StreamProvider<List<ShoppingList>>((ref) {
  return ref.watch(shoppingListRepositoryProvider).watchAll();
});

class ShoppingListsScreen extends ConsumerWidget {
  const ShoppingListsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final listsAsync = ref.watch(shoppingListsProvider);

    return Scaffold(
      appBar: const BrandAppBar(title: 'Listas salvas'),
      body: listsAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('Erro: $e')),
        data: (lists) {
          if (lists.isEmpty) {
            return const EmptyState(
              icon: LucideIcons.listChecks,
              title: 'Nenhuma lista salva',
              message:
                  'Finalize uma lista no carrinho para guardar o histórico.',
            );
          }
          return ListView.separated(
            padding: const EdgeInsets.fromLTRB(20, 12, 20, 32),
            itemCount: lists.length,
            separatorBuilder: (_, __) => const Gap(10),
            itemBuilder: (context, i) {
              final list = lists[i];
              final date =
                  '${list.finishedAt.toLocal().day.toString().padLeft(2, '0')}/'
                  '${list.finishedAt.toLocal().month.toString().padLeft(2, '0')}/'
                  '${list.finishedAt.toLocal().year}';
              return Material(
                color: Colors.white,
                borderRadius: BorderRadius.circular(18),
                child: InkWell(
                  borderRadius: BorderRadius.circular(18),
                  onTap: () => _openDetail(context, list),
                  child: Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(18),
                      border: Border.all(color: AppTheme.border),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Expanded(
                              child: Text(
                                list.name,
                                style: GoogleFonts.plusJakartaSans(
                                  fontWeight: FontWeight.w800,
                                  fontSize: 16,
                                ),
                              ),
                            ),
                            if (!list.synced)
                              const Icon(
                                LucideIcons.cloudOff,
                                size: 16,
                                color: AppTheme.muted,
                              ),
                          ],
                        ),
                        const Gap(4),
                        Text(
                          '${list.marketName ?? 'Mercado'} · $date · '
                          '${list.itemCount} itens',
                          style: GoogleFonts.plusJakartaSans(
                            color: AppTheme.muted,
                            fontSize: 13,
                          ),
                        ),
                        const Gap(8),
                        Text(
                          formatBrl(list.subtotal),
                          style: GoogleFonts.plusJakartaSans(
                            fontWeight: FontWeight.w800,
                            color: AppTheme.navy,
                            fontSize: 18,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              );
            },
          );
        },
      ),
    );
  }

  void _openDetail(BuildContext context, ShoppingList list) {
    List<dynamic> items = const [];
    try {
      items = jsonDecode(list.itemsJson) as List<dynamic>? ?? const [];
    } catch (_) {}

    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (ctx) => DraggableScrollableSheet(
        expand: false,
        initialChildSize: 0.65,
        maxChildSize: 0.9,
        minChildSize: 0.4,
        builder: (_, controller) => Padding(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                list.name,
                style: GoogleFonts.plusJakartaSans(
                  fontSize: 20,
                  fontWeight: FontWeight.w800,
                ),
              ),
              const Gap(4),
              Text(
                '${list.marketName ?? '—'} · ${formatBrl(list.subtotal)}'
                ' · economia ${formatBrl(list.savings)}',
                style: GoogleFonts.plusJakartaSans(color: AppTheme.muted),
              ),
              const Gap(12),
              Expanded(
                child: ListView.separated(
                  controller: controller,
                  itemCount: items.length,
                  separatorBuilder: (_, __) => const Divider(height: 1),
                  itemBuilder: (_, i) {
                    final raw = Map<String, dynamic>.from(items[i] as Map);
                    final name = raw['productName'] as String? ?? 'Item';
                    final qty = (raw['quantity'] as num?)?.toDouble() ?? 0;
                    final total = (raw['lineTotal'] as num?)?.toDouble() ?? 0;
                    return ListTile(
                      contentPadding: EdgeInsets.zero,
                      title: Text(
                        name,
                        style: GoogleFonts.plusJakartaSans(
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      subtitle: Text('${formatQty(qty)} un.'),
                      trailing: Text(
                        formatBrl(total),
                        style: GoogleFonts.plusJakartaSans(
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    );
                  },
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

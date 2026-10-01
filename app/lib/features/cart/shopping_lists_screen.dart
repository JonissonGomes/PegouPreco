import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gap/gap.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:pegou_preco/core/di/providers.dart';
import 'package:pegou_preco/core/theme/app_theme.dart';
import 'package:pegou_preco/core/utils/money.dart';
import 'package:pegou_preco/core/widgets/app_screen_chrome.dart';
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
      backgroundColor: appScreenBg,
      body: listsAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('Erro: $e')),
        data: (lists) {
          final totalSpent =
              lists.fold<double>(0, (sum, l) => sum + l.subtotal);
          final totalSaved =
              lists.fold<double>(0, (sum, l) => sum + l.savings);

          return Column(
            children: [
              AppScreenHeader(
                title: 'Listas salvas',
                subtitle: 'Compare compras passadas',
                subtitleIcon: LucideIcons.clipboardList,
                leading: IconButton(
                  tooltip: 'Voltar',
                  onPressed: () => Navigator.of(context).maybePop(),
                  visualDensity: VisualDensity.compact,
                  icon: const Icon(LucideIcons.arrowLeft, color: AppTheme.navy),
                ),
              ),
              AppScreenNavyBar(
                label: 'Total gasto nas listas',
                value: formatBrl(totalSpent),
                trailing: Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 10,
                        vertical: 5,
                      ),
                      decoration: BoxDecoration(
                        color: AppTheme.yellowBright,
                        borderRadius: BorderRadius.circular(999),
                      ),
                      child: Text(
                        '${formatBrl(totalSaved)} economizados',
                        style: GoogleFonts.plusJakartaSans(
                          color: AppTheme.navy,
                          fontSize: 11,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ),
                    const Gap(6),
                    Text(
                      '${lists.length} LISTAS',
                      style: GoogleFonts.plusJakartaSans(
                        color: Colors.white,
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                        letterSpacing: 0.4,
                      ),
                    ),
                  ],
                ),
              ),
              Expanded(
                child: lists.isEmpty
                    ? const EmptyState(
                        icon: LucideIcons.listChecks,
                        title: 'Nenhuma lista salva',
                        message:
                            'Finalize uma lista no carrinho para guardar o histórico.',
                      )
                    : ListView.separated(
                        padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
                        itemCount: lists.length,
                        separatorBuilder: (_, __) => const Gap(10),
                        itemBuilder: (context, i) {
                          final list = lists[i];
                          final date =
                              '${list.finishedAt.toLocal().day.toString().padLeft(2, '0')}/'
                              '${list.finishedAt.toLocal().month.toString().padLeft(2, '0')}/'
                              '${list.finishedAt.toLocal().year}';
                          return AppListCard(
                            onTap: () => _openDetail(context, list),
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
                                          color: AppTheme.navy,
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
                                Row(
                                  children: [
                                    const Icon(
                                      LucideIcons.mapPin,
                                      size: 14,
                                      color: AppTheme.muted,
                                    ),
                                    const Gap(4),
                                    Expanded(
                                      child: Text(
                                        '${list.marketName ?? 'Mercado'} · $date · ${list.itemCount} itens',
                                        style: GoogleFonts.plusJakartaSans(
                                          color: AppTheme.muted,
                                          fontSize: 13,
                                          fontWeight: FontWeight.w600,
                                        ),
                                      ),
                                    ),
                                  ],
                                ),
                                const Gap(10),
                                Row(
                                  children: [
                                    Text(
                                      formatBrl(list.subtotal),
                                      style: GoogleFonts.plusJakartaSans(
                                        fontWeight: FontWeight.w800,
                                        color: AppTheme.navy,
                                        fontSize: 18,
                                      ),
                                    ),
                                    const Spacer(),
                                    if (list.savings > 0)
                                      Container(
                                        padding: const EdgeInsets.symmetric(
                                          horizontal: 8,
                                          vertical: 4,
                                        ),
                                        decoration: BoxDecoration(
                                          color: const Color(0xFFDCFCE7),
                                          borderRadius:
                                              BorderRadius.circular(999),
                                        ),
                                        child: Text(
                                          '− ${formatBrl(list.savings)}',
                                          style: GoogleFonts.plusJakartaSans(
                                            fontSize: 11,
                                            fontWeight: FontWeight.w800,
                                            color: const Color(0xFF166534),
                                          ),
                                        ),
                                      ),
                                  ],
                                ),
                              ],
                            ),
                          );
                        },
                      ),
              ),
            ],
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
                  color: AppTheme.navy,
                ),
              ),
              const Gap(4),
              Text(
                '${list.marketName ?? '—'} · ${formatBrl(list.subtotal)}'
                ' · economia ${formatBrl(list.savings)}',
                style: GoogleFonts.plusJakartaSans(
                  color: AppTheme.muted,
                  fontWeight: FontWeight.w600,
                ),
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
                          color: AppTheme.navy,
                        ),
                      ),
                      subtitle: Text('${formatQty(qty)} un.'),
                      trailing: Text(
                        formatBrl(total),
                        style: GoogleFonts.plusJakartaSans(
                          fontWeight: FontWeight.w800,
                          color: AppTheme.navy,
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

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gap/gap.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:pegou_preco/core/crowd/trust_engine.dart';
import 'package:pegou_preco/core/di/providers.dart';
import 'package:pegou_preco/core/theme/app_theme.dart';
import 'package:pegou_preco/core/utils/money.dart';
import 'package:pegou_preco/core/widgets/app_screen_chrome.dart';
import 'package:pegou_preco/core/widgets/empty_state.dart';
import 'package:pegou_preco/core/widgets/skeleton_list.dart';
import 'package:pegou_preco/data/local/insights_repository.dart';
import 'package:pegou_preco/data/local/schemas.dart';
import 'package:pegou_preco/features/market/market_picker_sheet.dart';

final _insightsBundleProvider =
    FutureProvider.autoDispose<_InsightsBundle>((ref) async {
  final repo = ref.watch(insightsRepositoryProvider);
  final cheap = await repo.cheapestNow();
  final opps = await repo.opportunities();
  final markets = await repo.marketInsights();
  final lists = await ref.watch(shoppingListRepositoryProvider).all();
  final userId = await ref.watch(localUserIdProvider.future);
  final rep = await ref.watch(crowdRepositoryProvider).ensureReputation(userId);
  return _InsightsBundle(
    cheap: cheap,
    opportunities: opps,
    markets: markets,
    lists: lists,
    fiscalLabel: TrustEngine.fiscalLabel(rep.level),
    points: rep.points,
  );
});

class _InsightsBundle {
  _InsightsBundle({
    required this.cheap,
    required this.opportunities,
    required this.markets,
    required this.lists,
    required this.fiscalLabel,
    required this.points,
  });

  final List<CheapNowRow> cheap;
  final List<OpportunityRow> opportunities;
  final List<MarketInsight> markets;
  final List<ShoppingList> lists;
  final String fiscalLabel;
  final int points;
}

class InsightsScreen extends ConsumerWidget {
  const InsightsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final bundle = ref.watch(_insightsBundleProvider);
    final market = ref.watch(currentMarketProvider);

    final actions = [
      AppHeaderAction(
        icon: LucideIcons.clipboardList,
        label: 'Listas salvas',
        onTap: () => context.push('/shopping-lists'),
      ),
      AppHeaderAction(
        icon: LucideIcons.store,
        label: 'Mercado atual',
        onTap: () => showMarketPickerSheet(context),
      ),
    ];

    return Scaffold(
      backgroundColor: appScreenBg,
      floatingActionButton: Padding(
        padding: const EdgeInsets.only(bottom: appBottomNavClearance),
        child: AppActionsFab(
          heroTag: 'insights_actions_fab',
          actions: actions,
        ),
      ),
      floatingActionButtonLocation: FloatingActionButtonLocation.endFloat,
      body: bundle.when(
        loading: () => const Column(
          children: [
            AppScreenHeader(
              title: 'Comparar',
              subtitle: 'Alertas e oportunidades',
              subtitleIcon: LucideIcons.lineChart,
            ),
            Expanded(child: SkeletonList()),
          ],
        ),
        error: (e, _) => Center(child: Text('Erro: $e')),
        data: (data) {
          final alerts = data.cheap.length + data.opportunities.length;
          final marketName = market.valueOrNull?.name;

          return Column(
            children: [
              AppScreenHeader(
                title: 'Comparar',
                subtitle: marketName ?? 'Preços e alertas',
                subtitleIcon: marketName != null
                    ? LucideIcons.mapPin
                    : LucideIcons.lineChart,
              ),
              AppScreenNavyBar(
                label: 'alertas',
                value: '$alerts',
                trailing: Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 8,
                    vertical: 4,
                  ),
                  decoration: BoxDecoration(
                    color: AppTheme.yellowBright,
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: Text(
                    'Fiscal ${data.fiscalLabel} · ${data.points} pts',
                    style: GoogleFonts.plusJakartaSans(
                      color: AppTheme.navy,
                      fontSize: 11,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),
              ),
              Expanded(
                child: data.cheap.isEmpty &&
                        data.opportunities.isEmpty &&
                        data.lists.isEmpty
                    ? EmptyState(
                        icon: LucideIcons.lineChart,
                        title: 'Sem comparações ainda',
                        message:
                            'Capture preços ou finalize listas para ver alertas '
                            'de preço mais baixo e histórico de compras.',
                        actionLabel: 'Capturar',
                        onAction: () => context.go('/capture'),
                      )
                    : ListView(
                        physics: const BouncingScrollPhysics(),
                        padding: const EdgeInsets.only(bottom: 110),
                        children: [
                          AppSectionTitle(
                            title: 'Preço mais baixo',
                            trailing: '${data.cheap.length} itens',
                          ),
                          if (data.cheap.isEmpty)
                            Padding(
                              padding:
                                  const EdgeInsets.symmetric(horizontal: 20),
                              child: Text(
                                'Nenhum alerta de menor preço no momento.',
                                style: GoogleFonts.plusJakartaSans(
                                  color: AppTheme.muted,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            )
                          else
                            ...data.cheap.take(8).map(
                                  (row) => Padding(
                                    padding: const EdgeInsets.fromLTRB(
                                      16,
                                      0,
                                      16,
                                      10,
                                    ),
                                    child: AppListCard(
                                      onTap: () => context.push(
                                        '/insights/product/${row.product.id}',
                                      ),
                                      child: Row(
                                        children: [
                                          Container(
                                            width: 42,
                                            height: 42,
                                            decoration: BoxDecoration(
                                              color: const Color(0xFFDCFCE7),
                                              borderRadius:
                                                  BorderRadius.circular(12),
                                            ),
                                            child: const Icon(
                                              LucideIcons.trendingDown,
                                              color: Color(0xFF166534),
                                              size: 20,
                                            ),
                                          ),
                                          const Gap(12),
                                          Expanded(
                                            child: Column(
                                              crossAxisAlignment:
                                                  CrossAxisAlignment.start,
                                              children: [
                                                Text(
                                                  row.product.name,
                                                  maxLines: 2,
                                                  overflow:
                                                      TextOverflow.ellipsis,
                                                  style: GoogleFonts
                                                      .plusJakartaSans(
                                                    fontWeight: FontWeight.w800,
                                                    fontSize: 14,
                                                    color: AppTheme.navy,
                                                  ),
                                                ),
                                                const Gap(2),
                                                Text(
                                                  row.marketName ??
                                                      'Mercado não informado',
                                                  style: GoogleFonts
                                                      .plusJakartaSans(
                                                    fontSize: 12,
                                                    fontWeight: FontWeight.w600,
                                                    color: AppTheme.muted,
                                                  ),
                                                ),
                                              ],
                                            ),
                                          ),
                                          Text(
                                            formatBrl(row.log.retailPrice),
                                            style:
                                                GoogleFonts.plusJakartaSans(
                                              fontWeight: FontWeight.w800,
                                              fontSize: 15,
                                              color: AppTheme.trustGreen,
                                            ),
                                          ),
                                        ],
                                      ),
                                    ),
                                  ),
                                ),
                          AppSectionTitle(
                            title: 'Acima da sua média',
                            trailing: '${data.opportunities.length}',
                          ),
                          if (data.opportunities.isEmpty)
                            Padding(
                              padding:
                                  const EdgeInsets.symmetric(horizontal: 20),
                              child: Text(
                                'Nenhuma oportunidade de troca agora.',
                                style: GoogleFonts.plusJakartaSans(
                                  color: AppTheme.muted,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            )
                          else
                            ...data.opportunities.take(6).map(
                                  (o) => Padding(
                                    padding: const EdgeInsets.fromLTRB(
                                      16,
                                      0,
                                      16,
                                      10,
                                    ),
                                    child: AppListCard(
                                      onTap: () => context.push(
                                        '/insights/product/${o.product.id}',
                                      ),
                                      child: Row(
                                        children: [
                                          Container(
                                            width: 42,
                                            height: 42,
                                            decoration: BoxDecoration(
                                              color: const Color(0xFFFEE2E2),
                                              borderRadius:
                                                  BorderRadius.circular(12),
                                            ),
                                            child: const Icon(
                                              LucideIcons.trendingUp,
                                              color: Color(0xFFDC2626),
                                              size: 20,
                                            ),
                                          ),
                                          const Gap(12),
                                          Expanded(
                                            child: Column(
                                              crossAxisAlignment:
                                                  CrossAxisAlignment.start,
                                              children: [
                                                Text(
                                                  o.product.name,
                                                  maxLines: 2,
                                                  overflow:
                                                      TextOverflow.ellipsis,
                                                  style: GoogleFonts
                                                      .plusJakartaSans(
                                                    fontWeight: FontWeight.w800,
                                                    fontSize: 14,
                                                    color: AppTheme.navy,
                                                  ),
                                                ),
                                                const Gap(2),
                                                Text(
                                                  '+${o.pctAbove.toStringAsFixed(0)}% vs média ${formatBrl(o.avgPrice)}',
                                                  style: GoogleFonts
                                                      .plusJakartaSans(
                                                    fontSize: 12,
                                                    fontWeight: FontWeight.w600,
                                                    color: AppTheme.muted,
                                                  ),
                                                ),
                                              ],
                                            ),
                                          ),
                                          Text(
                                            formatBrl(o.lastPrice),
                                            style:
                                                GoogleFonts.plusJakartaSans(
                                              fontWeight: FontWeight.w800,
                                              fontSize: 15,
                                              color: AppTheme.navy,
                                            ),
                                          ),
                                        ],
                                      ),
                                    ),
                                  ),
                                ),
                          AppSectionTitle(
                            title: 'Listas passadas',
                            trailing: '${data.lists.length}',
                          ),
                          if (data.lists.isEmpty)
                            Padding(
                              padding:
                                  const EdgeInsets.symmetric(horizontal: 20),
                              child: Text(
                                'Finalize uma lista no carrinho para comparar depois.',
                                style: GoogleFonts.plusJakartaSans(
                                  color: AppTheme.muted,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            )
                          else
                            ...data.lists.take(5).map((list) {
                              final date =
                                  DateFormat('dd/MM/yyyy').format(
                                list.finishedAt.toLocal(),
                              );
                              return Padding(
                                padding: const EdgeInsets.fromLTRB(
                                  16,
                                  0,
                                  16,
                                  10,
                                ),
                                child: AppListCard(
                                  onTap: () =>
                                      context.push('/shopping-lists'),
                                  child: Row(
                                    children: [
                                      Container(
                                        width: 42,
                                        height: 42,
                                        decoration: BoxDecoration(
                                          color: AppTheme.yellow
                                              .withValues(alpha: 0.35),
                                          borderRadius:
                                              BorderRadius.circular(12),
                                        ),
                                        child: const Icon(
                                          LucideIcons.shoppingBasket,
                                          color: AppTheme.navy,
                                          size: 20,
                                        ),
                                      ),
                                      const Gap(12),
                                      Expanded(
                                        child: Column(
                                          crossAxisAlignment:
                                              CrossAxisAlignment.start,
                                          children: [
                                            Text(
                                              list.name,
                                              style: GoogleFonts
                                                  .plusJakartaSans(
                                                fontWeight: FontWeight.w800,
                                                fontSize: 14,
                                                color: AppTheme.navy,
                                              ),
                                            ),
                                            const Gap(2),
                                            Text(
                                              '${list.marketName ?? 'Mercado'} · $date · ${list.itemCount} itens',
                                              style: GoogleFonts
                                                  .plusJakartaSans(
                                                fontSize: 12,
                                                fontWeight: FontWeight.w600,
                                                color: AppTheme.muted,
                                              ),
                                            ),
                                          ],
                                        ),
                                      ),
                                      Text(
                                        formatBrl(list.subtotal),
                                        style: GoogleFonts.plusJakartaSans(
                                          fontWeight: FontWeight.w800,
                                          fontSize: 15,
                                          color: AppTheme.navy,
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                              );
                            }),
                          AppSectionTitle(
                            title: 'Estabelecimentos',
                            trailing: '${data.markets.length}',
                          ),
                          ...data.markets.take(8).map((m) {
                            final dateFmt = DateFormat('dd/MM/yyyy');
                            return Padding(
                              padding: const EdgeInsets.fromLTRB(
                                16,
                                0,
                                16,
                                10,
                              ),
                              child: AppListCard(
                                onTap: () => context
                                    .push('/insights/market/${m.market.id}'),
                                child: Row(
                                  children: [
                                    Container(
                                      width: 42,
                                      height: 42,
                                      decoration: BoxDecoration(
                                        color: AppTheme.cyan
                                            .withValues(alpha: 0.18),
                                        borderRadius:
                                            BorderRadius.circular(12),
                                      ),
                                      child: const Icon(
                                        LucideIcons.store,
                                        color: AppTheme.navy,
                                        size: 20,
                                      ),
                                    ),
                                    const Gap(12),
                                    Expanded(
                                      child: Column(
                                        crossAxisAlignment:
                                            CrossAxisAlignment.start,
                                        children: [
                                          Text(
                                            m.market.name,
                                            style: GoogleFonts.plusJakartaSans(
                                              fontWeight: FontWeight.w800,
                                              fontSize: 14,
                                              color: AppTheme.navy,
                                            ),
                                          ),
                                          const Gap(2),
                                          Text(
                                            '${m.cheapestCount} mais baratos · ${m.productCount} no histórico'
                                            '${m.lastVisit != null ? ' · ${dateFmt.format(m.lastVisit!.toLocal())}' : ''}',
                                            style: GoogleFonts.plusJakartaSans(
                                              fontSize: 12,
                                              fontWeight: FontWeight.w600,
                                              color: AppTheme.muted,
                                            ),
                                          ),
                                        ],
                                      ),
                                    ),
                                    const Icon(
                                      LucideIcons.chevronRight,
                                      color: AppTheme.muted,
                                      size: 18,
                                    ),
                                  ],
                                ),
                              ),
                            );
                          }),
                        ],
                      ),
              ),
            ],
          );
        },
      ),
    );
  }
}

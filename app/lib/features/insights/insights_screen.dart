import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
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
import 'package:pegou_preco/core/widgets/brand_app_bar.dart';
import 'package:pegou_preco/core/widgets/empty_state.dart';
import 'package:pegou_preco/core/widgets/product_item_card.dart';
import 'package:pegou_preco/core/widgets/skeleton_list.dart';
import 'package:pegou_preco/data/local/insights_repository.dart';
import 'package:pegou_preco/features/market/market_picker_sheet.dart';

final _insightsBundleProvider =
    FutureProvider.autoDispose<_InsightsBundle>((ref) async {
  final repo = ref.watch(insightsRepositoryProvider);
  final cheap = await repo.cheapestNow();
  final opps = await repo.opportunities();
  final markets = await repo.marketInsights();
  final userId = await ref.watch(localUserIdProvider.future);
  final rep = await ref.watch(crowdRepositoryProvider).ensureReputation(userId);
  return _InsightsBundle(
    cheap: cheap,
    opportunities: opps,
    markets: markets,
    fiscalLabel: TrustEngine.fiscalLabel(rep.level),
    points: rep.points,
  );
});

class _InsightsBundle {
  _InsightsBundle({
    required this.cheap,
    required this.opportunities,
    required this.markets,
    required this.fiscalLabel,
    required this.points,
  });

  final List<CheapNowRow> cheap;
  final List<OpportunityRow> opportunities;
  final List<MarketInsight> markets;
  final String fiscalLabel;
  final int points;
}

class InsightsScreen extends ConsumerWidget {
  const InsightsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final bundle = ref.watch(_insightsBundleProvider);
    final market = ref.watch(currentMarketProvider);

    return Scaffold(
      appBar: BrandAppBar(
        title: 'Insights',
        actions: [
          IconButton(
            tooltip: 'Mercado atual',
            onPressed: () => showMarketPickerSheet(context),
            icon: const Icon(LucideIcons.store),
          ),
        ],
      ),
      body: bundle.when(
        loading: () => const SkeletonList(),
        error: (e, _) => Center(child: Text('Erro: $e')),
        data: (data) {
          if (data.cheap.isEmpty && data.opportunities.isEmpty) {
            return EmptyState(
              icon: LucideIcons.lineChart,
              title: 'Sem dados ainda',
              message:
                  'Capture preços ou importe NFC-e para ver comparações e melhores datas.',
              actionLabel: 'Capturar',
              onAction: () => context.go('/capture'),
            );
          }
          return ListView(
            physics: const BouncingScrollPhysics(),
            padding: const EdgeInsets.fromLTRB(
              AppTheme.pagePadding,
              12,
              AppTheme.pagePadding,
              120,
            ),
            children: [
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  gradient: const LinearGradient(
                    colors: [Color(0xFFFFE566), Color(0xFFFFD400)],
                  ),
                  borderRadius: BorderRadius.circular(AppTheme.cardRadius),
                ),
                child: Row(
                  children: [
                    const Icon(LucideIcons.shield, color: AppTheme.navy),
                    const Gap(12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'Fiscal Nível ${data.fiscalLabel}',
                            style: GoogleFonts.plusJakartaSans(
                              fontWeight: FontWeight.w800,
                              fontSize: 16,
                              color: AppTheme.navy,
                            ),
                          ),
                          Text(
                            '${data.points} pts · Vigilante do Preço',
                            style: GoogleFonts.plusJakartaSans(
                              color: AppTheme.navy.withValues(alpha: 0.75),
                              fontWeight: FontWeight.w600,
                              fontSize: 13,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ).animate().fadeIn().slideY(begin: 0.08, end: 0),
              const Gap(12),
              market.when(
                loading: () => const SizedBox.shrink(),
                error: (_, __) => const SizedBox.shrink(),
                data: (m) => Text(
                  m == null
                      ? 'Mercado atual: não definido'
                      : 'Mercado atual: ${m.name}',
                  style: GoogleFonts.plusJakartaSans(
                    fontWeight: FontWeight.w600,
                    color: AppTheme.muted,
                  ),
                ),
              ),
              const Gap(20),
              Text(
                'Onde está mais barato',
                style: GoogleFonts.plusJakartaSans(
                  fontSize: 18,
                  fontWeight: FontWeight.w800,
                ),
              ),
              const Gap(10),
              ...data.cheap.take(8).toList().asMap().entries.map((e) {
                final row = e.value;
                return Padding(
                  padding: const EdgeInsets.only(bottom: 10),
                  child: ProductItemCard(
                    animationIndex: e.key,
                    title: row.product.name,
                    subtitle:
                        '${formatBrl(row.log.retailPrice)}'
                        '${row.marketName != null ? ' · ${row.marketName}' : ''}',
                    trustLevel: TrustEngine.trustKey(row.log.trustLevel),
                    onTap: () =>
                        context.push('/insights/product/${row.product.id}'),
                    trailing: const Icon(
                      LucideIcons.chevronRight,
                      color: AppTheme.muted,
                    ),
                  ),
                );
              }),
              const Gap(12),
              Text(
                'Oportunidades',
                style: GoogleFonts.plusJakartaSans(
                  fontSize: 18,
                  fontWeight: FontWeight.w800,
                ),
              ),
              const Gap(4),
              Text(
                'Preço atual acima da sua média',
                style: GoogleFonts.plusJakartaSans(color: AppTheme.muted),
              ),
              const Gap(10),
              if (data.opportunities.isEmpty)
                Text(
                  'Nenhuma oportunidade no momento.',
                  style: GoogleFonts.plusJakartaSans(color: AppTheme.muted),
                )
              else
                ...data.opportunities.take(6).map((o) {
                  return Padding(
                    padding: const EdgeInsets.only(bottom: 10),
                    child: ProductItemCard(
                      title: o.product.name,
                      subtitle:
                          '${formatBrl(o.lastPrice)} · +${o.pctAbove.toStringAsFixed(0)}% vs média ${formatBrl(o.avgPrice)}',
                      onTap: () =>
                          context.push('/insights/product/${o.product.id}'),
                      leading: Container(
                        width: 44,
                        height: 44,
                        decoration: BoxDecoration(
                          color: const Color(0xFFFEE2E2),
                          borderRadius: BorderRadius.circular(14),
                        ),
                        child: const Icon(
                          LucideIcons.trendingUp,
                          color: Color(0xFFDC2626),
                        ),
                      ),
                    ),
                  );
                }),
              const Gap(12),
              Text(
                'Estabelecimentos',
                style: GoogleFonts.plusJakartaSans(
                  fontSize: 18,
                  fontWeight: FontWeight.w800,
                ),
              ),
              const Gap(10),
              ...data.markets.take(8).map((m) {
                final dateFmt = DateFormat('dd/MM/yyyy');
                return Padding(
                  padding: const EdgeInsets.only(bottom: 10),
                  child: ProductItemCard(
                    title: m.market.name,
                    subtitle:
                        '${m.cheapestCount} produtos mais baratos · '
                        '${m.productCount} no histórico'
                        '${m.lastVisit != null ? ' · ${dateFmt.format(m.lastVisit!.toLocal())}' : ''}',
                    leading: Container(
                      width: 44,
                      height: 44,
                      decoration: BoxDecoration(
                        color: AppTheme.cyan.withValues(alpha: 0.2),
                        borderRadius: BorderRadius.circular(14),
                      ),
                      child: const Icon(LucideIcons.store, color: AppTheme.navy),
                    ),
                    onTap: () =>
                        context.push('/insights/market/${m.market.id}'),
                  ),
                );
              }),
            ],
          );
        },
      ),
    );
  }
}

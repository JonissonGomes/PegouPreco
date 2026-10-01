import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gap/gap.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:pegou_preco/core/crowd/trust_engine.dart';
import 'package:pegou_preco/core/di/providers.dart';
import 'package:pegou_preco/core/routing/app_router.dart';
import 'package:pegou_preco/core/theme/app_theme.dart';
import 'package:pegou_preco/core/utils/money.dart';
import 'package:pegou_preco/core/widgets/app_screen_chrome.dart';
import 'package:pegou_preco/core/widgets/empty_state.dart';
import 'package:pegou_preco/core/widgets/skeleton_list.dart';
import 'package:pegou_preco/data/local/insights_repository.dart';
import 'package:pegou_preco/data/local/price_log_repository.dart';
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

final _marketTodayProvider =
    FutureProvider.autoDispose<List<MarketDayItem>>((ref) async {
  final market = await ref.watch(currentMarketProvider.future);
  if (market == null) return const [];
  return ref.watch(priceLogRepositoryProvider).forMarketToday(market.id);
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

class InsightsScreen extends ConsumerStatefulWidget {
  const InsightsScreen({super.key});

  @override
  ConsumerState<InsightsScreen> createState() => _InsightsScreenState();
}

class _InsightsScreenState extends ConsumerState<InsightsScreen> {
  final _searchCtrl = TextEditingController();
  String _query = '';

  @override
  void initState() {
    super.initState();
    _searchCtrl.addListener(() {
      setState(() => _query = _searchCtrl.text.trim().toLowerCase());
    });
  }

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  bool _match(String text) {
    if (_query.isEmpty) return true;
    return text.toLowerCase().contains(_query);
  }

  String _miniDate(DateTime dt) {
    final local = dt.toLocal();
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final day = DateTime(local.year, local.month, local.day);
    final time = DateFormat('HH:mm').format(local);
    if (day == today) return 'hoje · $time';
    return '${DateFormat('dd/MM').format(local)} · $time';
  }

  Future<void> _pickMarket() async {
    final market = await showMarketPickerSheet(context);
    if (market == null) return;
    ref.invalidate(_marketTodayProvider);
    ref.invalidate(_insightsBundleProvider);
  }

  List<Widget> _headerActions() => [
        IconButton(
          tooltip: 'Listas salvas',
          onPressed: () => context.push('/shopping-lists'),
          visualDensity: VisualDensity.compact,
          icon: const Icon(LucideIcons.clipboardList, color: AppTheme.navy),
        ),
        IconButton(
          tooltip: 'Mercado atual',
          onPressed: _pickMarket,
          visualDensity: VisualDensity.compact,
          icon: const Icon(LucideIcons.store, color: AppTheme.navy),
        ),
      ];

  @override
  Widget build(BuildContext context) {
    final bundle = ref.watch(_insightsBundleProvider);
    final market = ref.watch(currentMarketProvider);
    final todayAsync = ref.watch(_marketTodayProvider);
    final navVisible = ref.watch(bottomNavVisibleProvider);
    final headerActions = _headerActions();

    return Scaffold(
      backgroundColor: appScreenBg,
      body: bundle.when(
        loading: () => Column(
          children: [
            AppScreenHeader(
              title: 'Comparar',
              subtitle: 'Alertas e oportunidades',
              subtitleIcon: LucideIcons.lineChart,
              actions: headerActions,
            ),
            const Expanded(child: SkeletonList()),
          ],
        ),
        error: (e, _) => Center(child: Text('Erro: $e')),
        data: (data) {
          final marketName = market.valueOrNull?.name;
          final todayItems = todayAsync.valueOrNull ?? const <MarketDayItem>[];
          final cheap = data.cheap
              .where(
                (r) =>
                    _match(r.product.name) ||
                    _match(r.marketName ?? ''),
              )
              .toList();
          final opps = data.opportunities
              .where((o) => _match(o.product.name))
              .toList();
          final lists = data.lists
              .where(
                (l) =>
                    _match(l.name) || _match(l.marketName ?? ''),
              )
              .toList();
          final markets = data.markets
              .where((m) => _match(m.market.name))
              .toList();
          final todayFiltered = todayItems
              .where((i) => _match(i.productName))
              .toList();
          final alerts = cheap.length + opps.length;
          final empty = cheap.isEmpty &&
              opps.isEmpty &&
              lists.isEmpty &&
              markets.isEmpty &&
              todayFiltered.isEmpty;

          return Column(
            children: [
              AppScreenHeader(
                title: 'Comparar',
                subtitle: marketName ?? 'Preços e alertas',
                subtitleIcon: marketName != null
                    ? LucideIcons.mapPin
                    : LucideIcons.lineChart,
                actions: headerActions,
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
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
                child: TextField(
                  controller: _searchCtrl,
                  decoration: InputDecoration(
                    hintText: 'Buscar item, mercado ou lista…',
                    prefixIcon: const Icon(LucideIcons.search, size: 20),
                    suffixIcon: _query.isEmpty
                        ? null
                        : IconButton(
                            onPressed: () {
                              _searchCtrl.clear();
                            },
                            icon: const Icon(LucideIcons.x, size: 18),
                          ),
                    filled: true,
                    fillColor: Colors.white,
                    contentPadding: const EdgeInsets.symmetric(
                      horizontal: 12,
                      vertical: 12,
                    ),
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(14),
                      borderSide: const BorderSide(color: Color(0xFFE5E7EB)),
                    ),
                    enabledBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(14),
                      borderSide: const BorderSide(color: Color(0xFFE5E7EB)),
                    ),
                  ),
                ),
              ),
              Expanded(
                child: empty
                    ? EmptyState(
                        icon: LucideIcons.search,
                        title: _query.isEmpty
                            ? 'Sem comparações ainda'
                            : 'Nada encontrado',
                        message: _query.isEmpty
                            ? 'Capture preços ou finalize listas para ver alertas '
                                'de preço mais baixo e histórico de compras.'
                            : 'Tente outro termo de busca.',
                        actionLabel:
                            _query.isEmpty ? 'Capturar' : 'Limpar busca',
                        onAction: () {
                          if (_query.isEmpty) {
                            context.go('/capture');
                          } else {
                            _searchCtrl.clear();
                          }
                        },
                      )
                    : ListView(
                        physics: const BouncingScrollPhysics(),
                        padding: EdgeInsets.only(
                          bottom: navVisible ? 110 : 32,
                        ),
                        children: [
                          if (marketName != null) ...[
                            AppSectionTitle(
                              title: 'Hoje neste mercado',
                              trailing: '${todayFiltered.length}',
                            ),
                            if (todayFiltered.isEmpty)
                              Padding(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 20,
                                ),
                                child: Text(
                                  'Nenhum item catalogado hoje em $marketName.',
                                  style: GoogleFonts.plusJakartaSans(
                                    color: AppTheme.muted,
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                              )
                            else
                              ...todayFiltered.map(
                                (item) => Padding(
                                  padding: const EdgeInsets.fromLTRB(
                                    16,
                                    0,
                                    16,
                                    10,
                                  ),
                                  child: AppListCard(
                                    onTap: () => context.push(
                                      '/insights/product/${item.log.productId}',
                                    ),
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
                                            LucideIcons.tag,
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
                                                item.productName,
                                                maxLines: 2,
                                                overflow: TextOverflow.ellipsis,
                                                style:
                                                    GoogleFonts.plusJakartaSans(
                                                  fontWeight: FontWeight.w800,
                                                  fontSize: 14,
                                                  color: AppTheme.navy,
                                                ),
                                              ),
                                              const Gap(2),
                                              Text(
                                                _miniDate(item.log.capturedAt),
                                                style:
                                                    GoogleFonts.plusJakartaSans(
                                                  fontSize: 12,
                                                  fontWeight: FontWeight.w600,
                                                  color: AppTheme.muted,
                                                ),
                                              ),
                                            ],
                                          ),
                                        ),
                                        Text(
                                          formatBrl(item.log.retailPrice),
                                          style: GoogleFonts.plusJakartaSans(
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
                          ],
                          AppSectionTitle(
                            title: 'Preço mais baixo',
                            trailing: '${cheap.length} itens',
                          ),
                          if (cheap.isEmpty)
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
                            ...cheap.map(
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
                                              overflow: TextOverflow.ellipsis,
                                              style:
                                                  GoogleFonts.plusJakartaSans(
                                                fontWeight: FontWeight.w800,
                                                fontSize: 14,
                                                color: AppTheme.navy,
                                              ),
                                            ),
                                            const Gap(2),
                                            Text(
                                              '${row.marketName ?? 'Mercado não informado'}'
                                              ' · ${_miniDate(row.log.capturedAt)}',
                                              style:
                                                  GoogleFonts.plusJakartaSans(
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
                                        style: GoogleFonts.plusJakartaSans(
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
                            trailing: '${opps.length}',
                          ),
                          if (opps.isEmpty)
                            Padding(
                              padding:
                                  const EdgeInsets.symmetric(horizontal: 20),
                              child: Text(
                                'Nenhuma oportunidade agora.',
                                style: GoogleFonts.plusJakartaSans(
                                  color: AppTheme.muted,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            )
                          else
                            ...opps.map(
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
                                              overflow: TextOverflow.ellipsis,
                                              style:
                                                  GoogleFonts.plusJakartaSans(
                                                fontWeight: FontWeight.w800,
                                                fontSize: 14,
                                                color: AppTheme.navy,
                                              ),
                                            ),
                                            const Gap(2),
                                            Text(
                                              '+${o.pctAbove.toStringAsFixed(0)}% vs média ${formatBrl(o.avgPrice)}',
                                              style:
                                                  GoogleFonts.plusJakartaSans(
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
                                        style: GoogleFonts.plusJakartaSans(
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
                            trailing: '${lists.length}',
                          ),
                          if (lists.isEmpty)
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
                            ...lists.map((list) {
                              final date = DateFormat('dd/MM/yyyy').format(
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
                                              style:
                                                  GoogleFonts.plusJakartaSans(
                                                fontWeight: FontWeight.w800,
                                                fontSize: 14,
                                                color: AppTheme.navy,
                                              ),
                                            ),
                                            const Gap(2),
                                            Text(
                                              '${list.marketName ?? 'Mercado'} · $date · ${list.itemCount} itens',
                                              style:
                                                  GoogleFonts.plusJakartaSans(
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
                            trailing: '${markets.length}',
                          ),
                          ...markets.map((m) {
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

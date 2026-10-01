import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gap/gap.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:pegou_preco/core/crowd/trust_engine.dart';
import 'package:pegou_preco/core/di/providers.dart';
import 'package:pegou_preco/core/theme/app_theme.dart';
import 'package:pegou_preco/core/utils/money.dart';
import 'package:pegou_preco/core/widgets/brand_app_bar.dart';
import 'package:pegou_preco/core/widgets/trust_badge.dart';

class InsightsProductScreen extends ConsumerWidget {
  const InsightsProductScreen({super.key, required this.productId});

  final int productId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return FutureBuilder(
      future: () async {
        final product =
            await ref.read(productRepositoryProvider).getById(productId);
        final logs =
            await ref.read(priceLogRepositoryProvider).forProduct(productId);
        final stats = await ref
            .read(priceLogRepositoryProvider)
            .statsForProduct(productId);
        final best =
            await ref.read(insightsRepositoryProvider).bestDateForProduct(productId);
        final wins =
            await ref.read(insightsRepositoryProvider).weekdayWins(productId);
        return (product, logs, stats, best, wins);
      }(),
      builder: (context, snapshot) {
        if (!snapshot.hasData) {
          return const Scaffold(
            body: Center(child: CircularProgressIndicator()),
          );
        }
        final (product, logs, stats, best, wins) = snapshot.data!;
        if (product == null) {
          return Scaffold(
            appBar: AppBar(title: const Text('Produto')),
            body: const Center(child: Text('Não encontrado')),
          );
        }

        final chronological = [...logs]
          ..sort((a, b) => a.capturedAt.compareTo(b.capturedAt));
        final spots = <FlSpot>[];
        for (var i = 0; i < chronological.length; i++) {
          spots.add(FlSpot(i.toDouble(), chronological[i].retailPrice));
        }

        String? usualDay;
        if (wins.isNotEmpty) {
          final bestWd =
              wins.entries.reduce((a, b) => a.value >= b.value ? a : b).key;
          const names = [
            '',
            'segundas',
            'terças',
            'quartas',
            'quintas',
            'sextas',
            'sábados',
            'domingos',
          ];
          usualDay = names[bestWd];
        }

        return Scaffold(
          appBar: BrandAppBar(title: product.name),
          body: ListView(
            padding: const EdgeInsets.fromLTRB(
              AppTheme.pagePadding,
              16,
              AppTheme.pagePadding,
              40,
            ),
            children: [
              if (stats != null) ...[
                _Metric(
                  label: 'Menor histórico',
                  value: formatBrl(stats.minPrice),
                ),
                _Metric(
                  label: 'Média',
                  value: formatBrl(stats.avgPrice),
                ),
                _Metric(
                  label: 'Último',
                  value:
                      '${formatBrl(stats.lastPrice)}'
                      '${stats.lastMarketName != null ? ' · ${stats.lastMarketName}' : ''}',
                ),
              ],
              if (best != null) ...[
                const Gap(12),
                Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: const Color(0xFFDCFCE7),
                    borderRadius: BorderRadius.circular(AppTheme.cardRadius),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Melhor data / preço',
                        style: GoogleFonts.plusJakartaSans(
                          fontWeight: FontWeight.w800,
                          color: AppTheme.trustGreen,
                        ),
                      ),
                      const Gap(6),
                      Text(
                        '${formatBrl(best.minPrice)} em ${best.label}'
                        '${best.marketName != null ? ' · ${best.marketName}' : ''}',
                        style: GoogleFonts.plusJakartaSans(
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      if (usualDay != null) ...[
                        const Gap(6),
                        Text(
                          'Costuma cair às $usualDay',
                          style: GoogleFonts.plusJakartaSans(
                            color: AppTheme.muted,
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
              ],
              const Gap(20),
              Text(
                'Curva de preço',
                style: GoogleFonts.plusJakartaSans(
                  fontWeight: FontWeight.w800,
                  fontSize: 16,
                ),
              ),
              const Gap(12),
              if (spots.length < 2)
                Text(
                  'Precisa de pelo menos 2 registros para o gráfico.',
                  style: GoogleFonts.plusJakartaSans(color: AppTheme.muted),
                )
              else
                SizedBox(
                  height: 200,
                  child: LineChart(
                    LineChartData(
                      gridData: const FlGridData(show: false),
                      titlesData: const FlTitlesData(show: false),
                      borderData: FlBorderData(show: false),
                      lineBarsData: [
                        LineChartBarData(
                          spots: spots,
                          isCurved: true,
                          color: AppTheme.navy,
                          barWidth: 3,
                          dotData: const FlDotData(show: true),
                          belowBarData: BarAreaData(
                            show: true,
                            color: AppTheme.cyan.withValues(alpha: 0.15),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              const Gap(20),
              Text(
                'Registros',
                style: GoogleFonts.plusJakartaSans(
                  fontWeight: FontWeight.w800,
                  fontSize: 16,
                ),
              ),
              const Gap(8),
              ...logs.map((log) {
                final dateFmt = DateFormat('dd/MM/yyyy HH:mm');
                return ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: const Icon(LucideIcons.tag, color: AppTheme.navy),
                  title: Text(
                    formatBrl(log.retailPrice),
                    style: GoogleFonts.plusJakartaSans(
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  subtitle: Text(
                    '${log.source.name} · ${dateFmt.format(log.capturedAt.toLocal())}',
                  ),
                  trailing: TrustBadge(
                    level: TrustEngine.trustKey(log.trustLevel),
                  ),
                );
              }),
            ],
          ),
        );
      },
    );
  }
}

class _Metric extends StatelessWidget {
  const _Metric({required this.label, required this.value});
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(AppTheme.cardRadius),
        border: Border.all(color: AppTheme.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: GoogleFonts.plusJakartaSans(color: AppTheme.muted),
          ),
          const Gap(4),
          Text(
            value,
            style: GoogleFonts.plusJakartaSans(
              fontSize: 18,
              fontWeight: FontWeight.w800,
            ),
          ),
        ],
      ),
    );
  }
}

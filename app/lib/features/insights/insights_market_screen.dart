import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gap/gap.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:pegou_preco/core/di/providers.dart';
import 'package:pegou_preco/core/theme/app_theme.dart';
import 'package:pegou_preco/core/utils/money.dart';
import 'package:pegou_preco/core/widgets/brand_app_bar.dart';
import 'package:pegou_preco/core/widgets/product_item_card.dart';
import 'package:pegou_preco/data/local/schemas.dart';

class InsightsMarketScreen extends ConsumerWidget {
  const InsightsMarketScreen({super.key, required this.marketId});

  final int marketId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return FutureBuilder(
      future: () async {
        final market =
            await ref.read(marketRepositoryProvider).getById(marketId);
        final logs = await ref.read(priceLogRepositoryProvider).recent(limit: 500);
        final forMarket =
            logs.where((l) => l.marketId == marketId).toList();
        final byProduct = <int, PriceLog>{};
        for (final log in forMarket) {
          final prev = byProduct[log.productId];
          if (prev == null || log.capturedAt.isAfter(prev.capturedAt)) {
            byProduct[log.productId] = log;
          }
        }
        final products = <Product>[];
        for (final id in byProduct.keys) {
          final p = await ref.read(productRepositoryProvider).getById(id);
          if (p != null) products.add(p);
        }
        return (market, byProduct, products, forMarket);
      }(),
      builder: (context, snapshot) {
        if (!snapshot.hasData) {
          return const Scaffold(
            body: Center(child: CircularProgressIndicator()),
          );
        }
        final (market, byProduct, products, forMarket) = snapshot.data!;
        if (market == null) {
          return Scaffold(
            appBar: AppBar(),
            body: const Center(child: Text('Mercado não encontrado')),
          );
        }

        DateTime? last;
        for (final l in forMarket) {
          if (last == null || l.capturedAt.isAfter(last)) last = l.capturedAt;
        }
        final avg = forMarket.isEmpty
            ? 0.0
            : forMarket.map((l) => l.retailPrice).reduce((a, b) => a + b) /
                forMarket.length;
        final dateFmt = DateFormat('dd/MM/yyyy');

        return Scaffold(
          appBar: BrandAppBar(title: market.name),
          body: ListView(
            padding: const EdgeInsets.fromLTRB(
              AppTheme.pagePadding,
              16,
              AppTheme.pagePadding,
              40,
            ),
            children: [
              if (market.cnpj != null)
                Text(
                  'CNPJ ${market.cnpj}',
                  style: GoogleFonts.plusJakartaSans(color: AppTheme.muted),
                ),
              const Gap(12),
              _Chip(
                icon: LucideIcons.calendar,
                text: last == null
                    ? 'Sem visitas'
                    : 'Última captura ${dateFmt.format(last.toLocal())}',
              ),
              const Gap(8),
              _Chip(
                icon: LucideIcons.package,
                text: '${products.length} produtos no histórico',
              ),
              const Gap(8),
              _Chip(
                icon: LucideIcons.badgeDollarSign,
                text: 'Ticket médio relativo ${formatBrl(avg)}',
              ),
              const Gap(20),
              Text(
                'Produtos neste mercado',
                style: GoogleFonts.plusJakartaSans(
                  fontWeight: FontWeight.w800,
                  fontSize: 16,
                ),
              ),
              const Gap(10),
              ...products.map((p) {
                final log = byProduct[p.id]!;
                return Padding(
                  padding: const EdgeInsets.only(bottom: 10),
                  child: ProductItemCard(
                    title: p.name,
                    subtitle: formatBrl(log.retailPrice),
                    onTap: () => context.push('/insights/product/${p.id}'),
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

class _Chip extends StatelessWidget {
  const _Chip({required this.icon, required this.text});
  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(AppTheme.controlRadius),
        border: Border.all(color: AppTheme.border),
      ),
      child: Row(
        children: [
          Icon(icon, size: 18, color: AppTheme.navy),
          const Gap(10),
          Expanded(
            child: Text(
              text,
              style: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w600),
            ),
          ),
        ],
      ),
    );
  }
}

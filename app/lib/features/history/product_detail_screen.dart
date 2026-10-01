import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:pegou_preco/core/crowd/trust_engine.dart';
import 'package:pegou_preco/core/di/providers.dart';
import 'package:pegou_preco/core/theme/app_theme.dart';
import 'package:pegou_preco/core/utils/money.dart';
import 'package:pegou_preco/core/widgets/brand_app_bar.dart';
import 'package:pegou_preco/core/widgets/trust_badge.dart';
import 'package:pegou_preco/data/local/schemas.dart';

class ProductDetailScreen extends ConsumerWidget {
  const ProductDetailScreen({super.key, required this.productId});

  final int productId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final productRepo = ref.watch(productRepositoryProvider);
    final priceRepo = ref.watch(priceLogRepositoryProvider);
    final cartRepo = ref.watch(cartRepositoryProvider);
    final dateFmt = DateFormat('dd/MM/yyyy HH:mm');

    return FutureBuilder(
      future: Future.wait([
        productRepo.getById(productId),
        priceRepo.statsForProduct(productId),
        priceRepo.forProduct(productId),
      ]),
      builder: (context, snapshot) {
        if (!snapshot.hasData) {
          return const Scaffold(
            body: Center(child: CircularProgressIndicator()),
          );
        }
        final product = snapshot.data![0] as Product?;
        final stats = snapshot.data![1] as dynamic;
        final logs = snapshot.data![2] as List<PriceLog>;

        if (product == null) {
          return Scaffold(
            appBar: AppBar(),
            body: const Center(child: Text('Produto não encontrado')),
          );
        }

        return Scaffold(
          appBar: BrandAppBar(title: product.name),
          floatingActionButton: logs.isEmpty
              ? null
              : FloatingActionButton.extended(
                  onPressed: () async {
                    final last = logs.first;
                    await cartRepo.upsert(
                      product: product,
                      quantity: 1,
                      retailPrice: last.retailPrice,
                      wholesalePrice: last.wholesalePrice,
                      minWholesaleQty: last.minWholesaleQty,
                    );
                    if (context.mounted) {
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(content: Text('Adicionado ao carrinho')),
                      );
                    }
                  },
                  icon: const Icon(LucideIcons.shoppingCart),
                  label: const Text('Carrinho'),
                ),
          body: ListView(
            physics: const BouncingScrollPhysics(),
            padding: const EdgeInsets.fromLTRB(
              AppTheme.pagePadding,
              16,
              AppTheme.pagePadding,
              100,
            ),
            children: [
              if (stats != null) ...[
                Row(
                  children: [
                    Expanded(
                      child: _StatCard(
                        title: 'Menor',
                        value: formatBrl(stats.minPrice as double),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: _StatCard(
                        title: 'Média',
                        value: formatBrl(stats.avgPrice as double),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: _StatCard(
                        title: 'Maior',
                        value: formatBrl(stats.maxPrice as double),
                      ),
                    ),
                  ],
                ),
                _StatCard(
                  title: 'Última compra',
                  value:
                      '${formatBrl(stats.lastPrice as double)}'
                      '${stats.lastMarketName != null ? ' · ${stats.lastMarketName}' : ''}'
                      '\n${dateFmt.format((stats.lastCapturedAt as DateTime).toLocal())}',
                ),
                const SizedBox(height: 12),
              ],
              Text(
                'Histórico de compra (${logs.length})',
                style: Theme.of(context).textTheme.titleMedium,
              ),
              const SizedBox(height: 8),
              ...logs.map(
                (log) => ListTile(
                  contentPadding: EdgeInsets.zero,
                  title: Text(formatBrl(log.retailPrice)),
                  subtitle: Text(
                    '${log.source.name} · ${dateFmt.format(log.capturedAt.toLocal())}'
                    '${log.wholesalePrice != null ? ' · atacado ${formatBrl(log.wholesalePrice!)}' : ''}',
                  ),
                  trailing: TrustBadge(
                    level: TrustEngine.trustKey(log.trustLevel),
                  ),
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}

class _StatCard extends StatelessWidget {
  const _StatCard({required this.title, required this.value});
  final String title;
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
          Text(title, style: const TextStyle(color: Colors.black54)),
          const SizedBox(height: 4),
          Text(
            value,
            style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700),
          ),
        ],
      ),
    );
  }
}

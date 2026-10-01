import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gap/gap.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:pegou_preco/core/crowd/trust_engine.dart';
import 'package:pegou_preco/core/di/providers.dart';
import 'package:pegou_preco/core/theme/app_theme.dart';
import 'package:pegou_preco/core/utils/money.dart';
import 'package:pegou_preco/core/widgets/app_text_field.dart';
import 'package:pegou_preco/core/widgets/brand_app_bar.dart';
import 'package:pegou_preco/core/widgets/empty_state.dart';
import 'package:pegou_preco/core/widgets/product_item_card.dart';
import 'package:pegou_preco/core/widgets/skeleton_list.dart';
import 'package:pegou_preco/data/local/schemas.dart';

final historyQueryProvider = StateProvider<String>((ref) => '');
final historyCategoryProvider = StateProvider<String?>((ref) => null);

final historyProductsProvider =
    FutureProvider.autoDispose<List<Product>>((ref) async {
  final q = ref.watch(historyQueryProvider);
  final category = ref.watch(historyCategoryProvider);
  final products = await ref.watch(productRepositoryProvider).search(q);
  if (category == null) return products;
  return products.where((p) => p.category == category).toList();
});

class HistoryScreen extends ConsumerWidget {
  const HistoryScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final productsAsync = ref.watch(historyProductsProvider);
    final selectedCategory = ref.watch(historyCategoryProvider);

    return Scaffold(
      appBar: const BrandAppBar(title: 'Histórico de preços'),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(
              AppTheme.pagePadding,
              12,
              AppTheme.pagePadding,
              8,
            ),
            child: AppTextField(
              hint: 'Buscar produto…',
              prefixIcon: LucideIcons.search,
              onChanged: (v) =>
                  ref.read(historyQueryProvider.notifier).state = v,
            ),
          ),
          FutureBuilder<List<String>>(
            future: ref.watch(productRepositoryProvider).distinctCategories(),
            builder: (context, snap) {
              final cats = snap.data ?? const <String>[];
              if (cats.isEmpty) return const SizedBox.shrink();
              return SizedBox(
                height: 42,
                child: ListView(
                  scrollDirection: Axis.horizontal,
                  padding: const EdgeInsets.symmetric(
                    horizontal: AppTheme.pagePadding,
                  ),
                  children: [
                    Padding(
                      padding: const EdgeInsets.only(right: 8),
                      child: FilterChip(
                        label: const Text('Todas'),
                        selected: selectedCategory == null,
                        selectedColor: AppTheme.yellow.withValues(alpha: 0.55),
                        onSelected: (_) => ref
                            .read(historyCategoryProvider.notifier)
                            .state = null,
                      ),
                    ),
                    ...cats.map(
                      (c) => Padding(
                        padding: const EdgeInsets.only(right: 8),
                        child: FilterChip(
                          label: Text(c),
                          selected: selectedCategory == c,
                          selectedColor:
                              AppTheme.yellow.withValues(alpha: 0.55),
                          onSelected: (_) => ref
                              .read(historyCategoryProvider.notifier)
                              .state = c,
                        ),
                      ),
                    ),
                  ],
                ),
              );
            },
          ),
          const Gap(8),
          Expanded(
            child: productsAsync.when(
              loading: () => const SkeletonList(),
              error: (e, _) => Center(child: Text('Erro: $e')),
              data: (products) {
                if (products.isEmpty) {
                  return EmptyState(
                    icon: LucideIcons.tags,
                    title: 'Nenhum produto ainda',
                    message:
                        'Capture uma etiqueta ou importe uma NFC-e para montar seu histórico.',
                    actionLabel: 'Capturar agora',
                    onAction: () => context.go('/capture'),
                  );
                }
                return ListView.separated(
                  physics: const BouncingScrollPhysics(),
                  padding: const EdgeInsets.fromLTRB(
                    AppTheme.pagePadding,
                    4,
                    AppTheme.pagePadding,
                    110,
                  ),
                  itemCount: products.length,
                  separatorBuilder: (_, __) => const Gap(AppTheme.sectionGap),
                  itemBuilder: (context, index) {
                    return _ProductRow(
                      product: products[index],
                      index: index,
                    );
                  },
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

class _ProductRow extends ConsumerWidget {
  const _ProductRow({required this.product, required this.index});
  final Product product;
  final int index;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return FutureBuilder(
      future: () async {
        final stats = await ref
            .read(priceLogRepositoryProvider)
            .statsForProduct(product.id);
        final logs =
            await ref.read(priceLogRepositoryProvider).forProduct(product.id);
        final trust = logs.isEmpty
            ? null
            : TrustEngine.trustKey(logs.first.trustLevel);
        return (stats, trust);
      }(),
      builder: (context, snapshot) {
        final stats = snapshot.data?.$1;
        final trust = snapshot.data?.$2;
        return ProductItemCard(
          animationIndex: index,
          title: product.name,
          subtitle: stats == null
              ? (product.category ?? 'Sem preços registrados')
              : '${product.category != null ? '${product.category} · ' : ''}'
                  'Menor ${formatBrl(stats.minPrice)} · '
                  'Média ${formatBrl(stats.avgPrice)} · '
                  'Último ${formatBrl(stats.lastPrice)}',
          trustLevel: trust,
          onTap: () => context.push('/history/product/${product.id}'),
          trailing: const Icon(LucideIcons.chevronRight, color: AppTheme.muted),
        );
      },
    );
  }
}

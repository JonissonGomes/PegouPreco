import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gap/gap.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:pegou_preco/core/di/providers.dart';
import 'package:pegou_preco/core/theme/app_theme.dart';
import 'package:pegou_preco/core/widgets/brand_app_bar.dart';
import 'package:pegou_preco/core/widgets/empty_state.dart';
import 'package:pegou_preco/core/widgets/pressable.dart';
import 'package:pegou_preco/data/local/schemas.dart';
import 'package:pegou_preco/features/vision/models/review_item.dart';

final pendingReceiptsProvider = StreamProvider<List<PendingReceipt>>((ref) {
  return ref.watch(pendingReceiptRepositoryProvider).watchAll();
});

class PendingReceiptsScreen extends ConsumerWidget {
  const PendingReceiptsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(pendingReceiptsProvider);

    return Scaffold(
      appBar: BrandAppBar(
        title: 'NFC-e pendentes',
        actions: [
          IconButton(
            tooltip: 'Processar fila',
            onPressed: () =>
                ref.read(syncWorkerProvider).processPendingQueue(),
            icon: const Icon(LucideIcons.play),
          ),
        ],
      ),
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('Erro: $e')),
        data: (items) {
          if (items.isEmpty) {
            return EmptyState(
              icon: LucideIcons.fileText,
              title: 'Fila vazia',
              message:
                  'Escaneie o QR da NFC-e na aba Capturar. As notas ficam aqui até a conferência.',
              actionLabel: 'Voltar a capturar',
              onAction: () => context.pop(),
            );
          }
          return ListView.separated(
            physics: const BouncingScrollPhysics(),
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
            itemCount: items.length,
            separatorBuilder: (_, __) => const Gap(10),
            itemBuilder: (context, index) {
              final r = items[index];
              final ready = r.status == ReceiptStatus.parsed ||
                  r.status == ReceiptStatus.review;
              return Pressable(
                onTap: () {
                  if (r.parsedPayloadJson == null) return;
                  final list = (jsonDecode(r.parsedPayloadJson!) as List)
                      .cast<Map<String, dynamic>>()
                      .map(ReviewItem.fromJson)
                      .toList();
                  context.push(
                    '/review',
                    extra: ReviewArgs(
                      items: list,
                      source: ReviewSource.nfce,
                      marketName: r.marketName,
                      marketCnpj: r.marketCnpj,
                      nfceKey: r.nfceKey,
                      pendingReceiptId: r.id,
                    ),
                  );
                },
                child: Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(20),
                    border: Border.all(color: const Color(0xFFE2E8F0)),
                  ),
                  child: Row(
                    children: [
                      Container(
                        width: 44,
                        height: 44,
                        decoration: BoxDecoration(
                          color: ready
                              ? const Color(0xFFDCFCE7)
                              : AppTheme.yellow.withValues(alpha: 0.3),
                          borderRadius: BorderRadius.circular(14),
                        ),
                        child: Icon(
                          ready ? LucideIcons.badgeCheck : LucideIcons.fileClock,
                          color: ready
                              ? const Color(0xFF15803D)
                              : AppTheme.navy,
                        ),
                      ),
                      const Gap(12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              r.marketName ?? r.nfceKey ?? 'NFC-e #${r.id}',
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: GoogleFonts.plusJakartaSans(
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                            const Gap(4),
                            Text(
                              '${r.status.name}'
                              '${r.errorMessage != null ? ' · ${r.errorMessage}' : ''}',
                              style: GoogleFonts.plusJakartaSans(
                                fontSize: 12.5,
                                color: AppTheme.muted,
                              ),
                            ),
                          ],
                        ),
                      ),
                      if (ready)
                        const Icon(LucideIcons.clipboardCheck,
                            color: AppTheme.navy)
                      else
                        IconButton(
                          icon: const Icon(LucideIcons.refreshCw, size: 18),
                          onPressed: () => ref
                              .read(syncWorkerProvider)
                              .processPendingReceipt(r.id),
                        ),
                    ],
                  ),
                ),
              )
                  .animate()
                  .fadeIn(delay: (30 * index).ms)
                  .slideY(begin: 0.08, end: 0);
            },
          );
        },
      ),
    );
  }
}

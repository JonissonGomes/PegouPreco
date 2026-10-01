import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gap/gap.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:pegou_preco/core/di/providers.dart';
import 'package:pegou_preco/core/theme/app_theme.dart';
import 'package:pegou_preco/core/widgets/brand_app_bar.dart';
import 'package:pegou_preco/core/widgets/pressable.dart';

final syncStatusStreamProvider = StreamProvider<String>((ref) {
  return ref.watch(syncWorkerProvider).statusStream;
});

class SyncStatusScreen extends ConsumerWidget {
  const SyncStatusScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final statusAsync = ref.watch(syncStatusStreamProvider);
    final worker = ref.watch(syncWorkerProvider);
    final base = ref.watch(syncApiBaseProvider);
    final status = statusAsync.asData?.value ?? worker.lastStatus;
    final offline = status.toLowerCase().contains('offline') ||
        status.toLowerCase().contains('adiado');

    return Scaffold(
      appBar: const BrandAppBar(title: 'Sincronização'),
      body: ListView(
        physics: const BouncingScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 110),
        children: [
          Container(
            padding: const EdgeInsets.all(18),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(22),
              border: Border.all(color: const Color(0xFFE2E8F0)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Container(
                      width: 44,
                      height: 44,
                      decoration: BoxDecoration(
                        color: offline
                            ? const Color(0xFFFEF3C7)
                            : const Color(0xFFDCFCE7),
                        borderRadius: BorderRadius.circular(14),
                      ),
                      child: Icon(
                        offline ? LucideIcons.cloudOff : LucideIcons.checkCircle2,
                        color: offline
                            ? const Color(0xFFB45309)
                            : const Color(0xFF15803D),
                      ),
                    ),
                    const Gap(12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            offline ? 'API offline' : 'Pronto para sync',
                            style: GoogleFonts.plusJakartaSans(
                              fontWeight: FontWeight.w800,
                              fontSize: 16,
                            ),
                          ),
                          Text(
                            status,
                            style: GoogleFonts.plusJakartaSans(
                              color: AppTheme.muted,
                              fontSize: 13,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
                const Gap(14),
                Text(
                  'Endpoint',
                  style: GoogleFonts.plusJakartaSans(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                    color: AppTheme.muted,
                  ),
                ),
                const Gap(4),
                Text(
                  base,
                  style: GoogleFonts.plusJakartaSans(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: AppTheme.navy,
                  ),
                ),
              ],
            ),
          ).animate().fadeIn(duration: 280.ms).slideY(begin: 0.06, end: 0),
          const Gap(14),
          Pressable(
            onTap: () => worker.runFullSync(),
            child: FilledButton.icon(
              onPressed: () => worker.runFullSync(),
              icon: const Icon(LucideIcons.refreshCw, size: 18),
              label: const Text('Sincronizar agora'),
            ),
          ),
          const Gap(10),
          OutlinedButton.icon(
            onPressed: () => worker.processPendingQueue(),
            icon: const Icon(LucideIcons.receipt, size: 18),
            label: const Text('Processar fila NFC-e'),
          ),
          const Gap(18),
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: AppTheme.yellow.withValues(alpha: 0.22),
              borderRadius: BorderRadius.circular(18),
              border: Border.all(color: AppTheme.yellow.withValues(alpha: 0.55)),
            ),
            child: Text(
              'Preços sincronizados são compartilhados entre usuários '
              '(MongoDB Atlas via sync_api). O carrinho permanece local e privado.',
              style: GoogleFonts.plusJakartaSans(
                fontSize: 13.5,
                height: 1.45,
                color: AppTheme.ink,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

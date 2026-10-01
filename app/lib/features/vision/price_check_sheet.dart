import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:gap/gap.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:pegou_preco/core/theme/app_theme.dart';
import 'package:pegou_preco/core/utils/money.dart';
import 'package:pegou_preco/core/widgets/app_button.dart';
import 'package:pegou_preco/core/widgets/trust_badge.dart';
import 'package:pegou_preco/core/crowd/trust_engine.dart';
import 'package:pegou_preco/data/local/schemas.dart';

enum PriceCheckAction { confirm, reject, photo }

Future<PriceCheckAction?> showPriceCheckSheet(
  BuildContext context, {
  required PriceLog log,
  required String productName,
  String? marketName,
}) {
  return showModalBottomSheet<PriceCheckAction>(
    context: context,
    showDragHandle: true,
    builder: (_) => Padding(
      padding: const EdgeInsets.fromLTRB(
        AppTheme.pagePadding,
        8,
        AppTheme.pagePadding,
        28,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  'Checagem de Preço',
                  style: GoogleFonts.plusJakartaSans(
                    fontSize: 20,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
              TrustBadge(level: TrustEngine.trustKey(log.trustLevel)),
            ],
          ),
          const Gap(8),
          Text(
            'Este preço ainda está valendo?',
            style: GoogleFonts.plusJakartaSans(
              color: AppTheme.muted,
              fontWeight: FontWeight.w500,
            ),
          ),
          const Gap(16),
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: AppTheme.surface,
              borderRadius: BorderRadius.circular(AppTheme.cardRadius),
              border: Border.all(color: AppTheme.border),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  productName,
                  style: GoogleFonts.plusJakartaSans(
                    fontWeight: FontWeight.w800,
                    fontSize: 16,
                  ),
                ),
                const Gap(6),
                Text(
                  formatBrl(log.retailPrice),
                  style: GoogleFonts.plusJakartaSans(
                    fontSize: 28,
                    fontWeight: FontWeight.w800,
                    color: AppTheme.navy,
                  ),
                ),
                if (marketName != null) ...[
                  const Gap(4),
                  Text(
                    marketName,
                    style: GoogleFonts.plusJakartaSans(color: AppTheme.muted),
                  ),
                ],
              ],
            ),
          ),
          const Gap(20),
          AppButton(
            label: 'Sim, continua',
            icon: LucideIcons.check,
            onPressed: () {
              HapticFeedback.mediumImpact();
              Navigator.pop(context, PriceCheckAction.confirm);
            },
          ),
          const Gap(10),
          AppButton(
            label: 'Não, mudou',
            outlined: true,
            icon: LucideIcons.x,
            onPressed: () {
              HapticFeedback.lightImpact();
              Navigator.pop(context, PriceCheckAction.reject);
            },
          ),
          const Gap(10),
          AppButton(
            label: 'Tirar foto da nova etiqueta',
            outlined: true,
            icon: LucideIcons.camera,
            onPressed: () {
              HapticFeedback.lightImpact();
              Navigator.pop(context, PriceCheckAction.photo);
            },
          ),
        ],
      ),
    ),
  );
}

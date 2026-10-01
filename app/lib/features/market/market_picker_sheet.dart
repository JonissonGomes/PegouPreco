import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gap/gap.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:pegou_preco/core/di/providers.dart';
import 'package:pegou_preco/core/theme/app_theme.dart';
import 'package:pegou_preco/core/widgets/app_button.dart';
import 'package:pegou_preco/core/widgets/app_text_field.dart';
import 'package:pegou_preco/data/local/schemas.dart';

Future<Market?> showMarketPickerSheet(BuildContext context) {
  return showModalBottomSheet<Market>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (_) => const _MarketPickerBody(),
  );
}

class _MarketPickerBody extends ConsumerStatefulWidget {
  const _MarketPickerBody();

  @override
  ConsumerState<_MarketPickerBody> createState() => _MarketPickerBodyState();
}

class _MarketPickerBodyState extends ConsumerState<_MarketPickerBody> {
  final _nameCtrl = TextEditingController();
  final _cnpjCtrl = TextEditingController();
  List<Market> _markets = [];
  var _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final all = await ref.read(marketRepositoryProvider).all();
    if (!mounted) return;
    setState(() {
      _markets = all;
      _loading = false;
    });
  }

  Future<void> _create() async {
    final name = _nameCtrl.text.trim();
    if (name.isEmpty) return;
    HapticFeedback.lightImpact();
    final market = await ref.read(marketRepositoryProvider).resolveOrCreate(
          name: name,
          cnpj: _cnpjCtrl.text.trim().isEmpty ? null : _cnpjCtrl.text,
        );
    await ref.read(currentMarketIdProvider.notifier).setMarketId(market.id);
    if (mounted) Navigator.pop(context, market);
  }

  Future<void> _select(Market m) async {
    HapticFeedback.selectionClick();
    await ref.read(currentMarketIdProvider.notifier).setMarketId(m.id);
    if (mounted) Navigator.pop(context, m);
  }

  @override
  void dispose() {
    _nameCtrl.dispose();
    _cnpjCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.fromLTRB(
        AppTheme.pagePadding,
        8,
        AppTheme.pagePadding,
        MediaQuery.viewInsetsOf(context).bottom + 24,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            'Mercado atual',
            style: GoogleFonts.plusJakartaSans(
              fontSize: 20,
              fontWeight: FontWeight.w800,
            ),
          ),
          const Gap(4),
          Text(
            'Escolha ou crie o estabelecimento onde você está.',
            style: GoogleFonts.plusJakartaSans(color: AppTheme.muted),
          ),
          const Gap(16),
          if (_loading)
            const Padding(
              padding: EdgeInsets.all(24),
              child: Center(child: CircularProgressIndicator()),
            )
          else if (_markets.isEmpty)
            Text(
              'Nenhum mercado salvo ainda.',
              style: GoogleFonts.plusJakartaSans(color: AppTheme.muted),
            )
          else
            ConstrainedBox(
              constraints: const BoxConstraints(maxHeight: 220),
              child: ListView.separated(
                shrinkWrap: true,
                itemCount: _markets.length,
                separatorBuilder: (_, __) => const Gap(8),
                itemBuilder: (context, i) {
                  final m = _markets[i];
                  return ListTile(
                    shape: RoundedRectangleBorder(
                      borderRadius:
                          BorderRadius.circular(AppTheme.controlRadius),
                      side: const BorderSide(color: AppTheme.border),
                    ),
                    leading: const Icon(LucideIcons.store, color: AppTheme.navy),
                    title: Text(
                      m.name,
                      style: GoogleFonts.plusJakartaSans(
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    subtitle: m.cnpj != null ? Text('CNPJ ${m.cnpj}') : null,
                    onTap: () => _select(m),
                  );
                },
              ),
            ),
          const Gap(20),
          Text(
            'Novo mercado',
            style: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w800),
          ),
          const Gap(10),
          AppTextField(
            controller: _nameCtrl,
            label: 'Nome',
            hint: 'Ex.: Mercado Bom Preço',
            prefixIcon: LucideIcons.store,
          ),
          const Gap(12),
          AppTextField(
            controller: _cnpjCtrl,
            label: 'CNPJ (opcional)',
            hint: '00.000.000/0000-00',
            keyboardType: TextInputType.number,
            prefixIcon: LucideIcons.badgeInfo,
          ),
          const Gap(16),
          AppButton(
            label: 'Usar este mercado',
            icon: LucideIcons.check,
            onPressed: _create,
          ),
        ],
      ),
    );
  }
}

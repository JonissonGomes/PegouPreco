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
  final _queryCtrl = TextEditingController();
  List<Market> _markets = [];
  var _loading = true;
  var _saving = false;

  @override
  void initState() {
    super.initState();
    _load();
    _queryCtrl.addListener(() => setState(() {}));
  }

  Future<void> _load() async {
    final all = await ref.read(marketRepositoryProvider).all();
    if (!mounted) return;
    setState(() {
      _markets = all;
      _loading = false;
    });
  }

  List<Market> get _filtered {
    final q = _queryCtrl.text.trim().toLowerCase();
    if (q.isEmpty) return _markets;
    return _markets
        .where((m) => m.name.toLowerCase().contains(q))
        .toList();
  }

  bool get _canCreate {
    final q = _queryCtrl.text.trim();
    if (q.isEmpty) return false;
    return !_markets.any(
      (m) => m.name.toLowerCase() == q.toLowerCase(),
    );
  }

  Future<void> _select(Market m) async {
    HapticFeedback.selectionClick();
    await ref.read(currentMarketIdProvider.notifier).setMarketId(m.id);
    if (mounted) Navigator.pop(context, m);
  }

  Future<void> _createFromQuery() async {
    final name = _queryCtrl.text.trim();
    if (name.isEmpty) return;
    setState(() => _saving = true);
    HapticFeedback.lightImpact();
    final market = await ref
        .read(marketRepositoryProvider)
        .resolveOrCreate(name: name);
    await ref.read(currentMarketIdProvider.notifier).setMarketId(market.id);
    if (mounted) Navigator.pop(context, market);
  }

  @override
  void dispose() {
    _queryCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final filtered = _filtered;
    final query = _queryCtrl.text.trim();

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
            'Busque e selecione. Se não existir, será criado.',
            style: GoogleFonts.plusJakartaSans(color: AppTheme.muted),
          ),
          const Gap(16),
          AppTextField(
            controller: _queryCtrl,
            label: 'Mercado',
            hint: 'Ex.: Atacadão, Carrefour…',
            prefixIcon: LucideIcons.search,
          ),
          const Gap(12),
          if (_loading)
            const Padding(
              padding: EdgeInsets.all(24),
              child: Center(child: CircularProgressIndicator()),
            )
          else ...[
            ConstrainedBox(
              constraints: BoxConstraints(
                maxHeight: MediaQuery.sizeOf(context).height * 0.35,
              ),
              child: filtered.isEmpty && query.isNotEmpty
                  ? Padding(
                      padding: const EdgeInsets.symmetric(vertical: 12),
                      child: Text(
                        'Nenhum mercado com esse nome. Toque em criar abaixo.',
                        style: GoogleFonts.plusJakartaSans(
                          color: AppTheme.muted,
                          fontSize: 13,
                        ),
                      ),
                    )
                  : filtered.isEmpty
                      ? Padding(
                          padding: const EdgeInsets.symmetric(vertical: 12),
                          child: Text(
                            'Digite o nome do mercado para buscar ou criar.',
                            style: GoogleFonts.plusJakartaSans(
                              color: AppTheme.muted,
                              fontSize: 13,
                            ),
                          ),
                        )
                      : ListView.separated(
                          shrinkWrap: true,
                          itemCount: filtered.length,
                          separatorBuilder: (_, __) => const Gap(8),
                          itemBuilder: (context, i) {
                            final m = filtered[i];
                            return ListTile(
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(
                                  AppTheme.controlRadius,
                                ),
                                side: const BorderSide(color: AppTheme.border),
                              ),
                              leading: const Icon(
                                LucideIcons.store,
                                color: AppTheme.navy,
                              ),
                              title: Text(
                                m.name,
                                style: GoogleFonts.plusJakartaSans(
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                              subtitle: m.cnpj != null
                                  ? Text('CNPJ ${m.cnpj}')
                                  : null,
                              onTap: () => _select(m),
                            );
                          },
                        ),
            ),
            if (_canCreate) ...[
              const Gap(12),
              AppButton(
                label: _saving ? 'Criando…' : 'Usar "$query" (novo)',
                icon: LucideIcons.plus,
                onPressed: _saving ? null : _createFromQuery,
              ),
            ],
          ],
        ],
      ),
    );
  }
}

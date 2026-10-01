import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gap/gap.dart';
import 'package:geolocator/geolocator.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:pegou_preco/core/di/providers.dart';
import 'package:pegou_preco/core/permissions/permission_gate.dart';
import 'package:pegou_preco/core/theme/app_theme.dart';
import 'package:pegou_preco/core/widgets/app_button.dart';
import 'package:pegou_preco/core/widgets/app_text_field.dart';
import 'package:pegou_preco/data/local/schemas.dart';

/// Retorna true se a lista ativa foi criada.
Future<bool> showStartListSheet(
  BuildContext context, {
  bool barrierDismissible = false,
}) async {
  final result = await showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    isDismissible: barrierDismissible,
    enableDrag: barrierDismissible,
    showDragHandle: true,
    builder: (_) => const _StartListBody(),
  );
  return result == true;
}

class _NearbyMarket {
  _NearbyMarket({required this.market, required this.distanceKm});
  final Market market;
  final double distanceKm;
}

class _StartListBody extends ConsumerStatefulWidget {
  const _StartListBody();

  @override
  ConsumerState<_StartListBody> createState() => _StartListBodyState();
}

class _StartListBodyState extends ConsumerState<_StartListBody> {
  final _listNameCtrl = TextEditingController();
  final _marketNameCtrl = TextEditingController();
  List<_NearbyMarket> _nearby = [];
  Market? _selected;
  var _loadingGeo = true;
  var _hasLocation = false;
  var _saving = false;

  @override
  void initState() {
    super.initState();
    _bootstrapGeo();
  }

  @override
  void dispose() {
    _listNameCtrl.dispose();
    _marketNameCtrl.dispose();
    super.dispose();
  }

  double _haversineKm(
    double lat1,
    double lon1,
    double lat2,
    double lon2,
  ) {
    const r = 6371.0;
    final dLat = _rad(lat2 - lat1);
    final dLon = _rad(lon2 - lon1);
    final a = math.sin(dLat / 2) * math.sin(dLat / 2) +
        math.cos(_rad(lat1)) *
            math.cos(_rad(lat2)) *
            math.sin(dLon / 2) *
            math.sin(dLon / 2);
    return r * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a));
  }

  double _rad(double deg) => deg * math.pi / 180;

  Future<void> _bootstrapGeo() async {
    final loc = await PermissionGate.ensureLocation();
    if (loc != PermissionGateResult.granted) {
      if (mounted) {
        setState(() {
          _hasLocation = false;
          _loadingGeo = false;
        });
      }
      return;
    }

    try {
      final pos = await Geolocator.getCurrentPosition();
      final markets = await ref.read(marketRepositoryProvider).all();
      final withGeo = markets
          .where((m) => m.lat != null && m.lng != null)
          .map(
            (m) => _NearbyMarket(
              market: m,
              distanceKm: _haversineKm(
                pos.latitude,
                pos.longitude,
                m.lat!,
                m.lng!,
              ),
            ),
          )
          .where((n) => n.distanceKm <= 5)
          .toList()
        ..sort((a, b) => a.distanceKm.compareTo(b.distanceKm));

      if (!mounted) return;
      setState(() {
        _hasLocation = true;
        _nearby = withGeo;
        _loadingGeo = false;
      });
    } catch (_) {
      if (mounted) {
        setState(() {
          _hasLocation = false;
          _loadingGeo = false;
        });
      }
    }
  }

  Future<void> _confirm() async {
    final listName = _listNameCtrl.text.trim();
    if (listName.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Informe o nome da lista')),
      );
      return;
    }

    Market? market = _selected;
    if (market == null) {
      final typed = _marketNameCtrl.text.trim();
      if (typed.isEmpty) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Informe o nome do mercado')),
        );
        return;
      }
      market = await ref.read(marketRepositoryProvider).resolveOrCreate(
            name: typed,
          );
    }

    setState(() => _saving = true);
    HapticFeedback.mediumImpact();
    await ref.read(activeShoppingListProvider.notifier).start(
          name: listName,
          marketId: market.id,
        );
    if (mounted) Navigator.pop(context, true);
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
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              'Nova lista de compras',
              style: GoogleFonts.plusJakartaSans(
                fontSize: 20,
                fontWeight: FontWeight.w800,
              ),
            ),
            const Gap(4),
            Text(
              'Nomeie a lista e informe o mercado antes de ler etiquetas.',
              style: GoogleFonts.plusJakartaSans(color: AppTheme.muted),
            ),
            const Gap(16),
            AppTextField(
              controller: _listNameCtrl,
              label: 'Nome da lista',
              hint: 'Ex.: Compras da semana',
              prefixIcon: LucideIcons.shoppingBasket,
            ),
            const Gap(16),
            Text(
              'Mercado',
              style: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w800),
            ),
            const Gap(8),
            if (_loadingGeo)
              const Padding(
                padding: EdgeInsets.all(16),
                child: Center(child: CircularProgressIndicator()),
              )
            else if (_hasLocation) ...[
              if (_nearby.isEmpty)
                Text(
                  'Nenhum mercado cadastrado perto de você. Digite o nome.',
                  style: GoogleFonts.plusJakartaSans(
                    color: AppTheme.muted,
                    fontSize: 13,
                  ),
                )
              else
                ConstrainedBox(
                  constraints: const BoxConstraints(maxHeight: 200),
                  child: ListView.separated(
                    shrinkWrap: true,
                    itemCount: _nearby.length,
                    separatorBuilder: (_, __) => const Gap(8),
                    itemBuilder: (context, i) {
                      final n = _nearby[i];
                      final selected = _selected?.id == n.market.id;
                      return ListTile(
                        selected: selected,
                        selectedTileColor:
                            AppTheme.yellow.withValues(alpha: 0.25),
                        shape: RoundedRectangleBorder(
                          borderRadius:
                              BorderRadius.circular(AppTheme.controlRadius),
                          side: BorderSide(
                            color: selected ? AppTheme.navy : AppTheme.border,
                          ),
                        ),
                        leading: Icon(
                          LucideIcons.store,
                          color: selected ? AppTheme.navy : AppTheme.muted,
                        ),
                        title: Text(
                          n.market.name,
                          style: GoogleFonts.plusJakartaSans(
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        subtitle: Text(
                          '${n.distanceKm.toStringAsFixed(1)} km'
                          '${n.market.avgRating != null ? ' · ★ ${n.market.avgRating!.toStringAsFixed(1)}' : ''}',
                        ),
                        onTap: () {
                          setState(() {
                            _selected = n.market;
                            _marketNameCtrl.text = n.market.name;
                          });
                        },
                      );
                    },
                  ),
                ),
              const Gap(12),
            ],
            AppTextField(
              controller: _marketNameCtrl,
              label: _hasLocation
                  ? 'Ou digite o nome do mercado'
                  : 'Nome do mercado',
              hint: 'Ex.: Mercado Bom Preço',
              prefixIcon: LucideIcons.store,
              onChanged: (_) {
                if (_selected != null) {
                  setState(() => _selected = null);
                }
              },
            ),
            if (!_hasLocation && !_loadingGeo) ...[
              const Gap(8),
              Text(
                'Sem acesso à localização — informe o mercado manualmente.',
                style: GoogleFonts.plusJakartaSans(
                  color: AppTheme.muted,
                  fontSize: 13,
                ),
              ),
            ],
            const Gap(20),
            AppButton(
              label: _saving ? 'Salvando…' : 'Começar lista',
              icon: LucideIcons.check,
              onPressed: _saving ? null : _confirm,
            ),
          ],
        ),
      ),
    );
  }
}

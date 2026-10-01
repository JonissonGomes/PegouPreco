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

class _MarketOption {
  _MarketOption({required this.market, this.distanceKm});
  final Market market;
  final double? distanceKm;
}

class _StartListBody extends ConsumerStatefulWidget {
  const _StartListBody();

  @override
  ConsumerState<_StartListBody> createState() => _StartListBodyState();
}

class _StartListBodyState extends ConsumerState<_StartListBody> {
  final _listNameCtrl = TextEditingController();
  final _marketCtrl = TextEditingController();
  List<_MarketOption> _all = [];
  Market? _selected;
  var _loadingGeo = true;
  var _saving = false;

  @override
  void initState() {
    super.initState();
    _marketCtrl.addListener(() => setState(() {}));
    _bootstrap();
  }

  @override
  void dispose() {
    _listNameCtrl.dispose();
    _marketCtrl.dispose();
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

  Future<void> _bootstrap() async {
    final markets = await ref.read(marketRepositoryProvider).all();
    Position? pos;
    final loc = await PermissionGate.ensureLocation();
    if (loc == PermissionGateResult.granted) {
      try {
        pos = await Geolocator.getCurrentPosition(
          locationSettings: const LocationSettings(
            accuracy: LocationAccuracy.best,
            distanceFilter: 0,
          ),
        );
      } catch (_) {}
    }

    final options = markets.map((m) {
      double? dist;
      if (pos != null && m.lat != null && m.lng != null) {
        dist = _haversineKm(pos.latitude, pos.longitude, m.lat!, m.lng!);
      }
      return _MarketOption(market: m, distanceKm: dist);
    }).toList()
      ..sort((a, b) {
        final da = a.distanceKm ?? 9999;
        final db = b.distanceKm ?? 9999;
        return da.compareTo(db);
      });

    if (!mounted) return;
    setState(() {
      _all = options;
      _loadingGeo = false;
    });
  }

  List<_MarketOption> get _filtered {
    final q = _marketCtrl.text.trim().toLowerCase();
    if (q.isEmpty) {
      // Sem busca: próximos (≤5km) ou todos se não houver geo.
      final near = _all
          .where((o) => o.distanceKm != null && o.distanceKm! <= 5)
          .toList();
      return near.isNotEmpty ? near : _all.take(8).toList();
    }
    return _all
        .where((o) => o.market.name.toLowerCase().contains(q))
        .toList();
  }

  bool get _canCreate {
    final q = _marketCtrl.text.trim();
    if (q.isEmpty) return false;
    return !_all.any((o) => o.market.name.toLowerCase() == q.toLowerCase());
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
      final typed = _marketCtrl.text.trim();
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
    final filtered = _filtered;
    final query = _marketCtrl.text.trim();

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
              'Nomeie a lista e escolha o mercado. Se não existir, será criado.',
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
            AppTextField(
              controller: _marketCtrl,
              label: 'Mercado',
              hint: 'Buscar ou criar mercado…',
              prefixIcon: LucideIcons.search,
              onChanged: (_) {
                if (_selected != null) {
                  setState(() => _selected = null);
                }
              },
            ),
            const Gap(10),
            if (_loadingGeo)
              const Padding(
                padding: EdgeInsets.all(16),
                child: Center(child: CircularProgressIndicator()),
              )
            else ...[
              if (filtered.isEmpty && query.isNotEmpty)
                Text(
                  'Nenhum mercado com esse nome — toque em Começar para criar.',
                  style: GoogleFonts.plusJakartaSans(
                    color: AppTheme.muted,
                    fontSize: 13,
                  ),
                )
              else if (filtered.isNotEmpty)
                ConstrainedBox(
                  constraints: const BoxConstraints(maxHeight: 200),
                  child: ListView.separated(
                    shrinkWrap: true,
                    itemCount: filtered.length,
                    separatorBuilder: (_, __) => const Gap(8),
                    itemBuilder: (context, i) {
                      final n = filtered[i];
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
                        subtitle: n.distanceKm != null
                            ? Text(
                                '${n.distanceKm!.toStringAsFixed(1)} km'
                                '${n.market.avgRating != null ? ' · ★ ${n.market.avgRating!.toStringAsFixed(1)}' : ''}',
                              )
                            : null,
                        onTap: () {
                          setState(() {
                            _selected = n.market;
                            _marketCtrl.text = n.market.name;
                          });
                        },
                      );
                    },
                  ),
                ),
              if (_canCreate) ...[
                const Gap(8),
                Text(
                  'Será criado: "$query"',
                  style: GoogleFonts.plusJakartaSans(
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                    color: AppTheme.navy,
                  ),
                ),
              ],
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

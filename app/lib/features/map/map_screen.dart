import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gap/gap.dart';
import 'package:geolocator/geolocator.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:latlong2/latlong.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:pegou_preco/core/di/providers.dart';
import 'package:pegou_preco/core/permissions/permission_gate.dart';
import 'package:pegou_preco/core/routing/app_router.dart';
import 'package:pegou_preco/core/theme/app_theme.dart';
import 'package:pegou_preco/core/widgets/app_button.dart';
import 'package:pegou_preco/core/widgets/app_screen_chrome.dart';
import 'package:pegou_preco/data/local/schemas.dart';

/// Centro padrão (SP) até obter localização.
const _defaultCenter = LatLng(-23.5505, -46.6333);

/// Tiles OpenStreetMap — gratuitos, sem API key.
/// Política de uso: User-Agent identificável (userAgentPackageName abaixo).
const _freeTileUrl = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

class MapScreen extends ConsumerStatefulWidget {
  const MapScreen({super.key});

  @override
  ConsumerState<MapScreen> createState() => _MapScreenState();
}

class _MapScreenState extends ConsumerState<MapScreen> {
  final _mapController = MapController();
  LatLng _center = _defaultCenter;
  List<Market> _markets = [];
  var _loading = true;
  var _locationBlocked = false;

  @override
  void initState() {
    super.initState();
    _bootstrap();
  }

  Future<void> _bootstrap() async {
    await _loadMarkets();
    await _locate(showBlockedDialog: false);
    if (mounted) setState(() => _loading = false);
  }

  Future<void> _loadMarkets() async {
    final markets = await ref.read(marketRepositoryProvider).all();
    try {
      final api = ref.read(syncApiClientProvider);
      final session = ref.read(authSessionProvider).valueOrNull;
      final remote = await api.marketsMap(token: session?.token);
      for (final raw in remote) {
        final name = raw['name'] as String? ?? '';
        if (name.isEmpty) continue;
        final m = await ref.read(marketRepositoryProvider).resolveOrCreate(
              name: name,
              cnpj: raw['cnpj'] as String?,
              uf: raw['uf'] as String?,
            );
        await ref.read(marketRepositoryProvider).updateGeo(
              m.id,
              lat: (raw['lat'] as num?)?.toDouble(),
              lng: (raw['lng'] as num?)?.toDouble(),
              address: raw['address'] as String?,
              avgRating: (raw['avgRating'] as num?)?.toDouble(),
              ratingsCount: (raw['ratingsCount'] as num?)?.toInt(),
              priceLevel: raw['priceLevel'] as String?,
              remoteId: raw['id'] as String?,
            );
      }
      final refreshed = await ref.read(marketRepositoryProvider).all();
      if (mounted) setState(() => _markets = refreshed);
    } catch (_) {
      if (mounted) setState(() => _markets = markets);
    }
  }

  Future<void> _locate({bool showBlockedDialog = true}) async {
    final result = await PermissionGate.ensureLocation();
    if (result != PermissionGateResult.granted) {
      if (mounted) {
        setState(() => _locationBlocked = true);
        if (showBlockedDialog) {
          await PermissionGate.showBlockedMessage(
            context,
            featureName: 'a localização no mapa',
            permissionName: 'localização',
            offerSettings: result == PermissionGateResult.permanentlyDenied,
          );
        }
      }
      return;
    }

    // Última posição conhecida primeiro (rápido), depois GPS de alta precisão.
    try {
      final last = await Geolocator.getLastKnownPosition();
      if (last != null && mounted) {
        final quick = LatLng(last.latitude, last.longitude);
        setState(() {
          _center = quick;
          _locationBlocked = false;
        });
        _mapController.move(quick, 15);
      }
    } catch (_) {}

    try {
      final pos = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.best,
          distanceFilter: 0,
        ),
      );
      final ll = LatLng(pos.latitude, pos.longitude);
      if (!mounted) return;
      setState(() {
        _center = ll;
        _locationBlocked = false;
      });
      _mapController.move(ll, 16);
    } catch (_) {
      if (mounted && _locationBlocked) {
        // Mantém estado; usuário pode tentar de novo pelo FAB.
      }
    }
  }

  Color _markerColor(String? level) {
    switch (level) {
      case 'low':
        return AppTheme.trustGreen;
      case 'high':
        return const Color(0xFFDC2626);
      default:
        return AppTheme.navy;
    }
  }

  String _levelLabel(String? level) {
    switch (level) {
      case 'low':
        return 'Preços baixos';
      case 'high':
        return 'Preços altos';
      default:
        return 'Preços na média';
    }
  }

  Future<void> _openMarket(Market m) async {
    await showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      backgroundColor: Colors.white,
      builder: (ctx) => Padding(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 28),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              m.name,
              style: GoogleFonts.plusJakartaSans(
                fontSize: 20,
                fontWeight: FontWeight.w800,
                color: AppTheme.navy,
              ),
            ),
            const Gap(8),
            Text(
              'Nota ${(m.avgRating ?? 0).toStringAsFixed(1)} '
              '(${m.ratingsCount} avaliações)',
              style: GoogleFonts.plusJakartaSans(
                color: AppTheme.muted,
                fontWeight: FontWeight.w600,
              ),
            ),
            const Gap(4),
            Text(
              _levelLabel(m.priceLevel),
              style: GoogleFonts.plusJakartaSans(
                fontWeight: FontWeight.w800,
                color: _markerColor(m.priceLevel),
              ),
            ),
            if (m.address != null) ...[
              const Gap(6),
              Text(
                m.address!,
                style: GoogleFonts.plusJakartaSans(fontSize: 13),
              ),
            ],
            const Gap(16),
            AppButton(
              label: 'Avaliar anonimamente',
              icon: LucideIcons.star,
              onPressed: () async {
                Navigator.pop(ctx);
                await _rateMarket(m);
              },
            ),
            if (m.remoteId != null) ...[
              const Gap(10),
              FutureBuilder<List<Map<String, dynamic>>>(
                future: ref
                    .read(syncApiClientProvider)
                    .marketReviews(m.remoteId!),
                builder: (context, snap) {
                  final reviews = snap.data ?? const [];
                  if (reviews.isEmpty) {
                    return Text(
                      'Sem avaliações públicas ainda',
                      style: GoogleFonts.plusJakartaSans(
                        color: AppTheme.muted,
                        fontSize: 13,
                      ),
                    );
                  }
                  return Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Últimas notas (anônimas)',
                        style: GoogleFonts.plusJakartaSans(
                          fontWeight: FontWeight.w800,
                          color: AppTheme.navy,
                        ),
                      ),
                      const Gap(6),
                      for (final r in reviews.take(5))
                        Padding(
                          padding: const EdgeInsets.only(bottom: 4),
                          child: Text(
                            '★ ${r['stars']} · ${_shortDate(r['createdAt'])}',
                            style: GoogleFonts.plusJakartaSans(fontSize: 13),
                          ),
                        ),
                    ],
                  );
                },
              ),
            ],
          ],
        ),
      ),
    );
  }

  String _shortDate(Object? raw) {
    final dt = DateTime.tryParse(raw?.toString() ?? '');
    if (dt == null) return '—';
    return '${dt.day.toString().padLeft(2, '0')}/'
        '${dt.month.toString().padLeft(2, '0')}';
  }

  Future<void> _rateMarket(Market m) async {
    final session = ref.read(authSessionProvider).valueOrNull;
    if (session == null || !session.emailVerified) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Faça login e confirme o e-mail para avaliar'),
        ),
      );
      return;
    }
    var stars = 5;
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setLocal) => AlertDialog(
          title: const Text('Sua nota (anônima)'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text('Avaliação de ${m.name} — sem exibir seu nome.'),
              const Gap(12),
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: List.generate(5, (i) {
                  final n = i + 1;
                  return IconButton(
                    onPressed: () => setLocal(() => stars = n),
                    icon: Icon(
                      LucideIcons.star,
                      color: n <= stars ? AppTheme.yellow : AppTheme.border,
                    ),
                  );
                }),
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Cancelar'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('Enviar'),
            ),
          ],
        ),
      ),
    );
    if (ok != true) return;
    try {
      final remoteId = m.remoteId;
      if (remoteId == null) {
        throw StateError('Mercado ainda sem id remoto — sincronize primeiro');
      }
      await ref.read(syncApiClientProvider).submitMarketReview(
            token: session.token,
            marketId: remoteId,
            stars: stars,
          );
      await _loadMarkets();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Avaliação enviada anonimamente')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Falha: $e')),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final withGeo =
        _markets.where((m) => m.lat != null && m.lng != null).toList();
    final rated = withGeo.where((m) => (m.avgRating ?? 0) > 0).length;
    final navVisible = ref.watch(bottomNavVisibleProvider);
    final fabPad = navVisible ? appBottomNavClearance : 16.0;

    return Scaffold(
      backgroundColor: appScreenBg,
      floatingActionButton: Padding(
        padding: EdgeInsets.only(bottom: fabPad),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            FloatingActionButton.small(
              heroTag: 'map_locate_fab',
              tooltip: 'Minha localização',
              backgroundColor: Colors.white,
              foregroundColor: AppTheme.navy,
              onPressed: () => _locate(),
              child: const Icon(LucideIcons.locate, size: 20),
            ),
            const Gap(8),
            AppActionsFab(
              heroTag: 'map_actions_fab',
              actions: [
                AppHeaderAction(
                  icon: LucideIcons.refreshCw,
                  label: 'Atualizar mercados',
                  onTap: _loadMarkets,
                ),
                AppHeaderAction(
                  icon: LucideIcons.locate,
                  label: 'Centralizar em mim',
                  onTap: () => _locate(),
                ),
              ],
            ),
          ],
        ),
      ),
      floatingActionButtonLocation: FloatingActionButtonLocation.endFloat,
      body: Column(
        children: [
          AppScreenHeader(
            title: 'Mapa',
            subtitle: _locationBlocked
                ? 'Localização desativada'
                : 'Perto de você',
            subtitleIcon: LucideIcons.map,
          ),
          AppScreenNavyBar(
            label: 'mercados',
            value: '${withGeo.length}',
            trailing: Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              decoration: BoxDecoration(
                color: AppTheme.yellowBright,
                borderRadius: BorderRadius.circular(999),
              ),
              child: Text(
                '$rated com nota',
                style: GoogleFonts.plusJakartaSans(
                  color: AppTheme.navy,
                  fontSize: 11,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ),
          ),
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator())
                : Stack(
                    children: [
                      FlutterMap(
                        mapController: _mapController,
                        options: MapOptions(
                          initialCenter: _center,
                          initialZoom: 15,
                          minZoom: 4,
                          maxZoom: 19,
                        ),
                        children: [
                          TileLayer(
                            urlTemplate: _freeTileUrl,
                            userAgentPackageName: 'br.com.pegoupreco.app',
                            maxNativeZoom: 19,
                            keepBuffer: 2,
                            panBuffer: 1,
                          ),
                          const RichAttributionWidget(
                            alignment: AttributionAlignment.bottomLeft,
                            attributions: [
                              TextSourceAttribution('© OpenStreetMap'),
                            ],
                          ),
                          if (!_locationBlocked)
                            CircleLayer(
                              circles: [
                                CircleMarker(
                                  point: _center,
                                  radius: 10,
                                  color: const Color(0xFF2563EB)
                                      .withValues(alpha: 0.25),
                                  borderStrokeWidth: 2.5,
                                  borderColor: const Color(0xFF2563EB),
                                ),
                              ],
                            ),
                          MarkerLayer(
                            markers: [
                              if (!_locationBlocked)
                                Marker(
                                  point: _center,
                                  width: 18,
                                  height: 18,
                                  child: Container(
                                    decoration: BoxDecoration(
                                      color: const Color(0xFF2563EB),
                                      shape: BoxShape.circle,
                                      border: Border.all(
                                        color: Colors.white,
                                        width: 2.5,
                                      ),
                                      boxShadow: [
                                        BoxShadow(
                                          color: Colors.black
                                              .withValues(alpha: 0.2),
                                          blurRadius: 4,
                                        ),
                                      ],
                                    ),
                                  ),
                                ),
                              for (final m in withGeo)
                                Marker(
                                  point: LatLng(m.lat!, m.lng!),
                                  width: 58,
                                  height: 66,
                                  alignment: Alignment.topCenter,
                                  child: GestureDetector(
                                    onTap: () => _openMarket(m),
                                    child: Column(
                                      mainAxisSize: MainAxisSize.min,
                                      children: [
                                        Container(
                                          padding: const EdgeInsets.symmetric(
                                            horizontal: 6,
                                            vertical: 2,
                                          ),
                                          decoration: BoxDecoration(
                                            color: Colors.white,
                                            borderRadius:
                                                BorderRadius.circular(8),
                                            border: Border.all(
                                              color:
                                                  _markerColor(m.priceLevel),
                                            ),
                                            boxShadow: [
                                              BoxShadow(
                                                color: Colors.black
                                                    .withValues(alpha: 0.12),
                                                blurRadius: 4,
                                                offset: const Offset(0, 2),
                                              ),
                                            ],
                                          ),
                                          child: Text(
                                            m.avgRating != null
                                                ? '★ ${m.avgRating!.toStringAsFixed(1)}'
                                                : '★ —',
                                            style: GoogleFonts.plusJakartaSans(
                                              fontSize: 11,
                                              fontWeight: FontWeight.w800,
                                              color: AppTheme.navy,
                                            ),
                                          ),
                                        ),
                                        Icon(
                                          LucideIcons.mapPin,
                                          color: _markerColor(m.priceLevel),
                                          size: 32,
                                        ),
                                      ],
                                    ),
                                  ),
                                ),
                            ],
                          ),
                        ],
                      ),
                      if (_locationBlocked)
                        Positioned(
                          left: 16,
                          right: 72,
                          bottom: appBottomNavClearance,
                          child: Material(
                            color: Colors.white,
                            borderRadius: BorderRadius.circular(14),
                            elevation: 2,
                            child: Padding(
                              padding: const EdgeInsets.all(12),
                              child: Row(
                                children: [
                                  const Icon(
                                    LucideIcons.mapPinOff,
                                    color: AppTheme.navy,
                                    size: 18,
                                  ),
                                  const Gap(10),
                                  Expanded(
                                    child: Text(
                                      'Ative a localização para centralizar o mapa em você.',
                                      style: GoogleFonts.plusJakartaSans(
                                        fontSize: 13,
                                        fontWeight: FontWeight.w600,
                                      ),
                                    ),
                                  ),
                                  TextButton(
                                    onPressed: () => _locate(),
                                    child: const Text('Ativar'),
                                  ),
                                ],
                              ),
                            ),
                          ),
                        ),
                      if (withGeo.isEmpty && !_loading)
                        Positioned(
                          left: 16,
                          right: 72,
                          bottom: appBottomNavClearance,
                          child: Material(
                            color: Colors.white,
                            borderRadius: BorderRadius.circular(14),
                            child: Padding(
                              padding: const EdgeInsets.all(14),
                              child: Text(
                                'Nenhum mercado com coordenadas ainda. '
                                'Capture preços ou sincronize para ver pins.',
                                style: GoogleFonts.plusJakartaSans(
                                  fontSize: 13,
                                  fontWeight: FontWeight.w600,
                                  color: AppTheme.muted,
                                ),
                              ),
                            ),
                          ),
                        ),
                    ],
                  ),
          ),
        ],
      ),
    );
  }
}

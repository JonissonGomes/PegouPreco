import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:gap/gap.dart';
import 'package:geolocator/geolocator.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:latlong2/latlong.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:pegou_preco/core/di/providers.dart';
import 'package:pegou_preco/core/theme/app_theme.dart';
import 'package:pegou_preco/core/widgets/app_button.dart';
import 'package:pegou_preco/core/widgets/brand_app_bar.dart';
import 'package:pegou_preco/data/local/schemas.dart';

/// Centro padrão (SP) até obter localização.
const _defaultCenter = LatLng(-23.5505, -46.6333);

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

  @override
  void initState() {
    super.initState();
    _bootstrap();
  }

  Future<void> _bootstrap() async {
    await _loadMarkets();
    await _locate();
    if (mounted) setState(() => _loading = false);
  }

  Future<void> _loadMarkets() async {
    final markets = await ref.read(marketRepositoryProvider).all();
    // Enriquecer com pull da API se possível
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

  Future<void> _locate() async {
    try {
      var perm = await Geolocator.checkPermission();
      if (perm == LocationPermission.denied) {
        perm = await Geolocator.requestPermission();
      }
      if (perm == LocationPermission.denied ||
          perm == LocationPermission.deniedForever) {
        return;
      }
      final pos = await Geolocator.getCurrentPosition();
      final ll = LatLng(pos.latitude, pos.longitude);
      if (!mounted) return;
      setState(() => _center = ll);
      _mapController.move(ll, 13);
    } catch (_) {}
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
      builder: (ctx) => Padding(
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
            Text(
              m.name,
              style: GoogleFonts.plusJakartaSans(
                fontSize: 20,
                fontWeight: FontWeight.w800,
              ),
            ),
            const Gap(8),
            Text(
              'Nota ${(m.avgRating ?? 0).toStringAsFixed(1)} '
              '(${m.ratingsCount} avaliações)',
              style: GoogleFonts.plusJakartaSans(color: AppTheme.muted),
            ),
            const Gap(4),
            Text(
              _levelLabel(m.priceLevel),
              style: GoogleFonts.plusJakartaSans(
                fontWeight: FontWeight.w700,
                color: _markerColor(m.priceLevel),
              ),
            ),
            if (m.address != null) ...[
              const Gap(4),
              Text(m.address!, style: GoogleFonts.plusJakartaSans(fontSize: 13)),
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
              const Gap(8),
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
                          fontWeight: FontWeight.w700,
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
                      n <= stars ? LucideIcons.star : LucideIcons.star,
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
    final withGeo = _markets
        .where((m) => m.lat != null && m.lng != null)
        .toList();

    return Scaffold(
      appBar: BrandAppBar(
        title: 'Mapa',
        actions: [
          IconButton(
            tooltip: 'Minha localização',
            onPressed: _locate,
            icon: const Icon(LucideIcons.locate),
          ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : FlutterMap(
              mapController: _mapController,
              options: MapOptions(
                initialCenter: _center,
                initialZoom: 12,
              ),
              children: [
                TileLayer(
                  urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                  userAgentPackageName: 'br.com.pegoupreco.app',
                ),
                MarkerLayer(
                  markers: [
                    for (final m in withGeo)
                      Marker(
                        point: LatLng(m.lat!, m.lng!),
                        width: 40,
                        height: 40,
                        child: GestureDetector(
                          onTap: () => _openMarket(m),
                          child: Icon(
                            LucideIcons.mapPin,
                            color: _markerColor(m.priceLevel),
                            size: 36,
                          ),
                        ),
                      ),
                  ],
                ),
              ],
            ),
      floatingActionButton: withGeo.isEmpty
          ? null
          : FloatingActionButton.extended(
              onPressed: _loadMarkets,
              icon: const Icon(LucideIcons.refreshCw),
              label: Text('${withGeo.length} mercados'),
            ),
    );
  }
}

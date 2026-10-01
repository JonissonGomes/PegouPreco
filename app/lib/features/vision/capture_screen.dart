import 'dart:io';

import 'package:camera/camera.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gap/gap.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:google_mlkit_text_recognition/google_mlkit_text_recognition.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:pegou_preco/core/di/providers.dart';
import 'package:pegou_preco/core/routing/app_router.dart';
import 'package:pegou_preco/core/theme/app_theme.dart';
import 'package:pegou_preco/core/utils/money.dart';
import 'package:pegou_preco/core/widgets/app_button.dart';
import 'package:pegou_preco/core/widgets/brand_app_bar.dart';
import 'package:pegou_preco/data/local/schemas.dart';
import 'package:pegou_preco/data/remote/sefaz_client.dart';
import 'package:pegou_preco/features/market/market_picker_sheet.dart';
import 'package:pegou_preco/features/vision/models/review_item.dart';
import 'package:pegou_preco/features/vision/ocr_confirm_sheet.dart';
import 'package:pegou_preco/features/vision/parsers/label_parser.dart';
import 'package:pegou_preco/features/vision/price_check_sheet.dart';

enum CaptureMode { qr, ocr }

class CaptureScreen extends ConsumerStatefulWidget {
  const CaptureScreen({super.key});

  @override
  ConsumerState<CaptureScreen> createState() => _CaptureScreenState();
}

class _CaptureScreenState extends ConsumerState<CaptureScreen>
    with SingleTickerProviderStateMixin {
  CaptureMode _mode = CaptureMode.qr;
  final _scannerController = MobileScannerController(
    detectionSpeed: DetectionSpeed.normal,
    facing: CameraFacing.back,
  );
  final _textRecognizer = TextRecognizer(script: TextRecognitionScript.latin);

  CameraController? _cameraController;
  AnimationController? _laser;
  var _busy = false;
  var _hint = 'Aponte para o QR da NFC-e';
  String? _lastQr;
  var _tabActive = false;
  ProviderSubscription<int>? _tabSub;

  @override
  void initState() {
    super.initState();
    _laser = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1600),
    )..repeat(reverse: true);
    _tabSub = ref.listenManual<int>(shellTabIndexProvider, (prev, next) {
      _onTabVisibilityChanged(next == 2);
    }, fireImmediately: true);
  }

  Future<void> _onTabVisibilityChanged(bool active) async {
    if (_tabActive == active) return;
    _tabActive = active;
    if (!active) {
      try {
        await _scannerController.stop();
      } catch (_) {}
      final cam = _cameraController;
      _cameraController = null;
      if (cam != null) {
        try {
          await cam.dispose();
        } catch (_) {}
      }
      if (mounted) setState(() {});
      return;
    }
    if (_mode == CaptureMode.qr) {
      try {
        await _scannerController.start();
      } catch (_) {}
    } else {
      final ok = await _ensureCameraPermission();
      if (ok && mounted) await _initOcrCamera();
    }
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    _tabSub?.close();
    _laser?.dispose();
    try {
      _scannerController.dispose();
    } catch (_) {}
    _cameraController?.dispose();
    _textRecognizer.close();
    super.dispose();
  }

  Future<bool> _ensureCameraPermission() async {
    final status = await Permission.camera.request();
    return status.isGranted;
  }

  Future<void> _initOcrCamera() async {
    if (_cameraController != null) return;
    final cameras = await availableCameras();
    if (cameras.isEmpty) return;
    final back = cameras.firstWhere(
      (c) => c.lensDirection == CameraLensDirection.back,
      orElse: () => cameras.first,
    );
    final controller = CameraController(
      back,
      ResolutionPreset.high,
      enableAudio: false,
    );
    await controller.initialize();
    if (!mounted) {
      await controller.dispose();
      return;
    }
    setState(() => _cameraController = controller);
  }

  Future<void> _switchMode(CaptureMode mode) async {
    HapticFeedback.selectionClick();
    setState(() {
      _mode = mode;
      _hint = mode == CaptureMode.qr
          ? 'Aponte para o QR da NFC-e'
          : 'Enquadre a etiqueta e toque em Capturar OCR';
    });
    if (mode == CaptureMode.ocr) {
      await _scannerController.stop();
      final ok = await _ensureCameraPermission();
      if (ok) await _initOcrCamera();
    } else {
      await _cameraController?.dispose();
      _cameraController = null;
      await _scannerController.start();
    }
  }

  Future<void> _onQrDetect(BarcodeCapture capture) async {
    if (_mode != CaptureMode.qr || _busy) return;
    String? raw;
    for (final b in capture.barcodes) {
      if (b.rawValue != null) {
        raw = b.rawValue;
        break;
      }
    }
    if (raw == null || raw == _lastQr) return;
    if (!SefazClient.looksLikeNfceUrl(raw)) {
      setState(() => _hint = 'QR lido, mas não parece NFC-e');
      return;
    }

    _lastQr = raw;
    HapticFeedback.mediumImpact();
    setState(() {
      _busy = true;
      _hint = 'Enfileirando NFC-e…';
    });
    try {
      final key = SefazClient.extractNfceKey(raw);
      final pending = await ref
          .read(pendingReceiptRepositoryProvider)
          .enqueue(raw, nfceKey: key);
      await ref.read(syncWorkerProvider).processPendingReceipt(pending.id);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('NFC-e processada — confira em Pendentes')),
      );
      context.push('/pending-receipts');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _captureOcr() async {
    if (_busy) return;
    final ok = await _ensureCameraPermission();
    if (!ok) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Permissão de câmera negada')),
        );
      }
      return;
    }

    HapticFeedback.lightImpact();
    setState(() {
      _busy = true;
      _hint = 'Processando OCR…';
    });

    try {
      await _initOcrCamera();
      final cam = _cameraController;
      if (cam == null || !cam.value.isInitialized) {
        throw StateError('Câmera indisponível');
      }

      final shot = await cam.takePicture();
      final recognized = await _textRecognizer.processImage(
        InputImage.fromFilePath(shot.path),
      );
      try {
        await File(shot.path).delete();
      } catch (_) {}

      var item = LabelParser.parse(recognized.text);
      if (item == null && mounted) {
        final manual = await _textFallbackDialog(recognized.text);
        if (manual != null) item = LabelParser.parse(manual);
      }
      if (item == null) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Não foi possível extrair preço')),
          );
        }
        return;
      }
      if (!mounted) return;
      await _handleOcrItem(item);
    } catch (e) {
      if (!mounted) return;
      final manual = await _textFallbackDialog('');
      if (manual == null || !mounted) return;
      final item = LabelParser.parse(manual);
      if (item == null) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Falha no OCR: $e')),
        );
        return;
      }
      if (!mounted) return;
      await _handleOcrItem(item);
    } finally {
      if (mounted) {
        setState(() {
          _busy = false;
          _hint = 'Enquadre a etiqueta e toque em Capturar OCR';
        });
      }
    }
  }

  Future<void> _handleOcrItem(ReviewItem parsed) async {
    final confirmed = await showOcrConfirmSheet(context, item: parsed);
    if (confirmed == null || !mounted) return;

    var marketId = ref.read(currentMarketIdProvider).valueOrNull;
    if (marketId == null) {
      final picked = await showMarketPickerSheet(context);
      marketId = picked?.id;
      if (!mounted) return;
    }

    final product = await ref
        .read(productRepositoryProvider)
        .resolveOrCreate(confirmed.description);

    if (marketId != null) {
      final existing = await ref
          .read(crowdRepositoryProvider)
          .latestVisibleForProductMarket(
            productId: product.id,
            marketId: marketId,
          );
      if (existing != null) {
        final market =
            await ref.read(marketRepositoryProvider).getById(marketId);
        if (!mounted) return;
        final action = await showPriceCheckSheet(
          context,
          log: existing,
          productName: product.name,
          marketName: market?.name,
        );
        if (!mounted) return;
        final userId = await ref.read(localUserIdProvider.future);
        if (action == PriceCheckAction.confirm) {
          await ref.read(crowdRepositoryProvider).castVote(
                priceLogId: existing.id,
                voterId: userId,
                vote: VoteType.confirm,
              );
          if (mounted) {
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(content: Text('Preço confirmado — +10 pts Fiscal')),
            );
          }
          return;
        }
        if (action == PriceCheckAction.reject ||
            action == PriceCheckAction.photo) {
          await ref.read(crowdRepositoryProvider).castVote(
                priceLogId: existing.id,
                voterId: userId,
                vote: VoteType.reject,
                withPhoto: action == PriceCheckAction.photo,
              );
        }
        if (action == null) return;
      }
    }

    final stats =
        await ref.read(priceLogRepositoryProvider).statsForProduct(product.id);
    String? alert;
    if (stats != null) {
      final delta =
          ((confirmed.unitPrice - stats.avgPrice) / stats.avgPrice) * 100;
      if (delta.abs() >= 8) {
        alert = delta > 0
            ? '${delta.toStringAsFixed(0)}% acima da média (${formatBrl(stats.avgPrice)})'
            : '${delta.abs().toStringAsFixed(0)}% abaixo da média (${formatBrl(stats.avgPrice)})';
      }
    }

    final now = DateTime.now().toUtc();
    final log = PriceLog()
      ..productId = product.id
      ..marketId = marketId
      ..retailPrice = confirmed.unitPrice
      ..wholesalePrice = confirmed.wholesalePrice
      ..minWholesaleQty = confirmed.minWholesaleQty
      ..source = PriceSource.label
      ..capturedAt = now
      ..updatedAt = now
      ..synced = false
      ..trustLevel = TrustLevel.suspect
      ..confirmScore = 0
      ..rejectScore = 0;

    await ref.read(priceLogRepositoryProvider).put(log);
    await ref.read(cartRepositoryProvider).upsert(
          product: product,
          quantity: confirmed.quantity,
          retailPrice: confirmed.unitPrice,
          wholesalePrice: confirmed.wholesalePrice,
          minWholesaleQty: confirmed.minWholesaleQty,
        );

    HapticFeedback.mediumImpact();
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          alert == null ? 'Etiqueta salva' : 'Salvo. $alert',
        ),
      ),
    );
  }

  Future<String?> _textFallbackDialog(String initial) async {
    final ctrl = TextEditingController(text: initial);
    return showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (ctx) => Padding(
        padding: EdgeInsets.fromLTRB(
          20,
          8,
          20,
          MediaQuery.viewInsetsOf(ctx).bottom + 24,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              'Revisar texto OCR',
              style: GoogleFonts.plusJakartaSans(
                fontSize: 18,
                fontWeight: FontWeight.w800,
              ),
            ),
            const Gap(12),
            TextField(
              controller: ctrl,
              maxLines: 8,
              decoration: const InputDecoration(
                hintText: 'Nome do produto e preços da etiqueta',
              ),
            ),
            const Gap(16),
            FilledButton(
              onPressed: () => Navigator.pop(ctx, ctrl.text),
              child: const Text('Parsear'),
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final accent =
        _mode == CaptureMode.qr ? AppTheme.cyan : AppTheme.yellow;

    return Scaffold(
      appBar: BrandAppBar(
        title: 'Capturar',
        actions: [
          IconButton(
            tooltip: 'Preço manual',
            onPressed: () => context.push('/manual-price'),
            icon: const Icon(LucideIcons.pencil),
          ),
          IconButton(
            tooltip: 'NFC-e pendentes',
            onPressed: () => context.push('/pending-receipts'),
            icon: const Icon(LucideIcons.receipt),
          ),
        ],
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(
              AppTheme.pagePadding,
              12,
              AppTheme.pagePadding,
              10,
            ),
            child: DecoratedBox(
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(18),
                border: Border.all(color: const Color(0xFFE2E8F0)),
              ),
              child: SegmentedButton<CaptureMode>(
                style: ButtonStyle(
                  visualDensity: VisualDensity.compact,
                  side: const WidgetStatePropertyAll(BorderSide.none),
                  backgroundColor: WidgetStateProperty.resolveWith((states) {
                    if (states.contains(WidgetState.selected)) {
                      return AppTheme.yellow.withValues(alpha: 0.55);
                    }
                    return Colors.transparent;
                  }),
                  foregroundColor: const WidgetStatePropertyAll(AppTheme.navy),
                  shape: WidgetStatePropertyAll(
                    RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(14),
                    ),
                  ),
                ),
                segments: const [
                  ButtonSegment(
                    value: CaptureMode.qr,
                    label: Text('QR NFC-e'),
                    icon: Icon(LucideIcons.qrCode, size: 18),
                  ),
                  ButtonSegment(
                    value: CaptureMode.ocr,
                    label: Text('OCR etiqueta'),
                    icon: Icon(LucideIcons.type, size: 18),
                  ),
                ],
                selected: {_mode},
                onSelectionChanged: (s) => _switchMode(s.first),
              ),
            ),
          ),
          Expanded(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(
                AppTheme.pagePadding,
                0,
                AppTheme.pagePadding,
                110,
              ),
              child: ClipRRect(
                borderRadius: BorderRadius.circular(28),
                child: Stack(
                  fit: StackFit.expand,
                  children: [
                    if (!_tabActive)
                      const ColoredBox(
                        color: Colors.black87,
                        child: Center(
                          child: Text(
                            'Abra Capturar para usar a câmera',
                            style: TextStyle(color: Colors.white70),
                          ),
                        ),
                      )
                    else if (_mode == CaptureMode.qr)
                      MobileScanner(
                        controller: _scannerController,
                        onDetect: _onQrDetect,
                      )
                    else if (_cameraController != null &&
                        _cameraController!.value.isInitialized)
                      CameraPreview(_cameraController!)
                    else
                      const ColoredBox(
                        color: Colors.black87,
                        child: Center(child: CircularProgressIndicator()),
                      ),
                    IgnorePointer(
                      child: AnimatedBuilder(
                        animation:
                            _laser ?? const AlwaysStoppedAnimation<double>(0),
                        builder: (context, _) {
                          return CustomPaint(
                            painter: _ScannerOverlayPainter(
                              accent: accent,
                              laserT: _laser?.value ?? 0,
                              busy: _busy,
                            ),
                          );
                        },
                      ),
                    ),
                    Positioned(
                      left: 16,
                      right: 16,
                      bottom: 18,
                      child: Column(
                        children: [
                          Container(
                            width: double.infinity,
                            padding: const EdgeInsets.symmetric(
                              horizontal: 14,
                              vertical: 10,
                            ),
                            decoration: BoxDecoration(
                              color: Colors.black.withValues(alpha: 0.55),
                              borderRadius: BorderRadius.circular(16),
                              border: Border.all(
                                color: Colors.white.withValues(alpha: 0.12),
                              ),
                            ),
                            child: Text(
                              _busy ? 'Processando…' : _hint,
                              style: GoogleFonts.plusJakartaSans(
                                color: Colors.white,
                                fontWeight: FontWeight.w600,
                                fontSize: 13.5,
                              ),
                              textAlign: TextAlign.center,
                            ),
                          ),
                          if (_mode == CaptureMode.ocr) ...[
                            const Gap(12),
                            AppButton(
                              label: 'Capturar OCR',
                              icon: LucideIcons.scanLine,
                              onPressed: _busy ? null : _captureOcr,
                            )
                                .animate(target: _busy ? 0 : 1)
                                .scale(
                                  begin: const Offset(0.98, 0.98),
                                  end: const Offset(1, 1),
                                ),
                          ],
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _ScannerOverlayPainter extends CustomPainter {
  _ScannerOverlayPainter({
    required this.accent,
    required this.laserT,
    required this.busy,
  });

  final Color accent;
  final double laserT;
  final bool busy;

  @override
  void paint(Canvas canvas, Size size) {
    final hole = RRect.fromRectAndRadius(
      Rect.fromCenter(
        center: Offset(size.width / 2, size.height * 0.42),
        width: size.width * 0.78,
        height: size.height * 0.30,
      ),
      const Radius.circular(18),
    );

    final overlay = Path()
      ..addRect(Offset.zero & size)
      ..addRRect(hole)
      ..fillType = PathFillType.evenOdd;
    canvas.drawPath(
      overlay,
      Paint()..color = Colors.black.withValues(alpha: 0.55),
    );

    final cornerPaint = Paint()
      ..color = accent
      ..style = PaintingStyle.stroke
      ..strokeWidth = 4
      ..strokeCap = StrokeCap.round;

    final rect = hole.outerRect;
    const len = 22.0;
    // Cantos da mira
    final corners = <List<Offset>>[
      [rect.topLeft, rect.topLeft.translate(len, 0), rect.topLeft.translate(0, len)],
      [rect.topRight, rect.topRight.translate(-len, 0), rect.topRight.translate(0, len)],
      [rect.bottomLeft, rect.bottomLeft.translate(len, 0), rect.bottomLeft.translate(0, -len)],
      [rect.bottomRight, rect.bottomRight.translate(-len, 0), rect.bottomRight.translate(0, -len)],
    ];
    for (final c in corners) {
      canvas.drawLine(c[0], c[1], cornerPaint);
      canvas.drawLine(c[0], c[2], cornerPaint);
    }

    final y = rect.top + rect.height * laserT;
    final laserPaint = Paint()
      ..shader = LinearGradient(
        colors: [
          accent.withValues(alpha: 0),
          accent.withValues(alpha: busy ? 0.95 : 0.75),
          accent.withValues(alpha: 0),
        ],
      ).createShader(Rect.fromLTWH(rect.left, y - 1, rect.width, 2));
    canvas.drawLine(
      Offset(rect.left + 10, y),
      Offset(rect.right - 10, y),
      laserPaint..strokeWidth = 2.5,
    );
  }

  @override
  bool shouldRepaint(covariant _ScannerOverlayPainter oldDelegate) =>
      oldDelegate.laserT != laserT ||
      oldDelegate.accent != accent ||
      oldDelegate.busy != busy;
}

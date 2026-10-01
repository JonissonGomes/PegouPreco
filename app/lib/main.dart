import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:pegou_preco/app.dart';
import 'package:pegou_preco/core/di/providers.dart';
import 'package:pegou_preco/core/prefs/app_prefs.dart';
import 'package:shared_preferences/shared_preferences.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Evita tela preta/crash silencioso em release se algo falhar na init.
  FlutterError.onError = (details) {
    FlutterError.presentError(details);
  };

  SharedPreferences? prefs;
  try {
    prefs = await SharedPreferences.getInstance();
  } catch (_) {
    prefs = null;
  }

  final container = ProviderContainer(
    overrides: [
      sharedPrefsProvider.overrideWith((ref) async => prefs),
      appPrefsProvider.overrideWith((ref) async => AppPrefs(prefs)),
    ],
  );

  try {
    await container.read(isarProvider.future);
    container.read(syncBootstrapProvider);
  } catch (e, st) {
    // Ainda sobe a UI; providers que dependem do Isar mostram erro.
    debugPrint('Init falhou: $e\n$st');
  }

  runApp(
    UncontrolledProviderScope(
      container: container,
      child: const PegouPrecoApp(),
    ),
  );
}

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:pegou_preco/core/permissions/permission_gate.dart';
import 'package:pegou_preco/core/routing/app_router.dart';
import 'package:pegou_preco/core/theme/app_theme.dart';

class PegouPrecoApp extends ConsumerStatefulWidget {
  const PegouPrecoApp({super.key});

  @override
  ConsumerState<PegouPrecoApp> createState() => _PegouPrecoAppState();
}

class _PegouPrecoAppState extends ConsumerState<PegouPrecoApp> {
  @override
  void initState() {
    super.initState();
    // Após o 1º frame (Activity pronta) pede permissões se ainda faltarem.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      PermissionGate.requestStartupPermissionsIfNeeded();
    });
  }

  @override
  Widget build(BuildContext context) {
    final onboarding = ref.watch(onboardingDoneProvider);

    if (onboarding.isLoading) {
      return MaterialApp(
        debugShowCheckedModeBanner: false,
        theme: AppTheme.light,
        home: const Scaffold(
          body: Center(child: CircularProgressIndicator()),
        ),
      );
    }

    if (onboarding.hasError) {
      return MaterialApp(
        home: Scaffold(
          body: Center(child: Text('Erro: ${onboarding.error}')),
        ),
      );
    }

    final router = ref.watch(appRouterProvider);
    return MaterialApp.router(
      title: 'PegouPreço',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light,
      routerConfig: router,
    );
  }
}

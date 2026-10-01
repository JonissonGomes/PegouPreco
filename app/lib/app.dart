import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:pegou_preco/core/routing/app_router.dart';
import 'package:pegou_preco/core/theme/app_theme.dart';

class PegouPrecoApp extends ConsumerWidget {
  const PegouPrecoApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
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

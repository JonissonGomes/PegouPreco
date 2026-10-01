import 'dart:ui';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:pegou_preco/core/routing/app_router.dart';
import 'package:pegou_preco/core/theme/app_theme.dart';

/// Nav: Carrinho | Mapa | [Scanner] | Insights | Perfil
class HomeShell extends ConsumerStatefulWidget {
  const HomeShell({super.key, required this.navigationShell});

  final StatefulNavigationShell navigationShell;

  @override
  ConsumerState<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends ConsumerState<HomeShell> {
  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final index = widget.navigationShell.currentIndex;
    if (ref.read(shellTabIndexProvider) != index) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) return;
        ref.read(shellTabIndexProvider.notifier).state = index;
      });
    }
  }

  void _onTap(int index) {
    HapticFeedback.selectionClick();
    ref.read(shellTabIndexProvider.notifier).state = index;
    widget.navigationShell.goBranch(
      index,
      initialLocation: index == widget.navigationShell.currentIndex,
    );
  }

  @override
  Widget build(BuildContext context) {
    final index = widget.navigationShell.currentIndex;

    return Scaffold(
      extendBody: true,
      body: widget.navigationShell,
      bottomNavigationBar: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(12, 0, 12, 10),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(28),
            child: BackdropFilter(
              filter: ImageFilter.blur(sigmaX: 18, sigmaY: 18),
              child: Container(
                height: AppTheme.bottomBarHeight,
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.92),
                  borderRadius: BorderRadius.circular(28),
                  border: Border.all(color: AppTheme.border),
                  boxShadow: [
                    BoxShadow(
                      color: AppTheme.navy.withValues(alpha: 0.08),
                      blurRadius: 24,
                      offset: const Offset(0, 10),
                    ),
                  ],
                ),
                child: Row(
                  children: [
                    _NavItem(
                      icon: LucideIcons.shoppingCart,
                      label: 'Carrinho',
                      selected: index == 0,
                      onTap: () => _onTap(0),
                    ),
                    _NavItem(
                      icon: LucideIcons.map,
                      label: 'Mapa',
                      selected: index == 1,
                      onTap: () => _onTap(1),
                    ),
                    _ScannerFab(
                      selected: index == 2,
                      onTap: () => _onTap(2),
                    ),
                    _NavItem(
                      icon: LucideIcons.lineChart,
                      label: 'Insights',
                      selected: index == 3,
                      onTap: () => _onTap(3),
                    ),
                    _NavItem(
                      icon: LucideIcons.user,
                      label: 'Perfil',
                      selected: index == 4,
                      onTap: () => _onTap(4),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _ScannerFab extends StatelessWidget {
  const _ScannerFab({required this.selected, required this.onTap});

  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 4),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onTap,
          customBorder: const CircleBorder(),
          child: Ink(
            width: 52,
            height: 52,
            decoration: BoxDecoration(
              color: AppTheme.yellowBright,
              shape: BoxShape.circle,
              boxShadow: [
                BoxShadow(
                  color: AppTheme.navy.withValues(alpha: selected ? 0.22 : 0.14),
                  blurRadius: 10,
                  offset: const Offset(0, 4),
                ),
              ],
              border: selected
                  ? Border.all(color: AppTheme.navy, width: 2)
                  : null,
            ),
            child: const Icon(
              LucideIcons.scanLine,
              color: AppTheme.navy,
              size: 24,
            ),
          ),
        ),
      ),
    );
  }
}

class _NavItem extends StatelessWidget {
  const _NavItem({
    required this.icon,
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final color = selected ? AppTheme.navy : AppTheme.muted;
    return Expanded(
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(20),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, size: 20, color: color),
            const SizedBox(height: 2),
            Text(
              label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                fontSize: 10,
                fontWeight: selected ? FontWeight.w800 : FontWeight.w600,
                color: color,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

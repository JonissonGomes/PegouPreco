import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gap/gap.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:pegou_preco/core/auth/auth_session.dart';
import 'package:pegou_preco/core/crowd/trust_engine.dart';
import 'package:pegou_preco/core/di/providers.dart';
import 'package:pegou_preco/core/theme/app_theme.dart';
import 'package:pegou_preco/core/widgets/app_button.dart';
import 'package:pegou_preco/core/widgets/app_text_field.dart';
import 'package:pegou_preco/core/widgets/brand_app_bar.dart';
import 'package:pegou_preco/data/remote/sync_api_client.dart';

final pendingVerifyEmailProvider = StateProvider<String?>((ref) => null);

class ProfileScreen extends ConsumerWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final sessionAsync = ref.watch(authSessionProvider);

    return Scaffold(
      appBar: const BrandAppBar(title: 'Perfil'),
      body: sessionAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('Erro: $e')),
        data: (session) {
          if (session == null) {
            return const _AuthGate();
          }
          return _ProfileBody(session: session);
        },
      ),
    );
  }
}

class _ProfileBody extends ConsumerWidget {
  const _ProfileBody({required this.session});
  final AuthSession session;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(
        AppTheme.pagePadding,
        16,
        AppTheme.pagePadding,
        120,
      ),
      children: [
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(AppTheme.cardRadius),
            border: Border.all(color: AppTheme.border),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                session.displayName,
                style: GoogleFonts.plusJakartaSans(
                  fontSize: 22,
                  fontWeight: FontWeight.w800,
                ),
              ),
              const Gap(4),
              Text(
                session.email,
                style: GoogleFonts.plusJakartaSans(color: AppTheme.muted),
              ),
              const Gap(8),
              Text(
                session.emailVerified
                    ? 'E-mail confirmado'
                    : 'E-mail pendente de confirmação',
                style: GoogleFonts.plusJakartaSans(
                  fontWeight: FontWeight.w700,
                  color: session.emailVerified
                      ? AppTheme.trustGreen
                      : AppTheme.trustYellow,
                ),
              ),
              if (session.city != null || session.uf != null) ...[
                const Gap(4),
                Text(
                  [session.city, session.uf].whereType<String>().join(' · '),
                  style: GoogleFonts.plusJakartaSans(color: AppTheme.muted),
                ),
              ],
            ],
          ),
        ),
        const Gap(16),
        FutureBuilder(
          future: ref
              .read(crowdRepositoryProvider)
              .ensureReputation(session.userId),
          builder: (context, snap) {
            final rep = snap.data;
            if (rep == null) return const SizedBox.shrink();
            return ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const Icon(LucideIcons.shield, color: AppTheme.navy),
              title: Text(
                'Fiscal Nível ${TrustEngine.fiscalLabel(rep.level)}',
                style: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w800),
              ),
              subtitle: Text('${rep.points} pts · ${rep.validationsCount} checagens'),
            );
          },
        ),
        const Gap(8),
        AppButton(
          label: 'Sincronização',
          icon: LucideIcons.cloud,
          outlined: true,
          onPressed: () => context.push('/sync'),
        ),
        const Gap(10),
        AppButton(
          label: 'Sair',
          icon: LucideIcons.logOut,
          destructive: true,
          onPressed: () => ref.read(authSessionProvider.notifier).clear(),
        ),
      ],
    );
  }
}

class _AuthGate extends StatefulWidget {
  const _AuthGate();

  @override
  State<_AuthGate> createState() => _AuthGateState();
}

class _AuthGateState extends State<_AuthGate> {
  var _mode = _AuthMode.login;

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(
        AppTheme.pagePadding,
        16,
        AppTheme.pagePadding,
        120,
      ),
      children: [
        Text(
          _mode == _AuthMode.login
              ? 'Entrar'
              : _mode == _AuthMode.register
                  ? 'Criar conta'
                  : 'Confirmar e-mail',
          style: GoogleFonts.plusJakartaSans(
            fontSize: 24,
            fontWeight: FontWeight.w800,
          ),
        ),
        const Gap(8),
        Text(
          'Cadastro leve: e-mail, senha e apelido. Avaliações no mapa são anônimas.',
          style: GoogleFonts.plusJakartaSans(color: AppTheme.muted),
        ),
        const Gap(20),
        if (_mode == _AuthMode.login)
          _LoginForm(
            onNeedRegister: () => setState(() => _mode = _AuthMode.register),
            onNeedVerify: () => setState(() => _mode = _AuthMode.verify),
          )
        else if (_mode == _AuthMode.register)
          _RegisterForm(
            onNeedLogin: () => setState(() => _mode = _AuthMode.login),
            onNeedVerify: () => setState(() => _mode = _AuthMode.verify),
          )
        else
          _VerifyForm(
            onBack: () => setState(() => _mode = _AuthMode.login),
          ),
      ],
    );
  }
}

enum _AuthMode { login, register, verify }

class _LoginForm extends ConsumerStatefulWidget {
  const _LoginForm({required this.onNeedRegister, required this.onNeedVerify});
  final VoidCallback onNeedRegister;
  final VoidCallback onNeedVerify;

  @override
  ConsumerState<_LoginForm> createState() => _LoginFormState();
}

class _LoginFormState extends ConsumerState<_LoginForm> {
  final _email = TextEditingController();
  final _password = TextEditingController();
  var _busy = false;
  String? _error;

  Future<void> _submit() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final res = await ref.read(syncApiClientProvider).login(
            email: _email.text.trim(),
            password: _password.text,
          );
      await ref.read(authSessionProvider.notifier).save(
            AuthSession(
              token: res['token'] as String,
              userId: res['userId'] as String,
              email: res['email'] as String? ?? _email.text.trim(),
              displayName: res['displayName'] as String? ?? 'Fiscal',
              emailVerified: res['emailVerified'] as bool? ?? true,
              uf: res['uf'] as String?,
              city: res['city'] as String?,
            ),
          );
    } on SyncApiException catch (e) {
      if (e.statusCode == 403) {
        ref.read(pendingVerifyEmailProvider.notifier).state =
            _email.text.trim();
        widget.onNeedVerify();
      }
      setState(() => _error = e.message);
    } catch (e) {
      setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        AppTextField(
          controller: _email,
          label: 'E-mail',
          keyboardType: TextInputType.emailAddress,
          prefixIcon: LucideIcons.mail,
        ),
        const Gap(12),
        AppTextField(
          controller: _password,
          label: 'Senha',
          obscureText: true,
          prefixIcon: LucideIcons.lock,
        ),
        if (_error != null) ...[
          const Gap(10),
          Text(_error!, style: const TextStyle(color: Color(0xFFDC2626))),
        ],
        const Gap(20),
        AppButton(
          label: _busy ? 'Entrando…' : 'Entrar',
          onPressed: _busy ? null : _submit,
        ),
        const Gap(10),
        TextButton(
          onPressed: widget.onNeedRegister,
          child: const Text('Criar conta'),
        ),
        TextButton(
          onPressed: widget.onNeedVerify,
          child: const Text('Já tenho o código'),
        ),
      ],
    );
  }
}

class _RegisterForm extends ConsumerStatefulWidget {
  const _RegisterForm({required this.onNeedLogin, required this.onNeedVerify});
  final VoidCallback onNeedLogin;
  final VoidCallback onNeedVerify;

  @override
  ConsumerState<_RegisterForm> createState() => _RegisterFormState();
}

class _RegisterFormState extends ConsumerState<_RegisterForm> {
  final _email = TextEditingController();
  final _password = TextEditingController();
  final _name = TextEditingController();
  final _uf = TextEditingController();
  final _city = TextEditingController();
  var _busy = false;
  String? _error;

  Future<void> _submit() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final res = await ref.read(syncApiClientProvider).register(
            email: _email.text.trim(),
            password: _password.text,
            displayName: _name.text.trim().isEmpty
                ? 'Fiscal'
                : _name.text.trim(),
            uf: _uf.text.trim().isEmpty ? null : _uf.text.trim().toUpperCase(),
            city: _city.text.trim().isEmpty ? null : _city.text.trim(),
          );
      ref.read(pendingVerifyEmailProvider.notifier).state = _email.text.trim();
      final token = res['token'] as String?;
      if (token != null && res['needsVerification'] != true) {
        await ref.read(authSessionProvider.notifier).save(
              AuthSession(
                token: token,
                userId: res['userId'] as String,
                email: res['email'] as String? ?? _email.text.trim(),
                displayName: _name.text.trim().isEmpty
                    ? 'Fiscal'
                    : _name.text.trim(),
                emailVerified: true,
                uf: _uf.text.trim().isEmpty
                    ? null
                    : _uf.text.trim().toUpperCase(),
                city: _city.text.trim().isEmpty ? null : _city.text.trim(),
              ),
            );
        return;
      }
      widget.onNeedVerify();
    } on SyncApiException catch (e) {
      setState(() => _error = e.message);
    } catch (e) {
      setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    _name.dispose();
    _uf.dispose();
    _city.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        AppTextField(
          controller: _name,
          label: 'Apelido público',
          hint: 'Como aparece no Fiscal (não nas avaliações)',
          prefixIcon: LucideIcons.user,
        ),
        const Gap(12),
        AppTextField(
          controller: _email,
          label: 'E-mail',
          keyboardType: TextInputType.emailAddress,
          prefixIcon: LucideIcons.mail,
        ),
        const Gap(12),
        AppTextField(
          controller: _password,
          label: 'Senha (mín. 6)',
          obscureText: true,
          prefixIcon: LucideIcons.lock,
        ),
        const Gap(12),
        AppTextField(
          controller: _uf,
          label: 'UF (opcional)',
          hint: 'SP',
          prefixIcon: LucideIcons.mapPin,
        ),
        const Gap(12),
        AppTextField(
          controller: _city,
          label: 'Cidade (opcional)',
          prefixIcon: LucideIcons.building2,
        ),
        if (_error != null) ...[
          const Gap(10),
          Text(_error!, style: const TextStyle(color: Color(0xFFDC2626))),
        ],
        const Gap(20),
        AppButton(
          label: _busy ? 'Enviando…' : 'Cadastrar e enviar código',
          onPressed: _busy ? null : _submit,
        ),
        TextButton(
          onPressed: widget.onNeedLogin,
          child: const Text('Já tenho conta'),
        ),
      ],
    );
  }
}

class _VerifyForm extends ConsumerStatefulWidget {
  const _VerifyForm({required this.onBack});
  final VoidCallback onBack;

  @override
  ConsumerState<_VerifyForm> createState() => _VerifyFormState();
}

class _VerifyFormState extends ConsumerState<_VerifyForm> {
  final _email = TextEditingController();
  final _code = TextEditingController();
  var _busy = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final pending = ref.read(pendingVerifyEmailProvider);
      if (pending != null) _email.text = pending;
    });
  }

  Future<void> _submit() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final res = await ref.read(syncApiClientProvider).verify(
            email: _email.text.trim(),
            code: _code.text.trim(),
          );
      await ref.read(authSessionProvider.notifier).save(
            AuthSession(
              token: res['token'] as String,
              userId: res['userId'] as String,
              email: res['email'] as String? ?? _email.text.trim(),
              displayName: res['displayName'] as String? ?? 'Fiscal',
              emailVerified: true,
              uf: res['uf'] as String?,
              city: res['city'] as String?,
            ),
          );
    } on SyncApiException catch (e) {
      setState(() => _error = e.message);
    } catch (e) {
      setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _resend() async {
    try {
      await ref
          .read(syncApiClientProvider)
          .resendCode(email: _email.text.trim());
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Código reenviado')),
        );
      }
    } catch (e) {
      setState(() => _error = e.toString());
    }
  }

  @override
  void dispose() {
    _email.dispose();
    _code.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        AppTextField(
          controller: _email,
          label: 'E-mail',
          prefixIcon: LucideIcons.mail,
        ),
        const Gap(12),
        AppTextField(
          controller: _code,
          label: 'Código de 6 dígitos',
          keyboardType: TextInputType.number,
          prefixIcon: LucideIcons.hash,
        ),
        if (_error != null) ...[
          const Gap(10),
          Text(_error!, style: const TextStyle(color: Color(0xFFDC2626))),
        ],
        const Gap(20),
        AppButton(
          label: _busy ? 'Confirmando…' : 'Confirmar',
          onPressed: _busy ? null : _submit,
        ),
        TextButton(onPressed: _resend, child: const Text('Reenviar código')),
        TextButton(onPressed: widget.onBack, child: const Text('Voltar')),
      ],
    );
  }
}

import 'package:mailer/mailer.dart';
import 'package:mailer/smtp_server.dart';

Future<void> sendVerificationEmail({
  required String user,
  required String pass,
  required String to,
  required String code,
  String? logoUrl,
}) async {
  final smtp = SmtpServer(
    'smtp.gmail.com',
    port: 587,
    username: user,
    password: pass,
  );
  final message = Message()
    ..from = Address(user, 'PegouPreço')
    ..recipients.add(to)
    ..subject = 'Seu código PegouPreço: $code'
    ..html = '''
      <div style="font-family:sans-serif;max-width:480px">
        ${logoUrl != null ? '<img src="$logoUrl" height="48"/>' : '<h2>PegouPreço</h2>'}
        <p>Olá! Use o código abaixo para confirmar sua conta:</p>
        <p style="font-size:28px;font-weight:800;letter-spacing:6px">$code</p>
        <p>Válido por 15 minutos. Se não foi você, ignore este e-mail.</p>
      </div>
    ''';

  await send(message, smtp);
}

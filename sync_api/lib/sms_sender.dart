import 'dart:convert';
import 'dart:io';

/// Envia OTP por SMS via Twilio (opcional). Sem credenciais, só registra no log.
Future<void> sendVerificationSms({
  required String toE164,
  required String code,
  String? accountSid,
  String? authToken,
  String? fromNumber,
}) async {
  final sid = accountSid?.trim() ?? '';
  final token = authToken?.trim() ?? '';
  final from = fromNumber?.trim() ?? '';
  if (sid.isEmpty || token.isEmpty || from.isEmpty) {
    stdout.writeln('[SMS] Twilio não configurado — código para $toE164: $code');
    return;
  }

  final uri = Uri.parse(
    'https://api.twilio.com/2010-04-01/Accounts/$sid/Messages.json',
  );
  final client = HttpClient();
  try {
    final req = await client.postUrl(uri);
    final basic = base64Encode(utf8.encode('$sid:$token'));
    req.headers.set(HttpHeaders.authorizationHeader, 'Basic $basic');
    req.headers.contentType =
        ContentType('application', 'x-www-form-urlencoded', charset: 'utf-8');
    final to = toE164.startsWith('+') ? toE164 : '+$toE164';
    req.write(
      'To=${Uri.encodeQueryComponent(to)}'
      '&From=${Uri.encodeQueryComponent(from)}'
      '&Body=${Uri.encodeQueryComponent('PegouPreço: seu código é $code')}',
    );
    final res = await req.close();
    final body = await res.transform(utf8.decoder).join();
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw StateError('Twilio HTTP ${res.statusCode}: $body');
    }
  } finally {
    client.close(force: true);
  }
}

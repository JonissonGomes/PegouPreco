import 'dart:convert';
import 'dart:io';

import 'package:crypto/crypto.dart';
import 'package:dotenv/dotenv.dart';
import 'package:mongo_dart/mongo_dart.dart';
import 'package:shelf/shelf.dart';
import 'package:shelf/shelf_io.dart' as shelf_io;
import 'package:shelf_cors_headers/shelf_cors_headers.dart';
import 'package:shelf_router/shelf_router.dart';
import 'package:uuid/uuid.dart';
import 'package:pegou_preco_sync_api/email_sender.dart';
import 'package:pegou_preco_sync_api/sms_sender.dart';
import 'package:pegou_preco_sync_api/jev_client.dart';

/// Sync API mínima: auth + push/pull LWW para Atlas (ou memória se sem URI).
Future<void> main(List<String> args) async {
  final env = DotEnv(includePlatformEnvironment: true)..load();
  final port = int.tryParse(env['PORT'] ?? '8080') ?? 8080;
  final mongoUri = env['MONGODB_URI'] ?? env['MONGO_URI'];
  final dbName = env['MONGODB_DB'] ?? 'pegou_preco';

  final store = await DataStore.open(mongoUri: mongoUri, dbName: dbName);
  final app = createRouter(store, env);

  final handler = Pipeline()
      .addMiddleware(logRequests())
      .addMiddleware(corsHeaders())
      .addHandler(app.call);

  final server = await shelf_io.serve(handler, InternetAddress.anyIPv4, port);
  stdout.writeln(
    'PegouPreço sync_api em http://${server.address.host}:${server.port}'
    ' · store=${store.mode}',
  );
}

Router createRouter(DataStore store, DotEnv env) {
  final router = Router();
  final skipEmailVerification = _flag(env['SKIP_EMAIL_VERIFICATION']);
  final skipSmsVerification = _flag(env['SKIP_SMS_VERIFICATION']);
  final exposeOtp = _flag(env['EXPOSE_OTP_IN_RESPONSE']) || store.mode == 'memory';
  final emailUser = env['EMAIL_USER'] ?? '';
  final emailPass = env['EMAIL_PASS'] ?? '';
  final emailLogo = env['EMAIL_LOGO_URL'];
  final twilioSid = env['TWILIO_ACCOUNT_SID'] ?? '';
  final twilioToken = env['TWILIO_AUTH_TOKEN'] ?? '';
  final twilioFrom = env['TWILIO_FROM_NUMBER'] ?? '';
  final jev = JevClient(apiKey: env['JEV_API_KEY'] ?? '');

  Future<Map<String, dynamic>> _sendOtp({
    required String channel,
    required String target,
    required String code,
  }) async {
    if (channel == 'email') {
      if (skipEmailVerification) {
        return {
          'ok': true,
          'channel': 'email',
          'skipped': true,
          if (exposeOtp) 'devCode': code,
        };
      }
      if (emailUser.isEmpty || emailPass.isEmpty) {
        if (!exposeOtp) {
          return {
            'error': 'EMAIL_USER/EMAIL_PASS não configurados',
            'status': 500,
          };
        }
        stdout.writeln('[EMAIL] SMTP ausente — código para $target: $code');
        return {
          'ok': true,
          'channel': 'email',
          'devCode': code,
          'hint': 'SMTP não configurado; use devCode em dev',
        };
      }
      try {
        await sendVerificationEmail(
          user: emailUser,
          pass: emailPass,
          to: target,
          code: code,
          logoUrl: emailLogo,
        );
      } catch (e) {
        return {'error': 'falha ao enviar e-mail: $e', 'status': 500};
      }
    } else {
      if (skipSmsVerification) {
        return {
          'ok': true,
          'channel': 'phone',
          'skipped': true,
          if (exposeOtp) 'devCode': code,
        };
      }
      try {
        await sendVerificationSms(
          toE164: target,
          code: code,
          accountSid: twilioSid,
          authToken: twilioToken,
          fromNumber: twilioFrom,
        );
      } catch (e) {
        return {'error': 'falha ao enviar SMS: $e', 'status': 500};
      }
      if (exposeOtp &&
          (twilioSid.isEmpty || twilioToken.isEmpty || twilioFrom.isEmpty)) {
        return {
          'ok': true,
          'channel': 'phone',
          'devCode': code,
          'hint': 'Twilio não configurado; use devCode em dev',
        };
      }
    }
    return {
      'ok': true,
      'channel': channel,
      if (exposeOtp) 'devCode': code,
    };
  }

  Response _otpResponse(Map<String, dynamic> payload) {
    if (payload['error'] != null) {
      return _error(payload['status'] as int? ?? 400, payload['error'] as String);
    }
    return Response.ok(
      jsonEncode(payload),
      headers: {'Content-Type': 'application/json'},
    );
  }

  Map<String, dynamic> _publicUser(Map<String, dynamic> user, {String? token}) {
    return {
      if (token != null) 'token': token,
      'userId': user['id'],
      'email': user['email'],
      'phone': user['phone'],
      'displayName': user['displayName'] ?? 'Fiscal',
      'emailVerified': user['emailVerified'] == true,
      'phoneVerified': user['phoneVerified'] == true,
      'uf': user['uf'],
      'city': user['city'],
    };
  }

  router.get('/health', (Request req) {
    return Response.ok(jsonEncode({'ok': true, 'store': store.mode}));
  });

  router.post('/auth/register', (Request req) async {
    final body = jsonDecode(await req.readAsString()) as Map<String, dynamic>;
    final email = (body['email'] as String? ?? '').trim().toLowerCase();
    final password = body['password'] as String? ?? '';
    final displayName =
        (body['displayName'] as String? ?? 'Fiscal').trim();
    final phone = normalizePhone(body['phone'] as String?);
    final uf = (body['uf'] as String?)?.trim();
    final city = (body['city'] as String?)?.trim();
    if (email.isEmpty || password.length < 6) {
      return _error(400, 'email/password inválidos');
    }
    if (phone == null || phone.length < 12) {
      return _error(400, 'telefone inválido (use DDD + número)');
    }
    if (await store.findUser(email) != null) {
      return _error(409, 'usuário já existe');
    }
    if (await store.findUserByPhone(phone) != null) {
      return _error(409, 'telefone já cadastrado');
    }
    final code = _sixDigitCode();
    final user = await store.createUser(
      email: email,
      phone: phone,
      passwordHash: _hash(password),
      displayName: displayName.isEmpty ? 'Fiscal' : displayName,
      uf: uf,
      city: city,
      emailVerified: skipEmailVerification,
      phoneVerified: skipSmsVerification,
      verificationCodeHash: _hash(code),
    );
    final needsVerification =
        (!skipEmailVerification && user['emailVerified'] != true) ||
            (!skipSmsVerification && user['phoneVerified'] != true);

    Map<String, dynamic> delivery = {'ok': true};
    if (!skipSmsVerification) {
      delivery = await _sendOtp(channel: 'phone', target: phone, code: code);
      if (delivery['error'] != null) return _otpResponse(delivery);
    } else if (!skipEmailVerification) {
      delivery = await _sendOtp(channel: 'email', target: email, code: code);
      if (delivery['error'] != null) return _otpResponse(delivery);
    } else if (exposeOtp) {
      delivery = {'ok': true, 'devCode': code, 'skipped': true};
    }

    return Response.ok(
      jsonEncode({
        'ok': true,
        'userId': user['id'],
        'email': email,
        'phone': phone,
        'needsVerification': needsVerification,
        if (!needsVerification) 'token': user['token'],
        if (delivery['devCode'] != null) 'devCode': delivery['devCode'],
        if (delivery['hint'] != null) 'hint': delivery['hint'],
        'otpChannel': skipSmsVerification ? 'email' : 'phone',
      }),
      headers: {'Content-Type': 'application/json'},
    );
  });

  router.post('/auth/verify', (Request req) async {
    final body = jsonDecode(await req.readAsString()) as Map<String, dynamic>;
    final email = (body['email'] as String? ?? '').trim().toLowerCase();
    final phone = normalizePhone(body['phone'] as String?);
    final code = (body['code'] as String? ?? '').trim();
    if (code.isEmpty) return _error(400, 'código obrigatório');
    final result = await store.verifyOtp(
      email: email.isEmpty ? null : email,
      phone: phone,
      codeHash: _hash(code),
      markEmail: email.isNotEmpty,
      markPhone: phone != null,
    );
    if (result['error'] != null) {
      return _error(result['status'] as int? ?? 400, result['error'] as String);
    }
    return Response.ok(
      jsonEncode(result),
      headers: {'Content-Type': 'application/json'},
    );
  });

  router.post('/auth/resend-code', (Request req) async {
    final body = jsonDecode(await req.readAsString()) as Map<String, dynamic>;
    final email = (body['email'] as String? ?? '').trim().toLowerCase();
    final phone = normalizePhone(body['phone'] as String?);
    final channel = (body['channel'] as String? ??
            (phone != null ? 'phone' : 'email'))
        .toLowerCase();
    final code = _sixDigitCode();
    final setResult = await store.setVerificationCodeFor(
      email: email.isEmpty ? null : email,
      phone: phone,
      codeHash: _hash(code),
    );
    if (setResult['error'] != null) {
      return _error(
        setResult['status'] as int? ?? 400,
        setResult['error'] as String,
      );
    }
    final target = channel == 'phone'
        ? (phone ?? setResult['phone'] as String? ?? '')
        : (email.isEmpty ? setResult['email'] as String? ?? '' : email);
    if (target.isEmpty) {
      return _error(400, 'informe email ou telefone');
    }
    return _otpResponse(
      await _sendOtp(channel: channel, target: target, code: code),
    );
  });

  router.post('/auth/otp/request', (Request req) async {
    final body = jsonDecode(await req.readAsString()) as Map<String, dynamic>;
    final phone = normalizePhone(body['phone'] as String?);
    final email = (body['email'] as String? ?? '').trim().toLowerCase();
    if (phone == null && email.isEmpty) {
      return _error(400, 'informe telefone ou e-mail');
    }
    Map<String, dynamic>? user;
    if (phone != null) {
      user = await store.findUserByPhone(phone);
      if (user == null) {
        return _error(404, 'telefone não cadastrado — crie uma conta');
      }
    } else {
      user = await store.findUser(email);
      if (user == null) {
        return _error(404, 'e-mail não cadastrado — crie uma conta');
      }
    }
    final code = _sixDigitCode();
    final setResult = await store.setVerificationCodeFor(
      email: user['email'] as String?,
      phone: user['phone'] as String?,
      codeHash: _hash(code),
    );
    if (setResult['error'] != null) {
      return _error(
        setResult['status'] as int? ?? 400,
        setResult['error'] as String,
      );
    }
    final channel = phone != null ? 'phone' : 'email';
    final target = phone ?? email;
    return _otpResponse(
      await _sendOtp(channel: channel, target: target, code: code),
    );
  });

  router.post('/auth/otp/verify', (Request req) async {
    final body = jsonDecode(await req.readAsString()) as Map<String, dynamic>;
    final phone = normalizePhone(body['phone'] as String?);
    final email = (body['email'] as String? ?? '').trim().toLowerCase();
    final code = (body['code'] as String? ?? '').trim();
    if (code.isEmpty) return _error(400, 'código obrigatório');
    final result = await store.verifyOtp(
      email: email.isEmpty ? null : email,
      phone: phone,
      codeHash: _hash(code),
      markEmail: email.isNotEmpty || phone == null,
      markPhone: phone != null,
    );
    if (result['error'] != null) {
      return _error(result['status'] as int? ?? 400, result['error'] as String);
    }
    return Response.ok(
      jsonEncode(result),
      headers: {'Content-Type': 'application/json'},
    );
  });

  router.post('/auth/login', (Request req) async {
    final body = jsonDecode(await req.readAsString()) as Map<String, dynamic>;
    final email = (body['email'] as String? ?? '').trim().toLowerCase();
    final password = body['password'] as String? ?? '';
    final user = await store.findUser(email);
    if (user == null || user['passwordHash'] != _hash(password)) {
      return _error(401, 'credenciais inválidas');
    }
    final verified = user['emailVerified'] == true ||
        user['phoneVerified'] == true ||
        skipEmailVerification ||
        skipSmsVerification;
    if (!verified) {
      return _error(403, 'conta não confirmada — use o código OTP');
    }
    final token = await store.issueToken(user['id'] as String);
    return Response.ok(
      jsonEncode(_publicUser(user, token: token)),
      headers: {'Content-Type': 'application/json'},
    );
  });

  router.get('/auth/me', (Request req) async {
    final userId = await _auth(req, store);
    if (userId == null) return _error(401, 'unauthorized');
    final user = await store.findUserById(userId);
    if (user == null) return _error(404, 'usuário não encontrado');
    return Response.ok(
      jsonEncode(_publicUser(user)),
      headers: {'Content-Type': 'application/json'},
    );
  });

  router.post('/sync/push', (Request req) async {
    final userId = await _auth(req, store);
    if (userId == null) return _error(401, 'unauthorized');
    final user = await store.findUserById(userId);
    if (user == null || user['emailVerified'] != true) {
      return _error(403, 'conta não verificada por e-mail');
    }
    final body = jsonDecode(await req.readAsString()) as Map<String, dynamic>;
    final result = await store.push(userId, body);
    return Response.ok(
      jsonEncode(result),
      headers: {'Content-Type': 'application/json'},
    );
  });

  router.get('/sync/pull', (Request req) async {
    final userId = await _auth(req, store);
    if (userId == null) return _error(401, 'unauthorized');
    final sinceRaw = req.url.queryParameters['since'];
    final since = sinceRaw != null
        ? DateTime.tryParse(sinceRaw) ??
            DateTime.fromMillisecondsSinceEpoch(0, isUtc: true)
        : DateTime.fromMillisecondsSinceEpoch(0, isUtc: true);
    final result = await store.pull(userId, since);
    return Response.ok(
      jsonEncode(result),
      headers: {'Content-Type': 'application/json'},
    );
  });

  router.post('/votes/check', (Request req) async {
    final userId = await _auth(req, store);
    if (userId == null) return _error(401, 'unauthorized');
    final user = await store.findUserById(userId);
    if (user == null || user['emailVerified'] != true) {
      return _error(403, 'conta não verificada por e-mail');
    }
    final body = jsonDecode(await req.readAsString()) as Map<String, dynamic>;
    final priceLogId = body['priceLogId'] as String? ?? '';
    final vote = body['vote'] as String? ?? '';
    final withPhoto = body['withPhoto'] == true;
    var weight = (body['weight'] as num?)?.toDouble();
    weight ??= await store.userVoteWeight(userId);
    if (withPhoto) weight += 0.5;
    if (priceLogId.isEmpty || (vote != 'confirm' && vote != 'reject')) {
      return _error(400, 'priceLogId/vote inválidos');
    }
    final result = await store.castVote(
      userId: userId,
      priceLogId: priceLogId,
      vote: vote,
      weight: weight,
      withPhoto: withPhoto,
    );
    if (result['error'] != null) {
      return _error(result['status'] as int? ?? 400, result['error'] as String);
    }
    return Response.ok(
      jsonEncode(result),
      headers: {'Content-Type': 'application/json'},
    );
  });

  router.get('/prices/<id>/trust', (Request req, String id) async {
    final userId = await _auth(req, store);
    if (userId == null) return _error(401, 'unauthorized');
    final trust = await store.trustFor(id);
    if (trust == null) return _error(404, 'price log não encontrado');
    return Response.ok(
      jsonEncode(trust),
      headers: {'Content-Type': 'application/json'},
    );
  });

  router.get('/markets/map', (Request req) async {
    final markets = await store.marketsForMap();
    return Response.ok(
      jsonEncode({'markets': markets}),
      headers: {'Content-Type': 'application/json'},
    );
  });

  router.post('/markets/<id>/reviews', (Request req, String id) async {
    final userId = await _auth(req, store);
    if (userId == null) return _error(401, 'unauthorized');
    final user = await store.findUserById(userId);
    if (user == null || user['emailVerified'] != true) {
      return _error(403, 'conta não verificada');
    }
    final body = jsonDecode(await req.readAsString()) as Map<String, dynamic>;
    final stars = (body['stars'] as num?)?.toInt() ?? 0;
    if (stars < 1 || stars > 5) return _error(400, 'stars 1–5');
    final result = await store.upsertMarketReview(
      marketId: id,
      userId: userId,
      stars: stars,
      comment: body['comment'] as String?,
    );
    if (result['error'] != null) {
      return _error(result['status'] as int? ?? 400, result['error'] as String);
    }
    return Response.ok(
      jsonEncode(result),
      headers: {'Content-Type': 'application/json'},
    );
  });

  router.get('/markets/<id>/reviews', (Request req, String id) async {
    final reviews = await store.listMarketReviews(id);
    return Response.ok(
      jsonEncode({'reviews': reviews}),
      headers: {'Content-Type': 'application/json'},
    );
  });

  router.get('/me/prefs', (Request req) async {
    final userId = await _auth(req, store);
    if (userId == null) return _error(401, 'unauthorized');
    final prefs = await store.getUserPrefs(userId);
    return Response.ok(
      jsonEncode(prefs),
      headers: {'Content-Type': 'application/json'},
    );
  });

  router.put('/me/prefs', (Request req) async {
    final userId = await _auth(req, store);
    if (userId == null) return _error(401, 'unauthorized');
    final body = jsonDecode(await req.readAsString()) as Map<String, dynamic>;
    final prefs = await store.setUserPrefs(userId, body);
    return Response.ok(
      jsonEncode(prefs),
      headers: {'Content-Type': 'application/json'},
    );
  });

  router.get('/me/reputation', (Request req) async {
    final userId = await _auth(req, store);
    if (userId == null) return _error(401, 'unauthorized');
    final rep = await store.getReputation(userId);
    return Response.ok(
      jsonEncode(rep),
      headers: {'Content-Type': 'application/json'},
    );
  });

  router.post('/compare/basket', (Request req) async {
    final userId = await _auth(req, store);
    if (userId == null) return _error(401, 'unauthorized');
    final body = jsonDecode(await req.readAsString()) as Map<String, dynamic>;
    final result = await store.compareBasket(userId, body);
    return Response.ok(
      jsonEncode(result),
      headers: {'Content-Type': 'application/json'},
    );
  });

  router.get('/prices/community', (Request req) async {
    final userId = await _auth(req, store);
    if (userId == null) return _error(401, 'unauthorized');
    final productName = req.url.queryParameters['productName'];
    final city = req.url.queryParameters['city'];
    final result = await store.communityPrices(
      productName: productName,
      city: city,
    );
    return Response.ok(
      jsonEncode({'prices': result}),
      headers: {'Content-Type': 'application/json'},
    );
  });

  // Guarda Jev no store para o push classificar logs novos
  store.attachJev(jev);

  return router;
}

bool _flag(String? value) {
  if (value == null) return false;
  final v = value.trim().toLowerCase();
  return v == 'true' || v == '1' || v == 'yes';
}

String _sixDigitCode() {
  final n = DateTime.now().microsecondsSinceEpoch % 900000 + 100000;
  return n.toString();
}

/// Normaliza telefone BR para dígitos com país 55 (ex: 5511999998888).
String? normalizePhone(String? raw) {
  if (raw == null) return null;
  final d = raw.replaceAll(RegExp(r'\D'), '');
  if (d.isEmpty) return null;
  if (d.startsWith('55') && d.length >= 12) return d;
  if (d.length == 10 || d.length == 11) return '55$d';
  return d.length >= 10 ? d : null;
}

Future<String?> _auth(Request req, DataStore store) async {
  final header = req.headers['authorization'];
  if (header == null || !header.startsWith('Bearer ')) return null;
  return store.userIdForToken(header.substring(7));
}

Response _error(int code, String message) => Response(
      code,
      body: jsonEncode({'error': message}),
      headers: {'Content-Type': 'application/json'},
    );

String _hash(String password) =>
    sha256.convert(utf8.encode(password)).toString();

class DataStore {
  DataStore._({
    required this.mode,
    this.db,
  });

  final String mode;
  final Db? db;

  final _memUsers = <String, Map<String, dynamic>>{};
  final _memTokens = <String, String>{};
  final _memProducts = <String, Map<String, dynamic>>{};
  final _memMarkets = <String, Map<String, dynamic>>{};
  final _memLogs = <String, Map<String, dynamic>>{};
  final _memShoppingLists = <String, Map<String, dynamic>>{};
  final _memVotes = <String, Map<String, dynamic>>{};
  final _memReputation = <String, Map<String, dynamic>>{};
  final _memReviews = <String, Map<String, dynamic>>{};
  final _memPrefs = <String, Map<String, dynamic>>{};
  JevClient? _jev;

  static Future<DataStore> open({String? mongoUri, required String dbName}) async {
    if (mongoUri == null || mongoUri.isEmpty) {
      stdout.writeln(
        'MONGODB_URI ausente — usando store em memória (dev).',
      );
      return DataStore._(mode: 'memory');
    }
    final db = await Db.create(mongoUri);
    await db.open();
    if (db.databaseName == null || db.databaseName!.isEmpty) {
      // URI may include db; otherwise switch.
    }
    stdout.writeln('Conectado ao MongoDB ($dbName)');
    return DataStore._(mode: 'mongo', db: db);
  }

  DbCollection _col(String name) => db!.collection(name);

  void attachJev(JevClient client) => _jev = client;

  Future<double> userVoteWeight(String userId) => _userWeight(userId);

  Future<Map<String, dynamic>?> findUser(String email) async {
    if (mode == 'memory') {
      return _memUsers.values.cast<Map<String, dynamic>?>().firstWhere(
            (u) => u?['email'] == email,
            orElse: () => null,
          );
    }
    return _col('users').findOne(where.eq('email', email));
  }

  Future<Map<String, dynamic>?> findUserByPhone(String phone) async {
    if (mode == 'memory') {
      return _memUsers.values.cast<Map<String, dynamic>?>().firstWhere(
            (u) => u?['phone'] == phone,
            orElse: () => null,
          );
    }
    return _col('users').findOne(where.eq('phone', phone));
  }

  Future<Map<String, dynamic>> createUser({
    required String email,
    String? phone,
    required String passwordHash,
    required String displayName,
    String? uf,
    String? city,
    required bool emailVerified,
    bool phoneVerified = false,
    required String verificationCodeHash,
  }) async {
    final id = const Uuid().v4();
    final token = const Uuid().v4();
    final now = DateTime.now().toUtc();
    final doc = {
      'id': id,
      'email': email,
      'phone': phone,
      'passwordHash': passwordHash,
      'displayName': displayName,
      'uf': uf,
      'city': city,
      'emailVerified': emailVerified,
      'phoneVerified': phoneVerified,
      'verificationCodeHash': verificationCodeHash,
      'verificationExpiresAt':
          now.add(const Duration(minutes: 15)).toIso8601String(),
      'token': token,
      'createdAt': now.toIso8601String(),
    };
    if (mode == 'memory') {
      _memUsers[id] = doc;
      _memTokens[token] = id;
      return doc;
    }
    await _col('users').insertOne(doc);
    return doc;
  }

  Future<Map<String, dynamic>?> findUserById(String id) async {
    if (mode == 'memory') return _memUsers[id];
    return _col('users').findOne(where.eq('id', id));
  }

  Future<Map<String, dynamic>> verifyOtp({
    String? email,
    String? phone,
    required String codeHash,
    bool markEmail = false,
    bool markPhone = false,
  }) async {
    Map<String, dynamic>? user;
    if (phone != null) {
      user = await findUserByPhone(phone);
    }
    user ??= email != null && email.isNotEmpty ? await findUser(email) : null;
    if (user == null) return {'error': 'usuário não encontrado', 'status': 404};
    final attempts = (user['verifyAttempts'] as num?)?.toInt() ?? 0;
    if (attempts >= 5) {
      return {'error': 'muitas tentativas — peça um novo código', 'status': 429};
    }
    final exp = DateTime.tryParse(
      user['verificationExpiresAt'] as String? ?? '',
    );
    if (exp != null && DateTime.now().toUtc().isAfter(exp)) {
      return {'error': 'código expirado', 'status': 400};
    }
    if (user['verificationCodeHash'] != codeHash) {
      user['verifyAttempts'] = attempts + 1;
      if (mode == 'memory') {
        _memUsers[user['id'] as String] = user;
      } else {
        await _col('users').replaceOne(where.eq('id', user['id']), user);
      }
      return {'error': 'código inválido', 'status': 400};
    }
    if (markEmail) user['emailVerified'] = true;
    if (markPhone) user['phoneVerified'] = true;
    // Confirmar OTP valida o canal usado e libera a conta.
    if (markPhone) user['emailVerified'] = true;
    if (markEmail) user['phoneVerified'] = user['phoneVerified'] == true;
    user['verificationCodeHash'] = null;
    user['verifyAttempts'] = 0;
    final token = await issueToken(user['id'] as String);
    if (mode == 'memory') {
      _memUsers[user['id'] as String] = user;
    } else {
      await _col('users').replaceOne(where.eq('id', user['id']), user);
    }
    return {
      'token': token,
      'userId': user['id'],
      'email': user['email'],
      'phone': user['phone'],
      'displayName': user['displayName'] ?? 'Fiscal',
      'emailVerified': user['emailVerified'] == true,
      'phoneVerified': user['phoneVerified'] == true,
      'uf': user['uf'],
      'city': user['city'],
    };
  }

  Future<Map<String, dynamic>> setVerificationCodeFor({
    String? email,
    String? phone,
    required String codeHash,
  }) async {
    Map<String, dynamic>? user;
    if (phone != null) user = await findUserByPhone(phone);
    user ??= email != null && email.isNotEmpty ? await findUser(email) : null;
    if (user == null) {
      return {'error': 'usuário não encontrado', 'status': 404};
    }
    final last = DateTime.tryParse(user['lastCodeSentAt'] as String? ?? '');
    if (last != null &&
        DateTime.now().toUtc().difference(last).inSeconds < 60) {
      return {'error': 'aguarde 60s para reenviar', 'status': 429};
    }
    user['verificationCodeHash'] = codeHash;
    user['verificationExpiresAt'] = DateTime.now()
        .toUtc()
        .add(const Duration(minutes: 15))
        .toIso8601String();
    user['lastCodeSentAt'] = DateTime.now().toUtc().toIso8601String();
    user['verifyAttempts'] = 0;
    if (mode == 'memory') {
      _memUsers[user['id'] as String] = user;
    } else {
      await _col('users').replaceOne(where.eq('id', user['id']), user);
    }
    return {
      'ok': true,
      'email': user['email'],
      'phone': user['phone'],
    };
  }

  Future<List<Map<String, dynamic>>> listMarketReviews(String marketId) async {
    List<Map<String, dynamic>> reviews;
    if (mode == 'memory') {
      reviews = _memReviews.values
          .where((r) => r['marketId'] == marketId)
          .toList();
    } else {
      reviews = await _col('market_reviews')
          .find(where.eq('marketId', marketId))
          .toList();
    }
    // Público: só nota + data — sem voterHash/identidade.
    return [
      for (final r in reviews)
        {
          'stars': r['stars'],
          'createdAt': r['createdAt'],
          if (r['comment'] != null) 'comment': r['comment'],
        },
    ];
  }

  void ensureDemoMarkets() {
    if (mode != 'memory' || _memMarkets.isNotEmpty) return;
    final now = DateTime.now().toUtc().toIso8601String();
    final demos = [
      {
        'id': const Uuid().v4(),
        'name': 'Atacadão Cruz de Rebouças',
        'uf': 'PE',
        'lat': -8.0284,
        'lng': -34.9352,
        'address': 'Av. Dr. José Rufino, Recife - PE',
        'priceLevel': 'low',
        'updatedAt': now,
      },
      {
        'id': const Uuid().v4(),
        'name': 'Novo Atacarejo Imbiribeira',
        'uf': 'PE',
        'lat': -8.1145,
        'lng': -34.9188,
        'address': 'Imbiribeira, Recife - PE',
        'priceLevel': 'low',
        'updatedAt': now,
      },
      {
        'id': const Uuid().v4(),
        'name': 'Assaí Atacadista Imbiribeira',
        'uf': 'PE',
        'lat': -8.1015,
        'lng': -34.9255,
        'address': 'Av. Marechal Mascarenhas, Recife - PE',
        'priceLevel': 'low',
        'updatedAt': now,
      },
      {
        'id': const Uuid().v4(),
        'name': 'Carrefour Dourados',
        'uf': 'PE',
        'lat': -8.0476,
        'lng': -34.877,
        'address': 'Av. Mal. Mascarenhas de Morais, Recife - PE',
        'priceLevel': 'fair',
        'updatedAt': now,
      },
      {
        'id': const Uuid().v4(),
        'name': "Sam's Club Recife",
        'uf': 'PE',
        'lat': -8.1121,
        'lng': -34.9148,
        'address': 'Av. Eng. Domingos Ferreira, Recife - PE',
        'priceLevel': 'fair',
        'updatedAt': now,
      },
    ];
    for (final m in demos) {
      _memMarkets[m['id'] as String] = m;
    }
  }

  Future<List<Map<String, dynamic>>> marketsForMap() async {
    ensureDemoMarkets();
    List<Map<String, dynamic>> markets;
    if (mode == 'memory') {
      markets = _memMarkets.values.toList();
    } else {
      markets = await _col('markets').find().toList();
    }
    // Anexa rating agregado
    final out = <Map<String, dynamic>>[];
    for (final m in markets) {
      final id = m['id'] as String?;
      if (id == null) continue;
      final agg = await _aggregateReviews(id);
      out.add({
        ...m,
        'avgRating': agg['avg'],
        'ratingsCount': agg['count'],
        'priceLevel': m['priceLevel'] ?? await _computePriceLevel(id),
      });
    }
    return out;
  }

  Future<Map<String, dynamic>> _aggregateReviews(String marketId) async {
    List<Map<String, dynamic>> reviews;
    if (mode == 'memory') {
      reviews = _memReviews.values
          .where((r) => r['marketId'] == marketId)
          .toList();
    } else {
      reviews =
          await _col('market_reviews').find(where.eq('marketId', marketId)).toList();
    }
    if (reviews.isEmpty) return {'avg': 0.0, 'count': 0};
    double sum = 0;
    double weightSum = 0;
    for (final r in reviews) {
      final w = (r['weight'] as num?)?.toDouble() ?? 1.0;
      sum += ((r['stars'] as num).toDouble()) * w;
      weightSum += w;
    }
    return {
      'avg': weightSum == 0 ? 0.0 : sum / weightSum,
      'count': reviews.length,
    };
  }

  Future<String> _computePriceLevel(String marketId) async {
    // Heurística simples: compara média de preços do mercado vs global
    List<Map<String, dynamic>> logs;
    if (mode == 'memory') {
      logs = _memLogs.values.toList();
    } else {
      logs = await _col('price_logs').find().toList();
    }
    final mine = logs.where((l) => l['marketId'] == marketId).toList();
    if (mine.isEmpty || logs.length < 2) return 'fair';
    final myAvg = mine
            .map((l) => (l['retailPrice'] as num).toDouble())
            .reduce((a, b) => a + b) /
        mine.length;
    final globalAvg = logs
            .map((l) => (l['retailPrice'] as num).toDouble())
            .reduce((a, b) => a + b) /
        logs.length;
    if (globalAvg == 0) return 'fair';
    final delta = (myAvg - globalAvg) / globalAvg;
    if (delta <= -0.08) return 'low';
    if (delta >= 0.08) return 'high';
    return 'fair';
  }

  Future<Map<String, dynamic>> upsertMarketReview({
    required String marketId,
    required String userId,
    required int stars,
    String? comment,
  }) async {
    final voterHash = _hash('review|$userId|$marketId');
    final weight = await _userWeight(userId);
    final now = DateTime.now().toUtc();
    Map<String, dynamic>? existing;
    if (mode == 'memory') {
      existing = _memReviews.values.cast<Map<String, dynamic>?>().firstWhere(
            (r) => r?['marketId'] == marketId && r?['voterHash'] == voterHash,
            orElse: () => null,
          );
    } else {
      existing = await _col('market_reviews').findOne(
        where.eq('marketId', marketId).eq('voterHash', voterHash),
      );
    }
    if (existing != null) {
      final last = DateTime.tryParse(existing['createdAt'] as String? ?? '');
      if (last != null && now.difference(last).inHours < 24) {
        return {'error': 'aguarde 24h para alterar a nota', 'status': 429};
      }
      existing
        ..['stars'] = stars
        ..['comment'] = comment
        ..['weight'] = weight
        ..['createdAt'] = now.toIso8601String();
      if (mode == 'memory') {
        _memReviews[existing['id'] as String] = existing;
      } else {
        await _col('market_reviews')
            .replaceOne(where.eq('id', existing['id']), existing);
      }
    } else {
      final doc = {
        'id': const Uuid().v4(),
        'marketId': marketId,
        'stars': stars,
        'comment': comment,
        'voterHash': voterHash,
        'weight': weight,
        'createdAt': now.toIso8601String(),
      };
      if (mode == 'memory') {
        _memReviews[doc['id'] as String] = doc;
      } else {
        await _col('market_reviews').insertOne(doc);
      }
    }
    final agg = await _aggregateReviews(marketId);
    return {
      'ok': true,
      'avgRating': agg['avg'],
      'ratingsCount': agg['count'],
    };
  }

  Future<double> _userWeight(String userId) async {
    Map<String, dynamic>? rep;
    if (mode == 'memory') {
      rep = _memReputation[userId];
    } else {
      rep = await _col('user_reputation').findOne(where.eq('userId', userId));
    }
    final level = rep?['level'] as String? ?? 'bronze';
    if (level == 'gold') return 2.0;
    if (level == 'silver') return 1.5;
    return 1.0;
  }

  Future<String> issueToken(String userId) async {
    final token = const Uuid().v4();
    if (mode == 'memory') {
      _memTokens[token] = userId;
      final user = _memUsers[userId];
      if (user != null) user['token'] = token;
      return token;
    }
    await _col('users').updateOne(
      where.eq('id', userId),
      modify.set('token', token),
    );
    return token;
  }

  Future<String?> userIdForToken(String token) async {
    if (mode == 'memory') return _memTokens[token];
    final user = await _col('users').findOne(where.eq('token', token));
    return user?['id'] as String?;
  }

  Future<Map<String, dynamic>> push(
    String userId,
    Map<String, dynamic> body,
  ) async {
    final productIdMap = <String, String>{};
    final marketIdMap = <String, String>{};
    final priceLogIdMap = <String, String>{};
    final shoppingListIdMap = <String, String>{};

    for (final raw in (body['markets'] as List? ?? const [])) {
      final m = Map<String, dynamic>.from(raw as Map);
      final remoteId = await _upsertLww(
        collection: 'markets',
        mem: _memMarkets,
        incoming: {
          'id': m['remoteId'] ?? const Uuid().v4(),
          'name': m['name'],
          'cnpj': m['cnpj'],
          'uf': m['uf'],
          'lat': m['lat'],
          'lng': m['lng'],
          'address': m['address'],
          'priceLevel': m['priceLevel'],
          'updatedAt': m['updatedAt'],
          'contributorId': userId,
        },
        matchKeys: ['cnpj', 'name'],
      );
      productIdMap; // keep analyzer calm
      marketIdMap['${m['localId']}'] = remoteId;
    }

    for (final raw in (body['products'] as List? ?? const [])) {
      final p = Map<String, dynamic>.from(raw as Map);
      final remoteId = await _upsertLww(
        collection: 'products',
        mem: _memProducts,
        incoming: {
          'id': p['remoteId'] ?? const Uuid().v4(),
          'name': p['name'],
          'aliases': p['aliases'] ?? [],
          'category': p['category'],
          'updatedAt': p['updatedAt'],
          'contributorId': userId,
        },
        matchKeys: ['name'],
      );
      productIdMap['${p['localId']}'] = remoteId;
    }

    for (final raw in (body['priceLogs'] as List? ?? const [])) {
      final l = Map<String, dynamic>.from(raw as Map);
      final productRemote = productIdMap['${l['productLocalId']}'] ??
          await _resolveProductRemote(l['productLocalId']);
      final marketRemote = l['marketLocalId'] == null
          ? null
          : marketIdMap['${l['marketLocalId']}'];

      final source = (l['source'] as String?) ?? 'label';
      var trustLevel = (l['trustLevel'] as String?) ?? 'suspect';
      var confirmScore = (l['confirmScore'] as num?)?.toDouble() ?? 0;
      // NFC-e começa com boost
      if (source == 'nfce' && confirmScore < 1) confirmScore = 1;

      final classified = await _classifyWithJev(
        productId: productRemote,
        marketId: marketRemote,
        retailPrice: (l['retailPrice'] as num?)?.toDouble() ?? 0,
        source: source,
        userId: userId,
      );
      if (classified['action'] == 'reject') {
        trustLevel = 'hidden';
      } else if (classified['action'] == 'accept' && source == 'nfce') {
        trustLevel = _computeTrust(
          confirmScore: confirmScore + 2,
          rejectScore: (l['rejectScore'] as num?)?.toDouble() ?? 0,
          lastConfirmedAt: DateTime.now().toUtc(),
        );
        confirmScore = confirmScore + 2;
      } else {
        trustLevel = 'suspect';
      }

      final remoteId = await _upsertLww(
        collection: 'price_logs',
        mem: _memLogs,
        incoming: {
          'id': l['remoteId'] ?? const Uuid().v4(),
          'productId': productRemote,
          'marketId': marketRemote,
          'retailPrice': l['retailPrice'],
          'wholesalePrice': l['wholesalePrice'],
          'minWholesaleQty': l['minWholesaleQty'],
          'source': source,
          'capturedAt': l['capturedAt'],
          'nfceKey': l['nfceKey'],
          'confirmScore': confirmScore,
          'rejectScore': l['rejectScore'] ?? 0,
          'trustLevel': trustLevel,
          'lastConfirmedAt': l['lastConfirmedAt'],
          'jevAction': classified['action'],
          'jevRisk': classified['risk'],
          'updatedAt': l['updatedAt'],
          'contributorId': l['contributorId'] ?? userId,
        },
        matchKeys: ['nfceKey'],
      );
      priceLogIdMap['${l['localId']}'] = remoteId;
      await _awardContributionBadges(
        userId: userId,
        source: source,
      );
    }

    for (final raw in (body['shoppingLists'] as List? ?? const [])) {
      final s = Map<String, dynamic>.from(raw as Map);
      final remoteId = await _upsertLww(
        collection: 'shopping_lists',
        mem: _memShoppingLists,
        incoming: {
          'id': s['remoteId'] ?? const Uuid().v4(),
          'ownerId': userId,
          'name': s['name'],
          'marketId': s['marketId'],
          'marketName': s['marketName'],
          'itemsJson': s['itemsJson'],
          'subtotal': s['subtotal'],
          'savings': s['savings'],
          'itemCount': s['itemCount'],
          'finishedAt': s['finishedAt'],
          'updatedAt': s['updatedAt'],
        },
        matchKeys: const [],
      );
      shoppingListIdMap['${s['localId']}'] = remoteId;
    }

    return {
      'productIdMap': productIdMap,
      'marketIdMap': marketIdMap,
      'priceLogIdMap': priceLogIdMap,
      'shoppingListIdMap': shoppingListIdMap,
    };
  }

  Future<String?> _resolveProductRemote(dynamic localId) async => null;

  Future<String> _upsertLww({
    required String collection,
    required Map<String, Map<String, dynamic>> mem,
    required Map<String, dynamic> incoming,
    required List<String> matchKeys,
  }) async {
    final incomingUpdated =
        DateTime.tryParse(incoming['updatedAt'] as String? ?? '') ??
            DateTime.now().toUtc();

    Map<String, dynamic>? existing;
    if (mode == 'memory') {
      existing = mem.values.cast<Map<String, dynamic>?>().firstWhere(
        (doc) {
          if (doc == null) return false;
          if (doc['id'] == incoming['id']) return true;
          for (final k in matchKeys) {
            final v = incoming[k];
            if (v != null && v.toString().isNotEmpty && doc[k] == v) {
              return true;
            }
          }
          return false;
        },
        orElse: () => null,
      );
      if (existing == null) {
        mem[incoming['id'] as String] = incoming;
        return incoming['id'] as String;
      }
      final existingUpdated =
          DateTime.tryParse(existing['updatedAt'] as String? ?? '') ??
              DateTime.fromMillisecondsSinceEpoch(0, isUtc: true);
      if (incomingUpdated.isAfter(existingUpdated)) {
        incoming['id'] = existing['id'];
        mem[existing['id'] as String] = incoming;
      }
      return existing['id'] as String;
    }

    // Mongo path
    existing = await _col(collection).findOne(where.eq('id', incoming['id']));
    if (existing == null) {
      for (final k in matchKeys) {
        final v = incoming[k];
        if (v == null || v.toString().isEmpty) continue;
        existing = await _col(collection).findOne(where.eq(k, v));
        if (existing != null) break;
      }
    }
    if (existing == null) {
      await _col(collection).insertOne(incoming);
      return incoming['id'] as String;
    }
    final existingUpdated =
        DateTime.tryParse(existing['updatedAt'] as String? ?? '') ??
            DateTime.fromMillisecondsSinceEpoch(0, isUtc: true);
    if (incomingUpdated.isAfter(existingUpdated)) {
      incoming['id'] = existing['id'];
      await _col(collection).replaceOne(where.eq('id', existing['id']), incoming);
    }
    return existing['id'] as String;
  }

  Future<Map<String, dynamic>> pull(String userId, DateTime since) async {
    if (mode == 'memory') {
      bool after(Map<String, dynamic> d) {
        final u = DateTime.tryParse(d['updatedAt'] as String? ?? '');
        return u != null && u.isAfter(since);
      }

      return {
        'products': _memProducts.values.where(after).toList(),
        'markets': _memMarkets.values.where(after).toList(),
        'priceLogs': _memLogs.values.where(after).toList(),
        'shoppingLists': _memShoppingLists.values
            .where((d) => d['ownerId'] == userId && after(d))
            .toList(),
      };
    }

    final iso = since.toIso8601String();
    final products =
        await _col('products').find(where.gt('updatedAt', iso)).toList();
    final markets =
        await _col('markets').find(where.gt('updatedAt', iso)).toList();
    final logs =
        await _col('price_logs').find(where.gt('updatedAt', iso)).toList();
    final shoppingLists = await _col('shopping_lists')
        .find(
          where
              .eq('ownerId', userId)
              .gt('updatedAt', iso),
        )
        .toList();
    return {
      'products': products,
      'markets': markets,
      'priceLogs': logs,
      'shoppingLists': shoppingLists,
    };
  }

  Future<Map<String, dynamic>?> _findLog(String id) async {
    if (mode == 'memory') return _memLogs[id];
    return _col('price_logs').findOne(where.eq('id', id));
  }

  Future<void> _saveLog(Map<String, dynamic> log) async {
    if (mode == 'memory') {
      _memLogs[log['id'] as String] = log;
      return;
    }
    await _col('price_logs').replaceOne(where.eq('id', log['id']), log);
  }

  String _computeTrust({
    required double confirmScore,
    required double rejectScore,
    DateTime? lastConfirmedAt,
  }) {
    final now = DateTime.now().toUtc();
    if (rejectScore >= 3 && rejectScore > confirmScore) return 'hidden';
    final recent = lastConfirmedAt != null &&
        now.difference(lastConfirmedAt).inDays <= 3 &&
        confirmScore >= 3;
    if (recent) return 'verified';
    return 'suspect';
  }

  Future<Map<String, dynamic>> _classifyWithJev({
    required String? productId,
    required String? marketId,
    required double retailPrice,
    required String source,
    required String userId,
  }) async {
    final jev = _jev;
    if (jev == null) {
      return {'action': 'quarantine', 'risk': 1.0, 'fallback': true};
    }
    String productName = productId ?? 'produto';
    String marketName = marketId ?? 'mercado';
    if (mode == 'memory') {
      productName =
          _memProducts[productId]?['name'] as String? ?? productName;
      marketName = _memMarkets[marketId]?['name'] as String? ?? marketName;
    } else {
      if (productId != null) {
        final p = await _col('products').findOne(where.eq('id', productId));
        productName = p?['name'] as String? ?? productName;
      }
      if (marketId != null) {
        final m = await _col('markets').findOne(where.eq('id', marketId));
        marketName = m?['name'] as String? ?? marketName;
      }
    }
    final prefs = await getUserPrefs(userId);
    return jev.classifyPrice(
      productName: productName,
      marketName: marketName,
      retailPrice: retailPrice,
      source: source,
      city: prefs['city'] as String?,
    );
  }

  Future<void> _awardContributionBadges({
    required String userId,
    required String source,
  }) async {
    final rep = await getReputation(userId);
    final badges = List<String>.from(rep['badges'] as List? ?? []);
    if (source == 'nfce' && !badges.contains('primeira_nfce')) {
      badges.add('primeira_nfce');
    }
    if ((source == 'label' || source == 'manual') &&
        !badges.contains('primeira_captura')) {
      badges.add('primeira_captura');
    }
    rep['badges'] = badges;
    await _saveReputation(userId, rep);
  }

  Future<Map<String, dynamic>> getUserPrefs(String userId) async {
    if (mode == 'memory') {
      return Map<String, dynamic>.from(
        _memPrefs[userId] ??
            {
              'city': '',
              'neighborhood': '',
              'favoriteMarketIds': <String>[],
            },
      );
    }
    final doc =
        await _col('user_prefs').findOne(where.eq('userId', userId));
    return {
      'city': doc?['city'] ?? '',
      'neighborhood': doc?['neighborhood'] ?? '',
      'favoriteMarketIds':
          List<String>.from(doc?['favoriteMarketIds'] as List? ?? const []),
    };
  }

  Future<Map<String, dynamic>> setUserPrefs(
    String userId,
    Map<String, dynamic> body,
  ) async {
    final doc = {
      'userId': userId,
      'city': (body['city'] as String?)?.trim() ?? '',
      'neighborhood': (body['neighborhood'] as String?)?.trim() ?? '',
      'favoriteMarketIds': List<String>.from(
        (body['favoriteMarketIds'] as List? ?? const []).map((e) => '$e'),
      ),
      'updatedAt': DateTime.now().toUtc().toIso8601String(),
    };
    if (mode == 'memory') {
      _memPrefs[userId] = doc;
      return doc;
    }
    await _col('user_prefs').replaceOne(
          where.eq('userId', userId),
          doc,
          upsert: true,
        );
    return doc;
  }

  Future<Map<String, dynamic>> getReputation(String userId) async {
    Map<String, dynamic>? rep;
    if (mode == 'memory') {
      rep = _memReputation[userId];
    } else {
      rep = await _col('user_reputation').findOne(where.eq('userId', userId));
    }
    rep ??= {
      'userId': userId,
      'points': 0,
      'level': 'bronze',
      'validationsCount': 0,
      'badges': <String>[],
      'updatedAt': DateTime.now().toUtc().toIso8601String(),
    };
    rep['badges'] = List<String>.from(rep['badges'] as List? ?? const []);
    return Map<String, dynamic>.from(rep);
  }

  Future<void> _saveReputation(
    String userId,
    Map<String, dynamic> rep,
  ) async {
    rep['updatedAt'] = DateTime.now().toUtc().toIso8601String();
    if (mode == 'memory') {
      _memReputation[userId] = rep;
      return;
    }
    await _col('user_reputation').replaceOne(
          where.eq('userId', userId),
          rep,
          upsert: true,
        );
  }

  Future<Map<String, dynamic>> compareBasket(
    String userId,
    Map<String, dynamic> body,
  ) async {
    final items = (body['items'] as List? ?? const [])
        .map((e) => Map<String, dynamic>.from(e as Map))
        .toList();
    var favIds = List<String>.from(
      (body['favoriteMarketIds'] as List? ?? const []).map((e) => '$e'),
    );
    final prefs = await getUserPrefs(userId);
    if (favIds.isEmpty) {
      favIds = List<String>.from(
        prefs['favoriteMarketIds'] as List? ?? const [],
      );
    }

    final markets = mode == 'memory'
        ? _memMarkets.values.toList()
        : await _col('markets').find().toList();
    final logs = mode == 'memory'
        ? _memLogs.values.toList()
        : await _col('price_logs').find().toList();

    final pool = markets.where((m) {
      if (favIds.isEmpty) return true;
      return favIds.contains(m['id']);
    }).toList();

    final now = DateTime.now().toUtc();
    bool usable(Map<String, dynamic> log) {
      final trust = log['trustLevel'] as String? ?? 'suspect';
      if (trust == 'hidden') return false;
      if (trust == 'verified') return true;
      if (log['source'] == 'nfce') {
        final t = DateTime.tryParse(log['capturedAt'] as String? ?? '');
        if (t == null) return false;
        return now.difference(t).inDays <= 7;
      }
      return false;
    }

    final community = logs.where(usable).toList();
    final ranks = <Map<String, dynamic>>[];

    for (final market in pool) {
      var total = 0.0;
      var covered = 0;
      final missing = <String>[];
      for (final item in items) {
        final name = (item['productName'] as String? ?? '').toLowerCase();
        final qty = (item['quantity'] as num?)?.toDouble() ?? 1;
        final productRemote = item['productRemoteId'] as String?;
        final candidates = community.where((l) {
          if (l['marketId'] != market['id']) return false;
          if (productRemote != null && l['productId'] == productRemote) {
            return true;
          }
          // match by product name via mem/mongo product
          return false;
        }).toList();

        Map<String, dynamic>? best;
        if (candidates.isNotEmpty) {
          candidates.sort((a, b) {
            final ta = DateTime.tryParse(a['capturedAt'] as String? ?? '') ??
                DateTime.fromMillisecondsSinceEpoch(0);
            final tb = DateTime.tryParse(b['capturedAt'] as String? ?? '') ??
                DateTime.fromMillisecondsSinceEpoch(0);
            return tb.compareTo(ta);
          });
          best = candidates.first;
        } else if (name.isNotEmpty) {
          // fallback: any community log for same product name
          for (final l in community) {
            if (l['marketId'] != market['id']) continue;
            final pid = l['productId'] as String?;
            Map<String, dynamic>? p;
            if (mode == 'memory') {
              p = _memProducts[pid];
            } else if (pid != null) {
              p = await _col('products').findOne(where.eq('id', pid));
            }
            final pname = (p?['name'] as String? ?? '').toLowerCase();
            if (pname == name || pname.contains(name) || name.contains(pname)) {
              best = l;
              break;
            }
          }
        }

        if (best == null) {
          missing.add(item['productName'] as String? ?? 'item');
          continue;
        }
        final unit = (best['retailPrice'] as num?)?.toDouble() ?? 0;
        total += unit * qty;
        covered += 1;
      }
      final coverage = items.isEmpty ? 0.0 : covered / items.length;
      if (covered == 0) continue;
      ranks.add({
        'marketId': market['id'],
        'marketName': market['name'],
        'total': total,
        'coveredItems': covered,
        'totalItems': items.length,
        'coverage': coverage,
        'missingNames': missing,
      });
    }

    ranks.sort((a, b) {
      final c = (b['coverage'] as num).compareTo(a['coverage'] as num);
      if (c != 0) return c;
      return (a['total'] as num).compareTo(b['total'] as num);
    });

    return {
      'markets': ranks.take(12).toList(),
      'coldStart': ranks.isEmpty ||
          ranks.every((r) => (r['coverage'] as num) < 0.34),
    };
  }

  Future<List<Map<String, dynamic>>> communityPrices({
    String? productName,
    String? city,
  }) async {
    final logs = mode == 'memory'
        ? _memLogs.values.toList()
        : await _col('price_logs').find().toList();
    final now = DateTime.now().toUtc();
    final out = <Map<String, dynamic>>[];
    for (final l in logs) {
      final trust = l['trustLevel'] as String? ?? 'suspect';
      var ok = trust == 'verified';
      if (!ok && l['source'] == 'nfce') {
        final t = DateTime.tryParse(l['capturedAt'] as String? ?? '');
        ok = t != null && now.difference(t).inDays <= 7;
      }
      if (!ok || trust == 'hidden') continue;
      if (productName != null && productName.isNotEmpty) {
        final pid = l['productId'] as String?;
        Map<String, dynamic>? p;
        if (mode == 'memory') {
          p = _memProducts[pid];
        } else if (pid != null) {
          p = await _col('products').findOne(where.eq('id', pid));
        }
        final pname = (p?['name'] as String? ?? '').toLowerCase();
        if (!pname.contains(productName.toLowerCase())) continue;
      }
      out.add({
        'priceLogId': l['id'],
        'productId': l['productId'],
        'marketId': l['marketId'],
        'retailPrice': l['retailPrice'],
        'trustLevel': trust,
        'capturedAt': l['capturedAt'],
        'city': city,
      });
    }
    out.sort((a, b) =>
        (a['retailPrice'] as num).compareTo(b['retailPrice'] as num));
    return out.take(40).toList();
  }

  Future<Map<String, dynamic>> castVote({
    required String userId,
    required String priceLogId,
    required String vote,
    required double weight,
    bool withPhoto = false,
  }) async {
    final log = await _findLog(priceLogId);
    if (log == null) return {'error': 'price log não encontrado', 'status': 404};

    final since = DateTime.now().toUtc().subtract(const Duration(hours: 24));
    final voteKey = '$userId|$priceLogId';
    if (mode == 'memory') {
      final existing = _memVotes[voteKey];
      if (existing != null) {
        final created =
            DateTime.tryParse(existing['createdAt'] as String? ?? '');
        if (created != null && created.isAfter(since)) {
          return {'error': 'já votou nas últimas 24h', 'status': 429};
        }
      }
    } else {
      final existing = await _col('price_votes').findOne(
        where.eq('voterId', userId).eq('priceLogId', priceLogId),
      );
      if (existing != null) {
        final created =
            DateTime.tryParse(existing['createdAt'] as String? ?? '');
        if (created != null && created.isAfter(since)) {
          return {'error': 'já votou nas últimas 24h', 'status': 429};
        }
      }
    }

    final now = DateTime.now().toUtc();
    var confirm = (log['confirmScore'] as num?)?.toDouble() ?? 0;
    var reject = (log['rejectScore'] as num?)?.toDouble() ?? 0;
    DateTime? lastConfirmed = log['lastConfirmedAt'] != null
        ? DateTime.tryParse(log['lastConfirmedAt'] as String)
        : null;

    if (vote == 'confirm') {
      confirm += weight;
      lastConfirmed = now;
    } else {
      reject += weight;
    }

    log['confirmScore'] = confirm;
    log['rejectScore'] = reject;
    log['lastConfirmedAt'] = lastConfirmed?.toIso8601String();
    log['trustLevel'] = _computeTrust(
      confirmScore: confirm,
      rejectScore: reject,
      lastConfirmedAt: lastConfirmed,
    );
    log['updatedAt'] = now.toIso8601String();
    await _saveLog(log);

    final voteDoc = {
      'id': const Uuid().v4(),
      'priceLogId': priceLogId,
      'voterId': userId,
      'vote': vote,
      'weight': weight,
      'createdAt': now.toIso8601String(),
    };
    if (mode == 'memory') {
      _memVotes[voteKey] = voteDoc;
    } else {
      await _col('price_votes').insertOne(voteDoc);
    }

    // Reputation + badges
    final pts = vote == 'confirm' ? 10 : (withPhoto ? 25 : 5);
    final rep = await getReputation(userId);
    rep['points'] = ((rep['points'] as num?)?.toInt() ?? 0) + pts;
    rep['validationsCount'] =
        ((rep['validationsCount'] as num?)?.toInt() ?? 0) + 1;
    final p = rep['points'] as int;
    rep['level'] = p >= 300 ? 'gold' : (p >= 100 ? 'silver' : 'bronze');
    final badges = List<String>.from(rep['badges'] as List? ?? []);
    if ((rep['validationsCount'] as int) >= 10 &&
        !badges.contains('comunidade_ativa')) {
      badges.add('comunidade_ativa');
    }
    if (p >= 100 && !badges.contains('fiscal_prata')) {
      badges.add('fiscal_prata');
    }
    if (p >= 300 && !badges.contains('fiscal_ouro')) {
      badges.add('fiscal_ouro');
    }
    rep['badges'] = badges;
    await _saveReputation(userId, rep);

    return {
      'ok': true,
      'trustLevel': log['trustLevel'],
      'confirmScore': confirm,
      'rejectScore': reject,
      'reputation': rep,
    };
  }

  Future<Map<String, dynamic>?> trustFor(String id) async {
    final log = await _findLog(id);
    if (log == null) return null;
    return {
      'priceLogId': id,
      'trustLevel': log['trustLevel'] ?? 'suspect',
      'confirmScore': log['confirmScore'] ?? 0,
      'rejectScore': log['rejectScore'] ?? 0,
      'lastConfirmedAt': log['lastConfirmedAt'],
    };
  }
}

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
  final emailUser = env['EMAIL_USER'] ?? '';
  final emailPass = env['EMAIL_PASS'] ?? '';
  final emailLogo = env['EMAIL_LOGO_URL'];

  router.get('/health', (Request req) {
    return Response.ok(jsonEncode({'ok': true, 'store': store.mode}));
  });

  router.post('/auth/register', (Request req) async {
    final body = jsonDecode(await req.readAsString()) as Map<String, dynamic>;
    final email = (body['email'] as String? ?? '').trim().toLowerCase();
    final password = body['password'] as String? ?? '';
    final displayName =
        (body['displayName'] as String? ?? 'Fiscal').trim();
    final uf = (body['uf'] as String?)?.trim();
    final city = (body['city'] as String?)?.trim();
    if (email.isEmpty || password.length < 6) {
      return _error(400, 'email/password inválidos');
    }
    if (await store.findUser(email) != null) {
      return _error(409, 'usuário já existe');
    }
    final code = _sixDigitCode();
    final user = await store.createUser(
      email: email,
      passwordHash: _hash(password),
      displayName: displayName.isEmpty ? 'Fiscal' : displayName,
      uf: uf,
      city: city,
      emailVerified: skipEmailVerification,
      verificationCodeHash: _hash(code),
    );
    if (!skipEmailVerification) {
      if (emailUser.isEmpty || emailPass.isEmpty) {
        return _error(500, 'EMAIL_USER/EMAIL_PASS não configurados');
      }
      try {
        await sendVerificationEmail(
          user: emailUser,
          pass: emailPass,
          to: email,
          code: code,
          logoUrl: emailLogo,
        );
      } catch (e) {
        return _error(500, 'falha ao enviar e-mail: $e');
      }
    }
    return Response.ok(
      jsonEncode({
        'ok': true,
        'userId': user['id'],
        'email': email,
        'needsVerification': !skipEmailVerification,
        if (skipEmailVerification) 'token': user['token'],
      }),
      headers: {'Content-Type': 'application/json'},
    );
  });

  router.post('/auth/verify', (Request req) async {
    final body = jsonDecode(await req.readAsString()) as Map<String, dynamic>;
    final email = (body['email'] as String? ?? '').trim().toLowerCase();
    final code = (body['code'] as String? ?? '').trim();
    final result = await store.verifyEmail(email: email, codeHash: _hash(code));
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
    final code = _sixDigitCode();
    final setResult = await store.setVerificationCode(email, _hash(code));
    if (setResult['error'] != null) {
      return _error(
        setResult['status'] as int? ?? 400,
        setResult['error'] as String,
      );
    }
    if (emailUser.isEmpty || emailPass.isEmpty) {
      return _error(500, 'EMAIL_USER/EMAIL_PASS não configurados');
    }
    try {
      await sendVerificationEmail(
        user: emailUser,
        pass: emailPass,
        to: email,
        code: code,
        logoUrl: emailLogo,
      );
    } catch (e) {
      return _error(500, 'falha ao enviar e-mail: $e');
    }
    return Response.ok(
      jsonEncode({'ok': true}),
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
    if (user['emailVerified'] != true && !skipEmailVerification) {
      return _error(403, 'e-mail não confirmado');
    }
    final token = await store.issueToken(user['id'] as String);
    return Response.ok(
      jsonEncode({
        'token': token,
        'userId': user['id'],
        'email': user['email'],
        'displayName': user['displayName'] ?? 'Fiscal',
        'emailVerified': user['emailVerified'] == true,
        'uf': user['uf'],
        'city': user['city'],
      }),
      headers: {'Content-Type': 'application/json'},
    );
  });

  router.get('/auth/me', (Request req) async {
    final userId = await _auth(req, store);
    if (userId == null) return _error(401, 'unauthorized');
    final user = await store.findUserById(userId);
    if (user == null) return _error(404, 'usuário não encontrado');
    return Response.ok(
      jsonEncode({
        'userId': user['id'],
        'email': user['email'],
        'displayName': user['displayName'] ?? 'Fiscal',
        'emailVerified': user['emailVerified'] == true,
        'uf': user['uf'],
        'city': user['city'],
      }),
      headers: {'Content-Type': 'application/json'},
    );
  });

  router.post('/sync/push', (Request req) async {
    final userId = await _auth(req, store);
    if (userId == null) return _error(401, 'unauthorized');
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
    final result = await store.pull(since);
    return Response.ok(
      jsonEncode(result),
      headers: {'Content-Type': 'application/json'},
    );
  });

  router.post('/votes/check', (Request req) async {
    final userId = await _auth(req, store);
    if (userId == null) return _error(401, 'unauthorized');
    final body = jsonDecode(await req.readAsString()) as Map<String, dynamic>;
    final priceLogId = body['priceLogId'] as String? ?? '';
    final vote = body['vote'] as String? ?? '';
    final weight = (body['weight'] as num?)?.toDouble() ?? 1.0;
    if (priceLogId.isEmpty || (vote != 'confirm' && vote != 'reject')) {
      return _error(400, 'priceLogId/vote inválidos');
    }
    final result = await store.castVote(
      userId: userId,
      priceLogId: priceLogId,
      vote: vote,
      weight: weight,
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
  final _memVotes = <String, Map<String, dynamic>>{};
  final _memReputation = <String, Map<String, dynamic>>{};
  final _memReviews = <String, Map<String, dynamic>>{};

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

  Future<Map<String, dynamic>?> findUser(String email) async {
    if (mode == 'memory') {
      return _memUsers.values.cast<Map<String, dynamic>?>().firstWhere(
            (u) => u?['email'] == email,
            orElse: () => null,
          );
    }
    return _col('users').findOne(where.eq('email', email));
  }

  Future<Map<String, dynamic>> createUser({
    required String email,
    required String passwordHash,
    required String displayName,
    String? uf,
    String? city,
    required bool emailVerified,
    required String verificationCodeHash,
  }) async {
    final id = const Uuid().v4();
    final token = const Uuid().v4();
    final now = DateTime.now().toUtc();
    final doc = {
      'id': id,
      'email': email,
      'passwordHash': passwordHash,
      'displayName': displayName,
      'uf': uf,
      'city': city,
      'emailVerified': emailVerified,
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

  Future<Map<String, dynamic>> verifyEmail({
    required String email,
    required String codeHash,
  }) async {
    final user = await findUser(email);
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
    user['emailVerified'] = true;
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
      'displayName': user['displayName'] ?? 'Fiscal',
      'emailVerified': true,
      'uf': user['uf'],
      'city': user['city'],
    };
  }

  Future<Map<String, dynamic>> setVerificationCode(
    String email,
    String codeHash,
  ) async {
    final user = await findUser(email);
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
    return {'ok': true};
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
        'name': 'Mercado Central',
        'uf': 'SP',
        'lat': -23.5505,
        'lng': -46.6333,
        'address': 'Centro, São Paulo',
        'priceLevel': 'fair',
        'updatedAt': now,
      },
      {
        'id': const Uuid().v4(),
        'name': 'Atacado Bom Preço',
        'uf': 'SP',
        'lat': -23.5614,
        'lng': -46.6559,
        'address': 'Pinheiros, São Paulo',
        'priceLevel': 'low',
        'updatedAt': now,
      },
      {
        'id': const Uuid().v4(),
        'name': 'Supermercado Premium',
        'uf': 'SP',
        'lat': -23.5489,
        'lng': -46.6388,
        'address': 'Consolação, São Paulo',
        'priceLevel': 'high',
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
          'source': l['source'],
          'capturedAt': l['capturedAt'],
          'nfceKey': l['nfceKey'],
          'confirmScore': l['confirmScore'] ?? 0,
          'rejectScore': l['rejectScore'] ?? 0,
          'trustLevel': l['trustLevel'] ?? 'suspect',
          'lastConfirmedAt': l['lastConfirmedAt'],
          'updatedAt': l['updatedAt'],
          'contributorId': l['contributorId'] ?? userId,
        },
        matchKeys: ['nfceKey'],
      );
      priceLogIdMap['${l['localId']}'] = remoteId;
    }

    return {
      'productIdMap': productIdMap,
      'marketIdMap': marketIdMap,
      'priceLogIdMap': priceLogIdMap,
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

  Future<Map<String, dynamic>> pull(DateTime since) async {
    if (mode == 'memory') {
      bool after(Map<String, dynamic> d) {
        final u = DateTime.tryParse(d['updatedAt'] as String? ?? '');
        return u != null && u.isAfter(since);
      }

      return {
        'products': _memProducts.values.where(after).toList(),
        'markets': _memMarkets.values.where(after).toList(),
        'priceLogs': _memLogs.values.where(after).toList(),
      };
    }

    final iso = since.toIso8601String();
    final products =
        await _col('products').find(where.gt('updatedAt', iso)).toList();
    final markets =
        await _col('markets').find(where.gt('updatedAt', iso)).toList();
    final logs =
        await _col('price_logs').find(where.gt('updatedAt', iso)).toList();
    return {
      'products': products,
      'markets': markets,
      'priceLogs': logs,
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

  Future<Map<String, dynamic>> castVote({
    required String userId,
    required String priceLogId,
    required String vote,
    required double weight,
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

    // Reputation
    final pts = vote == 'confirm' ? 10 : 5;
    Map<String, dynamic>? rep;
    if (mode == 'memory') {
      rep = _memReputation[userId] ??
          {
            'userId': userId,
            'points': 0,
            'level': 'bronze',
            'validationsCount': 0,
          };
      rep['points'] = (rep['points'] as int) + pts;
      rep['validationsCount'] = (rep['validationsCount'] as int) + 1;
      final p = rep['points'] as int;
      rep['level'] = p >= 300 ? 'gold' : (p >= 100 ? 'silver' : 'bronze');
      rep['updatedAt'] = now.toIso8601String();
      _memReputation[userId] = rep;
    } else {
      rep = await _col('user_reputation').findOne(where.eq('userId', userId));
      rep ??= {
        'userId': userId,
        'points': 0,
        'level': 'bronze',
        'validationsCount': 0,
      };
      rep['points'] = ((rep['points'] as num?)?.toInt() ?? 0) + pts;
      rep['validationsCount'] =
          ((rep['validationsCount'] as num?)?.toInt() ?? 0) + 1;
      final p = rep['points'] as int;
      rep['level'] = p >= 300 ? 'gold' : (p >= 100 ? 'silver' : 'bronze');
      rep['updatedAt'] = now.toIso8601String();
      await _col('user_reputation').replaceOne(
            where.eq('userId', userId),
            rep,
            upsert: true,
          );
    }

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

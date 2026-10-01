import 'dart:convert';

import 'package:http/http.dart' as http;

class SyncApiClient {
  SyncApiClient({required this.baseUrl, http.Client? client})
      : _client = client ?? http.Client();

  final String baseUrl;
  final http.Client _client;

  Uri _uri(String path, [Map<String, String>? query]) =>
      Uri.parse('$baseUrl$path').replace(queryParameters: query);

  Future<Map<String, dynamic>> register({
    required String email,
    required String password,
    required String displayName,
    String? uf,
    String? city,
  }) async {
    final res = await _client.post(
      _uri('/auth/register'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({
        'email': email,
        'password': password,
        'displayName': displayName,
        'uf': uf,
        'city': city,
      }),
    );
    return _decode(res);
  }

  Future<Map<String, dynamic>> verify({
    required String email,
    required String code,
  }) async {
    final res = await _client.post(
      _uri('/auth/verify'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'email': email, 'code': code}),
    );
    return _decode(res);
  }

  Future<Map<String, dynamic>> resendCode({required String email}) async {
    final res = await _client.post(
      _uri('/auth/resend-code'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'email': email}),
    );
    return _decode(res);
  }

  Future<Map<String, dynamic>> login({
    required String email,
    required String password,
  }) async {
    final res = await _client.post(
      _uri('/auth/login'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'email': email, 'password': password}),
    );
    return _decode(res);
  }

  Future<Map<String, dynamic>> me({required String token}) async {
    final res = await _client.get(
      _uri('/auth/me'),
      headers: {'Authorization': 'Bearer $token'},
    );
    return _decode(res);
  }

  Future<Map<String, dynamic>> pushBatch({
    required String token,
    required Map<String, dynamic> payload,
  }) async {
    final res = await _client.post(
      _uri('/sync/push'),
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer $token',
      },
      body: jsonEncode(payload),
    );
    return _decode(res);
  }

  Future<Map<String, dynamic>> pullSince({
    required String token,
    required DateTime since,
  }) async {
    final res = await _client.get(
      _uri('/sync/pull', {'since': since.toUtc().toIso8601String()}),
      headers: {'Authorization': 'Bearer $token'},
    );
    return _decode(res);
  }

  Future<Map<String, dynamic>> voteCheck({
    required String token,
    required String priceLogId,
    required String vote,
    double weight = 1.0,
  }) async {
    final res = await _client.post(
      _uri('/votes/check'),
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer $token',
      },
      body: jsonEncode({
        'priceLogId': priceLogId,
        'vote': vote,
        'weight': weight,
      }),
    );
    return _decode(res);
  }

  Future<List<Map<String, dynamic>>> marketsMap({String? token}) async {
    final res = await _client.get(
      _uri('/markets/map'),
      headers: {
        if (token != null) 'Authorization': 'Bearer $token',
      },
    );
    final body = _decode(res);
    final list = body['markets'] as List? ?? const [];
    return list.map((e) => Map<String, dynamic>.from(e as Map)).toList();
  }

  Future<Map<String, dynamic>> submitMarketReview({
    required String token,
    required String marketId,
    required int stars,
    String? comment,
  }) async {
    final res = await _client.post(
      _uri('/markets/$marketId/reviews'),
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer $token',
      },
      body: jsonEncode({'stars': stars, 'comment': comment}),
    );
    return _decode(res);
  }

  Future<List<Map<String, dynamic>>> marketReviews(String marketId) async {
    final res = await _client.get(_uri('/markets/$marketId/reviews'));
    final body = _decode(res);
    final list = body['reviews'] as List? ?? const [];
    return list.map((e) => Map<String, dynamic>.from(e as Map)).toList();
  }

  Future<bool> health() async {
    try {
      final res = await _client
          .get(_uri('/health'))
          .timeout(const Duration(seconds: 5));
      return res.statusCode == 200;
    } catch (_) {
      return false;
    }
  }

  Map<String, dynamic> _decode(http.Response res) {
    final body = res.body.isEmpty ? <String, dynamic>{} : jsonDecode(res.body);
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw SyncApiException(
        statusCode: res.statusCode,
        message:
            body is Map ? (body['error']?.toString() ?? res.body) : res.body,
      );
    }
    return Map<String, dynamic>.from(body as Map);
  }
}

class SyncApiException implements Exception {
  SyncApiException({required this.statusCode, required this.message});
  final int statusCode;
  final String message;
  @override
  String toString() => 'SyncApiException($statusCode): $message';
}

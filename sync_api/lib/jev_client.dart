import 'dart:convert';
import 'dart:io';

/// Cliente Jev (TypeSafe) — só server-side.
class JevClient {
  JevClient({required this.apiKey, this.model = 'jev-1.13.0'});

  final String apiKey;
  final String model;
  static const _endpoint = 'https://jevtypesafeai.com/api/v1/decide';

  bool get enabled => apiKey.isNotEmpty;

  /// Classifica contribuição de preço.
  /// Retorna action: accept | quarantine | reject
  Future<Map<String, dynamic>> classifyPrice({
    required String productName,
    required String marketName,
    required double retailPrice,
    required String source,
    double? regionalMedian,
    String? city,
  }) async {
    if (!enabled) {
      return {
        'action': 'quarantine',
        'plausible': 0.5,
        'risk': 1.0,
        'confidence': false,
      };
    }

    final state = {
      'productName': productName,
      'marketName': marketName,
      'retailPrice': retailPrice,
      'source': source,
      'regionalMedian': regionalMedian,
      'city': city,
      'currency': 'BRL',
    };

    final body = {
      'model': model,
      'state': state,
      'questions': {
        'plausible': {
          'type': 'noul',
          'instructions':
              'Is this shelf price plausible for this Brazilian supermarket product and region?',
        },
        'risk': {
          'type': 'score',
          'instructions':
              'How risky is this price contribution for data quality / fraud?',
          'criteria': [
            'routine, normal price',
            'slightly suspicious',
            'anomalous outlier',
            'likely fraud or manipulation',
          ],
        },
        'action': {
          'type': 'choice',
          'instructions':
              'How should the PegouPreco trust pipeline treat this contribution?',
          'criteria': {
            'accept': 'Accept into community pipeline (likely genuine)',
            'quarantine': 'Keep suspect for community validation',
            'reject': 'Hide as fraud or severe anomaly',
          },
        },
      },
    };

    try {
      final client = HttpClient();
      final req = await client.postUrl(Uri.parse(_endpoint));
      req.headers.set(HttpHeaders.authorizationHeader, 'Bearer $apiKey');
      req.headers.set(HttpHeaders.contentTypeHeader, 'application/json');
      req.add(utf8.encode(jsonEncode(body)));
      final res = await req.close();
      final raw = await res.transform(utf8.decoder).join();
      client.close(force: true);
      if (res.statusCode < 200 || res.statusCode >= 300) {
        stdout.writeln('Jev HTTP ${res.statusCode}: $raw');
        return {
          'action': 'quarantine',
          'plausible': 0.5,
          'risk': 1.0,
          'fallback': true,
        };
      }
      final data = jsonDecode(raw) as Map<String, dynamic>;
      final answers = data['answers'] as Map<String, dynamic>? ?? {};
      final plausible =
          (answers['plausible'] as Map?)?['noul'] as num? ?? 0.5;
      final risk = (answers['risk'] as Map?)?['score'] as num? ?? 1.0;
      final action =
          (answers['action'] as Map?)?['choice'] as String? ?? 'quarantine';
      final confidence =
          (answers['action'] as Map?)?['confidence'] as num? ?? 0.0;
      return {
        'action': action,
        'plausible': plausible.toDouble(),
        'risk': risk.toDouble(),
        'confidence': confidence.toDouble(),
        'fallback': false,
      };
    } catch (e) {
      stdout.writeln('Jev error: $e');
      return {
        'action': 'quarantine',
        'plausible': 0.5,
        'risk': 1.0,
        'fallback': true,
      };
    }
  }
}

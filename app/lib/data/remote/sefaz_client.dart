import 'package:http/http.dart' as http;
import 'package:pegou_preco/features/vision/parsers/nfce_html_parser.dart';

class SefazFetchException implements Exception {
  SefazFetchException(this.message);
  final String message;
  @override
  String toString() => message;
}

class SefazClient {
  SefazClient({http.Client? client}) : _client = client ?? http.Client();

  final http.Client _client;

  static bool looksLikeNfceUrl(String raw) {
    final u = raw.trim().toLowerCase();
    if (!(u.startsWith('http://') || u.startsWith('https://'))) return false;
    return u.contains('nfce') ||
        u.contains('fazenda') ||
        u.contains('sefaz') ||
        RegExp(r'\d{44}').hasMatch(u);
  }

  static String? extractNfceKey(String url) {
    final decoded = Uri.decodeFull(url).replaceAll('%7C', '|');
    return RegExp(r'(\d{44})').firstMatch(decoded)?.group(1);
  }

  Future<NfceParseResult> fetchAndParse(String qrUrl) async {
    final uri = Uri.parse(qrUrl);
    final response = await _client.get(
      uri,
      headers: {
        'User-Agent':
            'Mozilla/5.0 (compatible; PegouPreco/1.0; +https://local)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    ).timeout(const Duration(seconds: 25));

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw SefazFetchException(
        'SEFAZ HTTP ${response.statusCode}',
      );
    }

    final body = response.body;
    if (body.toLowerCase().contains('captcha') &&
        body.length < 5000 &&
        !body.contains('<table')) {
      throw SefazFetchException(
        'Portal SEFAZ exigiu CAPTCHA. Tente novamente ou use OCR de etiqueta.',
      );
    }

    final result = NfceHtmlParser.parse(body, sourceUrl: qrUrl);
    if (result.items.isEmpty) {
      throw SefazFetchException(
        'Nenhum item encontrado no HTML da NFC-e (layout não suportado ou CAPTCHA).',
      );
    }
    return result;
  }
}

/// Reexport útil para a UI de review.
typedef ParsedNfce = NfceParseResult;

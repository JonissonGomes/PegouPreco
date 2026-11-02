import {guessCategory} from '@/domain/productCategory';

export type CatalogProduct = {
  ean: string;
  name: string;
  brand?: string | null;
  category?: string | null;
  source: 'openfoodfacts' | 'brasilapi' | 'cache';
};

// Cache em memória para buscas rápidas durante a sessão
const memoryCache = new Map<string, CatalogProduct | null>();

/**
 * Consulta informações de um produto pelo código de barras GTIN/EAN usando
 * catálogos públicos abertos (Open Food Facts e BrasilAPI) com timeout seguro.
 */
export async function lookupEanCatalog(
  ean: string,
  timeoutMs = 3000,
): Promise<CatalogProduct | null> {
  const cleanEan = ean.replace(/\D/g, '');
  if (cleanEan.length < 8 || cleanEan.length > 14) return null;

  if (memoryCache.has(cleanEan)) {
    return memoryCache.get(cleanEan) ?? null;
  }

  // 1. Tentar Open Food Facts (especializado em supermercado/alimentos)
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    const offUrl = `https://world.openfoodfacts.org/api/v2/product/${cleanEan}.json?fields=product_name,product_name_pt,brands,categories_tags`;
    const res = await fetch(offUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'PegouPrecoMobileApp/1.0 (pegoupreco.app@gmail.com)',
      },
    });
    clearTimeout(timeout);

    if (res.ok) {
      const data = await res.json();
      if (data?.status === 1 && data?.product) {
        const prod = data.product;
        const rawName: string | undefined =
          prod.product_name_pt || prod.product_name;
        if (rawName && rawName.trim().length >= 3) {
          const brand = prod.brands?.split(',')[0]?.trim() || null;
          let fullName = rawName.trim();
          if (brand && !fullName.toLowerCase().includes(brand.toLowerCase())) {
            fullName = `${fullName} ${brand}`;
          }
          const category = guessCategory(fullName);
          const result: CatalogProduct = {
            ean: cleanEan,
            name: fullName,
            brand,
            category,
            source: 'openfoodfacts',
          };
          memoryCache.set(cleanEan, result);
          return result;
        }
      }
    }
  } catch {
    // Timeout ou erro de rede no Open Food Facts -> continua para o próximo
  }

  // 2. Tentar BrasilAPI (ótimo para produtos nacionais diversos)
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    const res = await fetch(
      `https://brasilapi.com.br/api/ean/v1/${cleanEan}`,
      {signal: controller.signal},
    );
    clearTimeout(timeout);

    if (res.ok) {
      const data = await res.json();
      const desc: string | undefined = data?.description;
      if (desc && desc.trim().length >= 3) {
        const fullName = desc.trim();
        const category = guessCategory(fullName);
        const result: CatalogProduct = {
          ean: cleanEan,
          name: fullName,
          brand: null,
          category,
          source: 'brasilapi',
        };
        memoryCache.set(cleanEan, result);
        return result;
      }
    }
  } catch {
    // Fallback silencioso
  }

  // Não encontrado nos catálogos abertos
  memoryCache.set(cleanEan, null);
  return null;
}

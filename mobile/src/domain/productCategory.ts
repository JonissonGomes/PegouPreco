import {CATEGORY_RULES} from './productCategoryRules';

export const PRODUCT_CATEGORIES = [
  'Grãos',
  'Farinhas e açúcar',
  'Massas',
  'Óleos e azeites',
  'Molhos e temperos',
  'Enlatados',
  'Café e matinais',
  'Biscoitos e doces',
  'Salgadinhos',
  'Laticínios',
  'Frios',
  'Congelados',
  'Açougue',
  'Peixaria',
  'Frutas',
  'Verduras',
  'Refrigerantes',
  'Águas e sucos',
  'Cervejas',
  'Destilados',
  'Bebidas',
  'Padaria',
  'Mercearia',
  'Limpeza',
  'Higiene',
  'Bebê',
  'Pet',
  'Descartáveis',
  'Outros',
] as const;

function fold(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasPhrase(folded: string, phrase: string): boolean {
  const padded = ` ${folded} `;
  return padded.includes(` ${phrase} `);
}

export function guessCategory(name: string): string {
  const folded = fold(name);
  if (!folded) return 'Outros';
  const words = new Set(folded.split(' '));
  const tokens = folded.split(' ');
  for (const rule of CATEGORY_RULES) {
    if (rule.phrases?.some(phrase => hasPhrase(folded, phrase))) return rule.category;
    if (rule.words?.some(word => words.has(word))) return rule.category;
    if (rule.prefixes?.some(prefix => tokens.some(token => token.startsWith(prefix)))) {
      return rule.category;
    }
  }
  return 'Outros';
}

/**
 * A regra do nome vence quando reconhece o item.
 * A categoria gravada (inclusive a do JEV) fica para o que continuar em Outros.
 */
export function resolveCategory(
  stored: string | null | undefined,
  name: string,
): string {
  const guessed = guessCategory(name);
  if (guessed !== 'Outros') return guessed;
  const trimmed = stored?.trim() ?? '';
  if (!trimmed || trimmed === 'Outros' || trimmed === 'Hortifruti') return 'Outros';
  return trimmed;
}

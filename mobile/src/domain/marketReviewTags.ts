export const POSITIVE_REVIEW_TAGS = [
  'Preço bom',
  'Econômico',
  'Boa variedade',
  'Menos filas',
  'Bom atendimento',
  'Fácil acesso',
] as const;

export const NEGATIVE_REVIEW_TAGS = [
  'Preços altos',
  'Muita fila',
  'Difícil acesso',
  'Pouca variedade',
  'Atendimento ruim',
  'Produtos faltando',
] as const;

export function reviewTagsForStars(stars: number): {
  positive: readonly string[];
  negative: readonly string[];
} {
  if (stars >= 4) return {positive: POSITIVE_REVIEW_TAGS, negative: []};
  if (stars > 0 && stars <= 2) return {positive: [], negative: NEGATIVE_REVIEW_TAGS};
  if (stars === 3) {
    return {positive: POSITIVE_REVIEW_TAGS, negative: NEGATIVE_REVIEW_TAGS};
  }
  return {positive: [], negative: []};
}

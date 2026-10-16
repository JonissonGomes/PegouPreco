export const PRODUCT_CATEGORIES = [
  'Bebidas',
  'Mercearia',
  'Laticínios',
  'Açougue',
  'Peixaria',
  'Frios',
  'Hortifruti',
  'Padaria',
  'Congelados',
  'Biscoitos e doces',
  'Café e matinais',
  'Molhos e temperos',
  'Enlatados',
  'Limpeza',
  'Higiene',
  'Bebê',
  'Pet',
  'Descartáveis',
  'Outros',
] as const;

const RULES: Array<[RegExp, string]> = [
  [/água sanit|agua sanit|deterg|amaciant|desinfet|alvejante|multiuso|esponja|lustra|desinf/i, 'Limpeza'],
  [/shampoo|condicion|papel hig|sabonete|creme dental|pasta de dente|desodor|absorvent|enxaguant|lenço umed|lenco umed/i, 'Higiene'],
  [/fralda|leite em pó|leite em po|fórmula infantil|formula infantil|papinha|lenço infantil|lenco infantil/i, 'Bebê'],
  [/ração|racao|\bpet\b|areia sanit|antipulga/i, 'Pet'],
  [/papel toalha|guardanapo|filme pvc|papel alum|saco de lixo|copo descart/i, 'Descartáveis'],
  [/pão|pao|croissant|sonho\b|baguete|bolo\b|torta\b|rosca/i, 'Padaria'],
  [/pizza|lasanh|sorvete|nugget|hambúrguer congel|hamburguer congel|congelad/i, 'Congelados'],
  [/presunto|mortadela|salame|peito de peru|queijo prato|apresuntado/i, 'Frios'],
  [/peixe|camarão|camarao|tilápia|tilapia|salmão|salmao|bacalhau|atum fresco/i, 'Peixaria'],
  [/carne|frango|linguiç|linguic|bovin|picanha|costela|bacon|suín|suin|alcatra/i, 'Açougue'],
  [/banana|maçã|maca|tomate|cebola|batata|alface|limão|limao|hort|laranja|mamão|mamao|cenoura|abobrinha|couve|morango/i, 'Hortifruti'],
  [/leite|queijo|iogur|manteiga|requeij|nata\b|coalhada|bebida láctea|bebida lactea/i, 'Laticínios'],
  [/café|cafe|achocolat|cereal|aveia|cappuccino|capuccino/i, 'Café e matinais'],
  [/biscoito|bolacha|chocolate|cookie|bala\b|wafer|bombom|paçoca|pacoca|doce de leite/i, 'Biscoitos e doces'],
  [/ketchup|maionese|mostarda|molho|tempero|extrato de tomate|shoyu|vinagre/i, 'Molhos e temperos'],
  [/sardinha|atum enlat|milho enlat|ervilha|seleta|milho verde/i, 'Enlatados'],
  [/cerveja|refrigerante|suco|vinho|vodka|whisky|energético|energetico|isotônico|isotonico|água de coco|agua de coco|\bágua\b|\bagua\b|\bchá\b|\bcha\b/i, 'Bebidas'],
  [/arroz|feij|macarr|farinha|açúcar|acucar|óleo|oleo|\bsal\b|azeite|macarrão|macarrao/i, 'Mercearia'],
];

export function guessCategory(name: string): string {
  for (const [re, category] of RULES) {
    if (re.test(name)) return category;
  }
  return 'Outros';
}

/** Categoria gravada vale, exceto “Outros”, que volta a ser inferida pelo nome. */
export function resolveCategory(
  stored: string | null | undefined,
  name: string,
): string {
  const trimmed = stored?.trim() ?? '';
  if (!trimmed || trimmed === 'Outros') return guessCategory(name);
  return trimmed;
}

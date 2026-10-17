export const PRODUCT_CATEGORIES = [
  'Bebidas',
  'Mercearia',
  'Laticínios',
  'Açougue',
  'Peixaria',
  'Frios',
  'Frutas',
  'Verduras',
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
  [/banana|maçã|\bmaca\b|laranja|mamão|mamao|morango|uva|melancia|abacaxi|limão|limao|manga|\bpera\b|kiwi|melão|melao|goiaba|abacate|fruta/i, 'Frutas'],
  [/tomate|cebola|batata|alface|cenoura|abobrinha|couve|alho|piment|brócolis|brocolis|repolho|pepino|beterraba|chuchu|mandioca|inhame|vagem|espinafre|verdura|legume/i, 'Verduras'],
  [/leite|queijo|iogur|manteiga|requeij|nata\b|coalhada|bebida láctea|bebida lactea/i, 'Laticínios'],
  [/café|cafe|achocolat|cereal|aveia|cappuccino|capuccino/i, 'Café e matinais'],
  [/biscoito|bolacha|chocolate|cookie|bala\b|wafer|bombom|paçoca|pacoca|doce de leite/i, 'Biscoitos e doces'],
  [/ketchup|maionese|mostarda|molho|tempero|extrato de tomate|shoyu|vinagre/i, 'Molhos e temperos'],
  [/sardinha|atum enlat|milho enlat|ervilha|seleta|milho verde/i, 'Enlatados'],
  [/cerveja|\bcerv\b|refrigerante|\brefri\b|suco|vinho|vodka|whisky|\benerg\b|energy|energético|energetico|\bbeb\b|\bh2o\b|\bh20\b|gatorade|powerade|isotônico|isotonico|água de coco|agua de coco|\bágua\b|\bagua\b|\bchá\b|\bcha\b/i, 'Bebidas'],
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
  if (!trimmed || trimmed === 'Outros' || trimmed === 'Hortifruti') {
    return guessCategory(name);
  }
  return trimmed;
}

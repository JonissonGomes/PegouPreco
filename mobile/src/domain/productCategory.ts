const RULES: Array<[RegExp, string]> = [
  [/cerveja|refrigerante|suco|água|agua|vinho|vodka|whisky/i, 'Bebidas'],
  [/arroz|feij|macarr|farinha|açúcar|acucar|óleo|oleo|\bsal\b/i, 'Mercearia'],
  [/leite|queijo|iogur|manteiga|requeij/i, 'Laticínios'],
  [/carne|frango|peixe|linguiç|linguic|bovin/i, 'Açougue'],
  [/banana|maçã|maca|tomate|cebola|batata|alface|limão|limao|hort/i, 'Hortifruti'],
  [/sabão|sabao|deterg|amaciant|desinfet|água sanit/i, 'Limpeza'],
  [/shampoo|condicion|papel hig|fralda|sabonete|creme dental/i, 'Higiene'],
  [/biscoito|bolacha|chocolate|cookie|bala\b/i, 'Biscoitos e doces'],
];

export function guessCategory(name: string): string {
  for (const [re, category] of RULES) {
    if (re.test(name)) return category;
  }
  return 'Outros';
}

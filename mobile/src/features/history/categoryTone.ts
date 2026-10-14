const TONES: Record<string, {bg: string; fg: string}> = {
  Bebidas: {bg: '#E0F7FF', fg: '#0369A1'},
  Mercearia: {bg: '#FFF6D8', fg: '#92400E'},
  Laticínios: {bg: '#E0E7FF', fg: '#3730A3'},
  Açougue: {bg: '#FEE2E2', fg: '#B91C1C'},
  Hortifruti: {bg: '#DCFCE7', fg: '#15803D'},
  Limpeza: {bg: '#CCFBF1', fg: '#0F766E'},
  Higiene: {bg: '#F3E8FF', fg: '#7E22CE'},
  'Biscoitos e doces': {bg: '#FFEDD5', fg: '#C2410C'},
  Outros: {bg: '#F3F4F6', fg: '#4B5563'},
};

export function categoryTone(name: string): {bg: string; fg: string} {
  return TONES[name] ?? TONES.Outros;
}

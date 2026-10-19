import {colors} from '@/ui/theme';

const TONES: Record<string, {bg: string; fg: string}> = {
  Bebidas: {bg: '#D4F6FF', fg: '#0369A1'},
  Mercearia: {bg: '#FFF4C2', fg: colors.navy},
  Laticínios: {bg: '#E4ECFA', fg: colors.navy},
  Açougue: {bg: '#FEE2E2', fg: '#B91C1C'},
  Frutas: {bg: '#DCFCE7', fg: '#15803D'},
  Verduras: {bg: '#D1FAE5', fg: '#047857'},
  Peixaria: {bg: '#E0F2FE', fg: '#075985'},
  Frios: {bg: '#FDE68A', fg: '#92400E'},
  Hortifruti: {bg: '#DCFCE7', fg: '#15803D'},
  Padaria: {bg: '#FFEDD5', fg: '#C2410C'},
  Congelados: {bg: '#E0F2FE', fg: colors.navy},
  'Biscoitos e doces': {bg: '#FEF3C7', fg: '#92400E'},
  Salgadinhos: {bg: '#FEF9C3', fg: '#A16207'},
  'Café e matinais': {bg: '#F5E6D3', fg: '#7C2D12'},
  'Molhos e temperos': {bg: '#FFEDD5', fg: '#9A3412'},
  Enlatados: {bg: '#E5E7EB', fg: colors.navy},
  Limpeza: {bg: '#CCFBF1', fg: '#0F766E'},
  Higiene: {bg: '#EDE9FE', fg: '#5B21B6'},
  Bebê: {bg: '#FCE7F3', fg: '#9D174D'},
  Pet: {bg: '#FFEDD5', fg: '#9A3412'},
  Descartáveis: {bg: '#F3F4F6', fg: '#374151'},
  Outros: {bg: '#F3F4F6', fg: '#4B5563'},
};

export function categoryTone(name: string): {bg: string; fg: string} {
  return TONES[name] ?? TONES.Outros;
}

/** Cor cheia do gráfico. Uma por categoria, afastadas no círculo de matiz. */
const SLICE: Record<string, string> = {
  Bebidas: '#0284C7',
  Mercearia: '#CA8A04',
  Laticínios: '#2563EB',
  Açougue: '#DC2626',
  Frutas: '#16A34A',
  Verduras: '#059669',
  Peixaria: '#0891B2',
  Frios: '#D97706',
  Hortifruti: '#65A30D',
  Padaria: '#EA580C',
  Congelados: '#4F46E5',
  'Café e matinais': '#78350F',
  'Molhos e temperos': '#B45309',
  Enlatados: '#475569',
  Limpeza: '#0F766E',
  Higiene: '#7C3AED',
  'Biscoitos e doces': '#DB2777',
  Salgadinhos: '#EAB308',
  Bebê: '#E11D48',
  Pet: '#9A3412',
  Descartáveis: '#6B7280',
  Outros: '#94A3B8',
};

export function categorySliceColor(name: string): string {
  return SLICE[name] ?? SLICE.Outros;
}

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

/** Pastel do gráfico. Uma cor clara por categoria, ainda distinguível. */
const SLICE: Record<string, string> = {
  Bebidas: '#BAE6FD',
  Mercearia: '#FDE68A',
  Laticínios: '#BFDBFE',
  Açougue: '#FECACA',
  Frutas: '#BBF7D0',
  Verduras: '#A7F3D0',
  Peixaria: '#A5F3FC',
  Frios: '#F5D0FE',
  Hortifruti: '#D9F99D',
  Padaria: '#FED7AA',
  Congelados: '#C7D2FE',
  'Café e matinais': '#E7D5C4',
  'Molhos e temperos': '#FDBA74',
  Enlatados: '#E2E8F0',
  Limpeza: '#99F6E4',
  Higiene: '#DDD6FE',
  'Biscoitos e doces': '#FBCFE8',
  Salgadinhos: '#FEF08A',
  Bebê: '#FECDD3',
  Pet: '#FFEDD5',
  Descartáveis: '#CBD5E1',
  Outros: '#E5E7EB',
};

export function categorySliceColor(name: string): string {
  return SLICE[name] ?? SLICE.Outros;
}

/** Do mais quente (maior gasto) ao mais frio. Tons médios, nem pastel nem neon. */
const HEAT = ['#E11D48', '#EA580C', '#D97706', '#65A30D', '#0D9488', '#0284C7', '#1D4ED8'];

export function heatColor(rank: number, count: number): string {
  if (count <= 1) return HEAT[0];
  const pos = (Math.max(0, rank) / (count - 1)) * (HEAT.length - 1);
  return HEAT[Math.round(pos)] ?? HEAT[HEAT.length - 1];
}

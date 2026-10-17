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

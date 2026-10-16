import {colors} from '@/ui/theme';

/** Tons do dashboard, derivados do amarelo, azul-marinho e ciano do app. */
export const palette = {
  yellow: colors.yellow,
  yellowSoft: '#FFF4C2',
  navy: colors.navy,
  navySoft: '#E4ECFA',
  cyan: colors.cyan,
  cyanSoft: '#D4F6FF',
  green: colors.trustGreen,
  greenSoft: '#DCFCE7',
  ink: colors.navy,
};

export const paletteCycle = [
  colors.navy,
  colors.yellow,
  colors.cyan,
  colors.trustGreen,
  '#3D6BB3',
];

export function paletteAt(index: number): string {
  return paletteCycle[index % paletteCycle.length];
}

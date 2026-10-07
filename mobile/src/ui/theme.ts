export const colors = {
  yellow: '#FFD400',
  yellowBright: '#FFD400',
  navy: '#0B2A6B',
  cyan: '#00C2FF',
  muted: '#6B7280',
  ink: '#111827',
  border: '#E5E7EB',
  bg: '#F3F4F6',
  trustGreen: '#16A34A',
  trustYellow: '#CA8A04',
  danger: '#EF4444',
  white: '#FFFFFF',
  verified: '#16A34A',
  suspect: '#CA8A04',
  hidden: '#9CA3AF',
};

/** Escala de espaçamento (4pt). */
export const space = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
} as const;

export const radii = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  pill: 999,
} as const;

export const typography = {
  title: {fontSize: 22, fontWeight: '800' as const, letterSpacing: -0.3},
  titleLg: {fontSize: 26, fontWeight: '800' as const, letterSpacing: -0.4},
  body: {fontSize: 15, fontWeight: '600' as const},
  caption: {fontSize: 12, fontWeight: '700' as const},
  label: {fontSize: 11, fontWeight: '800' as const, letterSpacing: 0.4},
};

export const spacing = {
  page: space.md,
  cardRadius: radii.md,
  controlRadius: radii.md,
  bottomBarHeight: 72,
  bottomNavClearance: 96,
};

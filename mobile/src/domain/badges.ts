import type {FiscalLevel} from '@/data/types';
import {TrustEngine} from '@/domain/trust';

export type BadgeId =
  | 'primeira_nfce'
  | 'primeira_captura'
  | 'validador_semana'
  | 'lista_completa'
  | 'fiscal_prata'
  | 'fiscal_ouro'
  | 'comunidade_ativa';

export type BadgeDef = {
  id: BadgeId;
  title: string;
  description: string;
};

export const BADGE_CATALOG: BadgeDef[] = [
  {
    id: 'primeira_captura',
    title: 'Olho de águia',
    description: 'Capturou a primeira etiqueta',
  },
  {
    id: 'primeira_nfce',
    title: 'Nota fiscal',
    description: 'Importou a primeira NFC-e',
  },
  {
    id: 'validador_semana',
    title: 'Validador da semana',
    description: 'Confirmou 5 preços em 7 dias',
  },
  {
    id: 'lista_completa',
    title: 'Lista fechada',
    description: 'Finalizou uma lista de compras',
  },
  {
    id: 'fiscal_prata',
    title: 'Fiscal Prata',
    description: 'Alcançou 100 pontos',
  },
  {
    id: 'fiscal_ouro',
    title: 'Fiscal Ouro',
    description: 'Alcançou 300 pontos',
  },
  {
    id: 'comunidade_ativa',
    title: 'Comunidade ativa',
    description: 'Fez 10 validações',
  },
];

export function badgeById(id: string): BadgeDef | undefined {
  return BADGE_CATALOG.find(b => b.id === id);
}

export function deriveBadges(args: {
  points: number;
  validationsCount: number;
  hasNfce: boolean;
  hasCapture: boolean;
  hasFinishedList: boolean;
  weeklyValidations?: number;
}): BadgeId[] {
  const out: BadgeId[] = [];
  if (args.hasCapture) out.push('primeira_captura');
  if (args.hasNfce) out.push('primeira_nfce');
  if (args.hasFinishedList) out.push('lista_completa');
  if ((args.weeklyValidations ?? 0) >= 5) out.push('validador_semana');
  if (args.validationsCount >= 10) out.push('comunidade_ativa');
  const level = TrustEngine.levelForPoints(args.points);
  if (level === 'silver' || level === 'gold') out.push('fiscal_prata');
  if (level === 'gold') out.push('fiscal_ouro');
  return out;
}

export function mergeBadges(current: string[], earned: BadgeId[]): string[] {
  const set = new Set([...current, ...earned]);
  return [...set];
}

export function fiscalFromPoints(points: number): FiscalLevel {
  return TrustEngine.levelForPoints(points);
}

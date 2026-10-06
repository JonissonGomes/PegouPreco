export type FiscalLevel = 'bronze' | 'silver' | 'gold';
export type TrustLevel = 'verified' | 'suspect' | 'hidden';
export type VoteType = 'confirm' | 'reject';

export const TrustEngine = {
  weightFor(level: FiscalLevel): number {
    if (level === 'gold') return 2;
    if (level === 'silver') return 1.5;
    return 1;
  },
  levelForPoints(points: number): FiscalLevel {
    if (points >= 300) return 'gold';
    if (points >= 100) return 'silver';
    return 'bronze';
  },
  fiscalLabel(level: FiscalLevel): string {
    if (level === 'gold') return 'Ouro';
    if (level === 'silver') return 'Prata';
    return 'Bronze';
  },
  compute(args: {
    confirmScore: number;
    rejectScore: number;
    lastConfirmedAt?: string | null;
    now?: Date;
  }): TrustLevel {
    const n = args.now ?? new Date();
    if (args.rejectScore >= 3 && args.rejectScore > args.confirmScore) {
      return 'hidden';
    }
    if (args.lastConfirmedAt) {
      const last = new Date(args.lastConfirmedAt);
      const days = (n.getTime() - last.getTime()) / 86400000;
      if (days <= 3 && args.confirmScore >= 3) return 'verified';
    }
    return 'suspect';
  },
  trustKey(level: TrustLevel): string {
    return level;
  },
  pointsForVote(vote: VoteType, withPhoto: boolean): number {
    if (vote === 'confirm') return 10;
    return withPhoto ? 25 : 5;
  },
};

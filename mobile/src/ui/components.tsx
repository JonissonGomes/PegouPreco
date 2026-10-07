import React from 'react';
import {Pressable, StyleSheet, Text, View, type ViewStyle} from 'react-native';
import {ShieldCheck, Star} from 'lucide-react-native';
import {colors, radii, space, typography} from './theme';
import type {FiscalLevel, TrustLevel} from '@/data/types';
import {TrustEngine} from '@/domain/trust';
import {formatBrl} from '@/domain/money';
import type {MarketBasketRank} from '@/domain/compare';

export {
  StarPicker,
  ScoreMeter,
  VoteButtons,
  XpBurst,
  MissionHero,
} from './gamification';

export function Screen({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
}) {
  return <View style={[styles.screen, style]}>{children}</View>;
}

export function SectionHeader({
  title,
  actionLabel,
  onAction,
}: {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.sectionRow}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {actionLabel && onAction ? (
        <Pressable onPress={onAction} hitSlop={8}>
          <Text style={styles.sectionAction}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function EmptyState({
  title,
  message,
  actionLabel,
  onAction,
}: {
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyMsg}>{message}</Text>
      {actionLabel && onAction ? (
        <Pressable style={styles.emptyBtn} onPress={onAction}>
          <Text style={styles.emptyBtnText}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function PriceTrustBadge({level}: {level: TrustLevel}) {
  const tone =
    level === 'verified'
      ? styles.trustVerified
      : level === 'hidden'
        ? styles.trustHidden
        : styles.trustSuspect;
  const label =
    level === 'verified'
      ? 'Verificado'
      : level === 'hidden'
        ? 'Oculto'
        : 'Em análise';
  return (
    <View style={[styles.trustBadge, tone]}>
      <ShieldCheck size={12} color={colors.navy} />
      <Text style={styles.trustText}>{label}</Text>
    </View>
  );
}

export function FiscalBadge({
  level,
  points,
}: {
  level: FiscalLevel;
  points?: number;
}) {
  return (
    <View style={styles.fiscalBadge}>
      <Text style={styles.fiscalText}>
        Fiscal {TrustEngine.fiscalLabel(level)}
        {points != null ? ` · ${points} pts` : ''}
      </Text>
    </View>
  );
}

export function MarketRankRow({
  rank,
  place,
  onPress,
  highlight,
  bestTotal,
}: {
  rank: MarketBasketRank;
  place: number;
  onPress?: () => void;
  highlight?: boolean;
  /** Total do 1º lugar — exibe "+ R$ X que o melhor" nos demais. */
  bestTotal?: number;
}) {
  const delta =
    bestTotal != null && place > 1 && rank.total > bestTotal
      ? rank.total - bestTotal
      : 0;
  return (
    <Pressable
      onPress={onPress}
      style={[styles.rankRow, highlight && styles.rankHi]}>
      <View style={styles.rankRowInner}>
        <Text style={styles.rankLine} numberOfLines={1}>
          <Text style={styles.rankNum}>{place}</Text>
          <Text style={styles.rankDot}> · </Text>
          <Text style={styles.rankNameInline}>{rank.marketName}</Text>
        </Text>
        <Text style={styles.rankTotal}>
          {rank.coveredItems > 0 ? formatBrl(rank.total) : '—'}
        </Text>
      </View>
      {highlight ? <View style={styles.rankYellowBar} /> : null}
      {!highlight && delta > 0 ? (
        <Text style={styles.rankDelta}>
          + {formatBrl(delta)} que o melhor
        </Text>
      ) : null}
    </Pressable>
  );
}

export function StarsRow({stars, size = 14}: {stars: number; size?: number}) {
  return (
    <View style={{flexDirection: 'row', gap: 2}}>
      {[1, 2, 3, 4, 5].map(i => (
        <Star
          key={i}
          size={size}
          color={colors.yellowBright}
          fill={i <= stars ? colors.yellowBright : 'transparent'}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: colors.bg},
  sectionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: space.md,
    paddingTop: space.md,
    paddingBottom: space.xs,
  },
  sectionTitle: {...typography.title, fontSize: 18, color: colors.ink},
  sectionAction: {
    ...typography.caption,
    color: colors.navy,
    fontWeight: '800',
  },
  empty: {
    padding: space.xl,
    gap: space.sm,
    alignItems: 'flex-start',
  },
  emptyTitle: {...typography.title, color: colors.navy},
  emptyMsg: {color: colors.muted, fontWeight: '600', lineHeight: 20},
  emptyBtn: {
    marginTop: space.xs,
    backgroundColor: colors.navy,
    borderRadius: radii.lg,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  emptyBtnText: {color: '#fff', fontWeight: '800'},
  trustBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radii.pill,
  },
  trustVerified: {backgroundColor: '#DCFCE7'},
  trustSuspect: {backgroundColor: '#FEF9C3'},
  trustHidden: {backgroundColor: '#F3F4F6'},
  trustText: {fontSize: 10, fontWeight: '800', color: colors.navy},
  fiscalBadge: {
    backgroundColor: colors.yellowBright,
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
    alignSelf: 'flex-start',
  },
  fiscalText: {fontWeight: '800', color: colors.navy, fontSize: 12},
  rankRow: {
    backgroundColor: '#fff',
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    marginBottom: space.sm,
    gap: 6,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: {width: 0, height: 1},
    elevation: 1,
  },
  rankHi: {borderColor: colors.yellow, borderWidth: 2},
  rankRowInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
  },
  rankLine: {flex: 1, minWidth: 0},
  rankNum: {fontWeight: '900', color: colors.navy, fontSize: 15},
  rankDot: {fontWeight: '700', color: colors.muted},
  rankNameInline: {fontWeight: '800', color: colors.navy, fontSize: 15},
  rankTotal: {fontWeight: '900', color: colors.navy, fontSize: 15},
  rankYellowBar: {
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.yellow,
    width: '100%',
  },
  rankDelta: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.muted,
  },
});

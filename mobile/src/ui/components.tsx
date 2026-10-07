import React from 'react';
import {Pressable, StyleSheet, Text, View, type ViewStyle} from 'react-native';
import {ShieldCheck, Star, TrendingDown} from 'lucide-react-native';
import {colors, radii, space, typography} from './theme';
import type {FiscalLevel, TrustLevel} from '@/data/types';
import {TrustEngine} from '@/domain/trust';
import {formatBrl} from '@/domain/money';
import type {MarketBasketRank} from '@/domain/compare';

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
}: {
  rank: MarketBasketRank;
  place: number;
  onPress?: () => void;
  highlight?: boolean;
}) {
  const pct = Math.round(rank.coverage * 100);
  return (
    <Pressable
      onPress={onPress}
      style={[styles.rankRow, highlight && styles.rankHi]}>
      <View style={styles.rankPlace}>
        <Text style={styles.rankPlaceText}>{place}</Text>
      </View>
      <View style={{flex: 1, minWidth: 0}}>
        <Text style={styles.rankName} numberOfLines={1}>
          {rank.marketName}
        </Text>
        <Text style={styles.rankMeta}>
          {pct}% da lista · {rank.coveredItems}/{rank.totalItems} itens
        </Text>
      </View>
      <View style={{alignItems: 'flex-end'}}>
        <Text style={styles.rankTotal}>
          {rank.coveredItems > 0 ? formatBrl(rank.total) : '—'}
        </Text>
        {place === 1 && rank.coveredItems > 0 ? (
          <View style={styles.bestPill}>
            <TrendingDown size={12} color={colors.navy} />
            <Text style={styles.bestPillText}>melhor</Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

export function StarsRow({stars}: {stars: number}) {
  return (
    <View style={{flexDirection: 'row', gap: 2}}>
      {[1, 2, 3, 4, 5].map(i => (
        <Star
          key={i}
          size={14}
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
  },
  fiscalText: {fontWeight: '800', color: colors.navy, fontSize: 12},
  rankRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    backgroundColor: '#fff',
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.sm,
    marginBottom: space.xs,
  },
  rankHi: {borderColor: colors.navy, backgroundColor: '#EEF2FF'},
  rankPlace: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.yellowBright,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankPlaceText: {fontWeight: '900', color: colors.navy},
  rankName: {fontWeight: '800', color: colors.navy, fontSize: 14},
  rankMeta: {marginTop: 2, color: colors.muted, fontWeight: '600', fontSize: 11},
  rankTotal: {fontWeight: '800', color: colors.ink, fontSize: 15},
  bestPill: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: '#DCFCE7',
    borderRadius: radii.pill,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  bestPillText: {fontSize: 10, fontWeight: '800', color: colors.navy},
});

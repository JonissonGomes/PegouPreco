import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {Star, TrendingDown, TrendingUp, Minus} from 'lucide-react-native';
import {colors} from '@/ui/theme';
import {
  formatDistanceKm,
  priceBandLabel,
  type PriceBand,
  type RankedMarket,
} from '@/domain/marketUi';

function BandChip({band}: {band: PriceBand}) {
  const Icon =
    band === 'low' ? TrendingDown : band === 'high' ? TrendingUp : Minus;
  const tone =
    band === 'low'
      ? styles.chipLow
      : band === 'high'
        ? styles.chipHigh
        : band === 'fair'
          ? styles.chipFair
          : styles.chipUnknown;
  const color =
    band === 'low'
      ? colors.trustGreen
      : band === 'high'
        ? colors.danger
        : colors.trustYellow;
  return (
    <View style={[styles.chip, tone]}>
      <Icon size={12} color={color} />
      <Text style={[styles.chipText, {color}]}>{priceBandLabel(band)}</Text>
    </View>
  );
}

export function MarketSuggestRow({
  market,
  onPress,
  highlight,
}: {
  market: RankedMarket;
  onPress: () => void;
  highlight?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.row, highlight && styles.rowHi]}>
      <View style={{flex: 1, minWidth: 0}}>
        <Text style={styles.name} numberOfLines={1}>
          {market.name}
        </Text>
        <View style={styles.meta}>
          <Text style={styles.dist}>{formatDistanceKm(market.distanceKm)}</Text>
          <View style={styles.rating}>
            <Star size={12} color={colors.yellowBright} fill={colors.yellowBright} />
            <Text style={styles.ratingText}>
              {(market.avgRating ?? 0) > 0
                ? (market.avgRating ?? 0).toFixed(1)
                : '—'}
            </Text>
          </View>
        </View>
      </View>
      <BandChip band={market.priceBand} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#fff',
    marginBottom: 8,
  },
  rowHi: {
    borderColor: colors.navy,
    backgroundColor: '#EEF2FF',
  },
  name: {fontWeight: '800', color: colors.navy, fontSize: 14},
  meta: {flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4},
  dist: {fontWeight: '700', color: colors.muted, fontSize: 12},
  rating: {flexDirection: 'row', alignItems: 'center', gap: 3},
  ratingText: {fontWeight: '800', color: colors.navy, fontSize: 12},
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
  },
  chipLow: {backgroundColor: '#DCFCE7'},
  chipFair: {backgroundColor: '#FEF9C3'},
  chipHigh: {backgroundColor: '#FEE2E2'},
  chipUnknown: {backgroundColor: colors.bg},
  chipText: {fontSize: 10, fontWeight: '800'},
});

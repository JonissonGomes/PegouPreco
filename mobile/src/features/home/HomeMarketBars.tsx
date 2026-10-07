import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import type {MarketBasketRank} from '@/domain/compare';
import {formatBrl} from '@/domain/money';
import {colors, radii, space} from '@/ui/theme';

type Props = {
  ranks: MarketBasketRank[];
  maxBars?: number;
};

export function HomeMarketBars({ranks, maxBars = 5}: Props) {
  const slice = ranks.slice(0, maxBars);
  if (!slice.length) return null;
  const maxTotal = Math.max(...slice.map(r => r.total), 1);

  return (
    <View style={styles.wrap}>
      {slice.map((r, i) => {
        const pct = Math.max(0.12, r.total / maxTotal);
        const cheapest = i === 0;
        return (
          <View key={`${r.marketId}-${r.marketName}`} style={styles.row}>
            <Text
              style={[styles.name, cheapest && styles.nameHi]}
              numberOfLines={1}>
              {r.marketName}
            </Text>
            <View style={styles.track}>
              <View
                style={[
                  styles.fill,
                  {flex: pct},
                  cheapest ? styles.fillHi : styles.fillOther,
                ]}
              />
              <View style={{flex: 1 - pct}} />
            </View>
            <Text style={[styles.price, cheapest && styles.priceHi]}>
              {formatBrl(r.total)}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {gap: 10, paddingHorizontal: space.md},
  row: {gap: 4},
  name: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.muted,
  },
  nameHi: {color: colors.navy, fontWeight: '800'},
  track: {
    flexDirection: 'row',
    height: 10,
    borderRadius: radii.pill,
    backgroundColor: '#E8ECF4',
    overflow: 'hidden',
  },
  fill: {borderRadius: radii.pill},
  fillHi: {backgroundColor: colors.trustGreen},
  fillOther: {backgroundColor: colors.navy, opacity: 0.35},
  price: {fontSize: 13, fontWeight: '800', color: colors.muted},
  priceHi: {color: colors.trustGreen},
});

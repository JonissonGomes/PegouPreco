import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {formatBrl} from '@/domain/money';
import {colors, radii, space} from '@/ui/theme';

const BAR_COLORS = ['#EF4444', '#F5B400', '#7C3AED'];

export function InsightsBoard({
  spentLabel,
  spent,
  ringLabel,
  ringValue,
  bars,
}: {
  spentLabel: string;
  spent: string;
  ringLabel: string;
  ringValue: string;
  bars: {label: string; value: string; ratio: number}[];
}) {
  return (
    <View style={styles.wrap}>
      <View style={styles.hero}>
        <View style={{flex: 1}}>
          <Text style={styles.kicker}>{spentLabel}</Text>
          <Text style={styles.big}>{spent}</Text>
        </View>
        <View style={styles.ring}>
          <Text style={styles.ringValue}>{ringValue}</Text>
          <Text style={styles.ringLabel}>{ringLabel}</Text>
        </View>
      </View>
      {bars.length > 0 ? (
        <View style={styles.barRow}>
          {bars.slice(0, 3).map((bar, i) => (
            <View key={bar.label} style={styles.barCard}>
              <Text style={styles.barName} numberOfLines={1}>
                {bar.label}
              </Text>
              <Text style={styles.barValue}>{bar.value}</Text>
              <View style={styles.track}>
                <View
                  style={[
                    styles.fill,
                    {
                      width: `${Math.max(8, Math.min(100, bar.ratio * 100))}%`,
                      backgroundColor: BAR_COLORS[i % BAR_COLORS.length],
                    },
                  ]}
                />
              </View>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {gap: 10, marginBottom: space.sm},
  hero: {
    backgroundColor: colors.white,
    borderRadius: 24,
    padding: space.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  kicker: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
    color: colors.muted,
  },
  big: {fontSize: 34, fontWeight: '900', color: colors.ink, marginTop: 4},
  ring: {
    width: 92,
    height: 92,
    borderRadius: 46,
    borderWidth: 8,
    borderColor: colors.yellow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringValue: {fontSize: 16, fontWeight: '900', color: colors.navy},
  ringLabel: {fontSize: 10, fontWeight: '800', color: colors.muted},
  barRow: {flexDirection: 'row', gap: 8},
  barCard: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    padding: 10,
    gap: 4,
  },
  barName: {fontSize: 11, fontWeight: '800', color: colors.muted},
  barValue: {fontSize: 16, fontWeight: '900', color: colors.navy},
  track: {
    height: 4,
    borderRadius: 4,
    backgroundColor: '#E5E7EB',
    overflow: 'hidden',
  },
  fill: {height: 4, borderRadius: 4},
});

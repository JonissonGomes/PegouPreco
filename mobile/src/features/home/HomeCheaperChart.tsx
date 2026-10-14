import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {formatBrl} from '@/domain/money';
import type {CheaperCategory} from '@/domain/purchaseInsights';
import {GrowBar, Reveal} from '@/ui/reveal';
import {categoryTone} from '@/features/history/categoryTone';
import {colors, space} from '@/ui/theme';

export function HomeCheaperChart({items}: {items: CheaperCategory[]}) {
  if (!items.length) return null;
  const max = Math.max(...items.map(item => item.dropPct), 0.01);
  return (
    <View style={styles.wrap}>
      <Reveal>
        <View style={styles.head}>
          <Text style={styles.title}>Categorias mais baratas</Text>
          <Text style={styles.caption}>últimos 7 dias</Text>
        </View>
      </Reveal>
      {items.map((item, index) => {
        const tone = categoryTone(item.category);
        const width = Math.max(0.22, item.dropPct / max);
        return (
          <Reveal key={item.category} delay={80 + index * 90}>
            <View style={styles.row}>
              <View style={styles.fill}>
                <GrowBar
                  ratio={width}
                  color={tone.fg}
                  delay={160 + index * 90}
                  height={52}
                />
              </View>
              <View style={styles.label}>
                <Text style={styles.name} numberOfLines={1}>
                  {item.category}
                </Text>
                <Text style={styles.pct}>-{Math.round(item.dropPct * 100)}%</Text>
              </View>
              <Text style={styles.saved}>{formatBrl(item.saved)}</Text>
            </View>
          </Reveal>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {marginTop: space.md, paddingHorizontal: space.md, gap: 8},
  head: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  title: {fontSize: 18, fontWeight: '900', color: colors.navy},
  caption: {fontSize: 12, fontWeight: '700', color: colors.muted},
  row: {
    height: 52,
    borderRadius: 16,
    backgroundColor: colors.white,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  fill: {position: 'absolute', left: 0, top: 0, bottom: 0, right: 0},
  label: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingLeft: 14,
    paddingRight: 88,
  },
  name: {fontWeight: '900', color: colors.navy, fontSize: 15, flexShrink: 1},
  pct: {fontWeight: '800', color: colors.navy, fontSize: 12},
  saved: {
    position: 'absolute',
    right: 14,
    fontWeight: '900',
    color: colors.navy,
    fontSize: 14,
  },
});

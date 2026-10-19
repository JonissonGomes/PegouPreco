import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {formatBrl} from '@/domain/money';
import type {CheaperCategory} from '@/domain/purchaseInsights';
import {GrowBar, Reveal} from '@/ui/reveal';
import {heatColor} from '@/features/history/categoryTone';
import {colors, space} from '@/ui/theme';

export function HomeCheaperChart({
  items,
  play = 0,
  onOpen,
}: {
  items: CheaperCategory[];
  play?: number;
  onOpen?: (category: string) => void;
}) {
  if (!items.length) return null;
  const max = Math.max(...items.map(item => item.dropPct), 0.01);
  return (
    <View style={styles.wrap}>
      <Reveal play={play}>
        <View style={styles.head}>
          <Text style={styles.title}>Categorias mais baratas</Text>
          <Text style={styles.caption}>últimos 7 dias</Text>
        </View>
      </Reveal>
      {items.map((item, index) => {
        const width = Math.max(0.22, item.dropPct / max);
        return (
          <Reveal key={item.category} delay={80 + index * 90} play={play}>
            <Pressable style={styles.row} onPress={() => onOpen?.(item.category)}>
              <View style={styles.top}>
                <Text style={styles.name} numberOfLines={1}>
                  {item.category}
                </Text>
                <Text style={styles.pct}>-{Math.round(item.dropPct * 100)}%</Text>
                <Text style={styles.saved}>{formatBrl(item.saved)}</Text>
              </View>
              <View style={styles.track}>
                <GrowBar
                  ratio={width}
                  color={heatColor(index, items.length)}
                  delay={160 + index * 90}
                  height={8}
                  play={play}
                />
              </View>
            </Pressable>
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
    borderRadius: 16,
    backgroundColor: colors.white,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 8,
  },
  top: {flexDirection: 'row', alignItems: 'center', gap: 8},
  track: {
    height: 8,
    borderRadius: 8,
    backgroundColor: colors.bg,
    overflow: 'hidden',
  },
  name: {fontWeight: '900', color: colors.navy, fontSize: 15, flex: 1},
  pct: {fontWeight: '800', color: colors.navy, fontSize: 12},
  saved: {fontWeight: '900', color: colors.navy, fontSize: 14},
});

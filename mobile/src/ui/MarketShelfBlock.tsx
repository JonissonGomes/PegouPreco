import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {CategoryIcon} from '@/features/history/categoryIcon';
import type {ShelfCategory} from '@/domain/marketShelf';
import {colors} from '@/ui/theme';

export function MarketShelfBlock({shelf}: {shelf: ShelfCategory[]}) {
  if (shelf.length === 0) {
    return (
      <Text style={styles.empty}>
        Ainda não há notas com categorias neste mercado.
      </Text>
    );
  }
  const popular = shelf.filter(item => item.purchases > 0).slice(0, 3);
  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Categorias neste mercado</Text>
      <View style={styles.chips}>
        {shelf.map(item => (
          <View key={item.category} style={styles.chip}>
            <CategoryIcon name={item.category} size={12} pad={6} />
            <Text style={styles.chipText}>{item.category}</Text>
          </View>
        ))}
      </View>
      {popular.length > 0 ? (
        <>
          <Text style={styles.title}>Mais compradas aqui</Text>
          <View style={styles.chips}>
            {popular.map(item => (
              <View key={item.category} style={styles.chip}>
                <CategoryIcon name={item.category} size={12} pad={6} />
                <Text style={styles.chipText}>{item.category}</Text>
                <Text style={styles.rankCount}>{item.purchases}</Text>
              </View>
            ))}
          </View>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {marginTop: 14, gap: 8},
  title: {fontSize: 13, fontWeight: '800', color: colors.navy},
  empty: {marginTop: 12, color: colors.muted, fontWeight: '600', fontSize: 13},
  chips: {flexDirection: 'row', flexWrap: 'wrap', gap: 8},
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.bg,
    borderRadius: 999,
    paddingRight: 10,
    paddingVertical: 4,
    paddingLeft: 4,
  },
  chipText: {fontSize: 12, fontWeight: '700', color: colors.ink},
  rankCount: {fontWeight: '800', color: colors.navy, fontSize: 12},
});

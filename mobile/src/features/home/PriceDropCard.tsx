import React, {useMemo} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {priceDrops} from '@/domain/priceDrops';
import {formatBrl} from '@/domain/money';
import type {Market, PriceLog, Product, ShoppingList} from '@/data/types';
import {SoftCard} from '@/ui/screenChrome';
import {colors} from '@/ui/theme';

export function PriceDropCard({
  lists,
  logs,
  products,
  markets,
}: {
  lists: ShoppingList[];
  logs: PriceLog[];
  products: Product[];
  markets: Market[];
}) {
  const drops = useMemo(
    () => priceDrops({lists, logs, products, markets}),
    [lists, logs, products, markets],
  );
  return (
    <SoftCard>
      <Text style={styles.title}>Mais barato do que você pagou</Text>
      <Text style={styles.hint}>Nota de outra pessoa, nos últimos 7 dias.</Text>
      {drops.length === 0 ? (
        <Text style={styles.hint}>Nenhum item ficou mais barato por enquanto.</Text>
      ) : null}
      {drops.map(item => (
        <View key={item.productName} style={styles.row}>
          <View style={styles.body}>
            <Text style={styles.name} numberOfLines={1}>
              {item.productName}
            </Text>
            <Text style={styles.meta} numberOfLines={1}>
              {item.marketName} · era {formatBrl(item.paid)}
            </Text>
          </View>
          <View style={styles.prices}>
            <Text style={styles.now}>{formatBrl(item.now)}</Text>
            <Text style={styles.saved}>-{formatBrl(item.saved)}</Text>
          </View>
        </View>
      ))}
    </SoftCard>
  );
}

const styles = StyleSheet.create({
  title: {fontSize: 15, fontWeight: '800', color: colors.navy},
  hint: {marginTop: 2, marginBottom: 8, color: colors.muted, fontSize: 12, fontWeight: '600'},
  row: {flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8},
  body: {flex: 1, minWidth: 0},
  name: {fontSize: 14, fontWeight: '700', color: colors.ink},
  meta: {marginTop: 2, fontSize: 12, color: colors.muted, fontWeight: '600'},
  prices: {alignItems: 'flex-end'},
  now: {fontSize: 14, fontWeight: '800', color: colors.navy},
  saved: {fontSize: 12, fontWeight: '700', color: '#15803D'},
});

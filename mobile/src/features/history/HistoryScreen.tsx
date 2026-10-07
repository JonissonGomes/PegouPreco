import React, {useMemo} from 'react';
import {FlatList, Pressable, StyleSheet, Text, View} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {ArrowLeft, TrendingDown} from 'lucide-react-native';
import {
  AppListCard,
  AppScreenHeader,
  AppScreenNavyBar,
} from '@/ui/chrome';
import {EmptyState} from '@/ui/components';
import {colors, radii, space} from '@/ui/theme';
import {formatBrl} from '@/domain/money';
import {priceLogRepo, useAppStore} from '@/store/appStore';

export function HistoryScreen() {
  const nav = useNavigation<any>();
  const products = useAppStore(s => s.products);

  const rows = useMemo(
    () =>
      products.map(p => {
        const stats = priceLogRepo.statsForProduct(p.id);
        const drop =
          stats && stats.maxPrice > 0 && stats.lastPrice < stats.maxPrice
            ? ((stats.maxPrice - stats.lastPrice) / stats.maxPrice) * 100
            : 0;
        return {product: p, stats, drop};
      }),
    [products],
  );

  const withPrice = rows.filter(r => r.stats).length;

  return (
    <View style={styles.root}>
      <AppScreenHeader
        title="Histórico"
        subtitle="Seu inventário de preços"
        leading={
          <Pressable onPress={() => nav.goBack()} style={{padding: 8}}>
            <ArrowLeft color={colors.navy} size={22} />
          </Pressable>
        }
      />
      <AppScreenNavyBar
        value={String(products.length)}
        label="produtos rastreados"
        trailing={
          <View style={styles.pill}>
            <Text style={styles.pillText}>{withPrice} com preço</Text>
          </View>
        }
      />
      <FlatList
        data={rows}
        keyExtractor={r => String(r.product.id)}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <EmptyState
            title="Nada capturado ainda"
            message="Capture etiquetas ou finalize uma lista para montar seu histórico de preços."
            actionLabel="Ir capturar"
            onAction={() => nav.navigate('Main', {screen: 'Capture'})}
          />
        }
        renderItem={({item}) => {
          const {product, stats, drop} = item;
          return (
            <AppListCard
              onPress={() =>
                nav.navigate('ProductDetail', {productId: product.id})
              }>
              <View style={styles.row}>
                <View style={{flex: 1, minWidth: 0}}>
                  <Text style={styles.name} numberOfLines={2}>
                    {product.name}
                  </Text>
                  {stats ? (
                    <Text style={styles.muted}>
                      Última {formatBrl(stats.lastPrice)} · menor{' '}
                      {formatBrl(stats.minPrice)}
                    </Text>
                  ) : (
                    <Text style={styles.muted}>Sem registros</Text>
                  )}
                </View>
                {drop >= 5 ? (
                  <View style={styles.savePill}>
                    <TrendingDown size={12} color={colors.navy} />
                    <Text style={styles.saveText}>-{drop.toFixed(0)}%</Text>
                  </View>
                ) : stats ? (
                  <Text style={styles.price}>{formatBrl(stats.lastPrice)}</Text>
                ) : null}
              </View>
            </AppListCard>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: colors.bg},
  list: {padding: space.md, paddingBottom: 40},
  pill: {
    backgroundColor: colors.yellowBright,
    borderRadius: radii.pill,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  pillText: {color: colors.navy, fontWeight: '800', fontSize: 11},
  row: {flexDirection: 'row', alignItems: 'center', gap: 10},
  name: {fontWeight: '800', color: colors.navy},
  muted: {color: colors.muted, marginTop: 4, fontWeight: '600', fontSize: 12},
  price: {fontWeight: '800', color: colors.navy, fontSize: 15},
  savePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: '#DCFCE7',
    borderRadius: radii.pill,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  saveText: {fontSize: 11, fontWeight: '900', color: colors.navy},
});

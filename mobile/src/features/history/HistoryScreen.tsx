import React from 'react';
import {FlatList, Pressable, StyleSheet, Text, View} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {ArrowLeft} from 'lucide-react-native';
import {AppListCard, AppScreenHeader} from '@/ui/chrome';
import {colors} from '@/ui/theme';
import {formatBrl} from '@/domain/money';
import {priceLogRepo, useAppStore} from '@/store/appStore';

export function HistoryScreen() {
  const nav = useNavigation<any>();
  const products = useAppStore(s => s.products);

  return (
    <View style={styles.root}>
      <AppScreenHeader
        title="Histórico"
        subtitle="Preços capturados"
        leading={
          <Pressable onPress={() => nav.goBack()} style={{padding: 8}}>
            <ArrowLeft color={colors.navy} size={22} />
          </Pressable>
        }
      />
      <FlatList
        data={products}
        keyExtractor={p => String(p.id)}
        contentContainerStyle={{padding: 16}}
        renderItem={({item}) => {
          const stats = priceLogRepo.statsForProduct(item.id);
          return (
            <AppListCard
              onPress={() =>
                nav.navigate('ProductDetail', {productId: item.id})
              }>
              <Text style={styles.name}>{item.name}</Text>
              {stats ? (
                <Text style={styles.muted}>
                  Última compra {formatBrl(stats.lastPrice)} · menor{' '}
                  {formatBrl(stats.minPrice)}
                </Text>
              ) : (
                <Text style={styles.muted}>Sem registros</Text>
              )}
            </AppListCard>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: colors.bg},
  name: {fontWeight: '800', color: colors.navy},
  muted: {color: colors.muted, marginTop: 4},
});

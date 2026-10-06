import React from 'react';
import {FlatList, Pressable, StyleSheet, Text, View} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {ArrowLeft} from 'lucide-react-native';
import {AppListCard, AppScreenHeader, AppScreenNavyBar} from '@/ui/chrome';
import {colors} from '@/ui/theme';
import {formatBrl} from '@/domain/money';
import {useAppStore} from '@/store/appStore';

export function ShoppingListsScreen() {
  const nav = useNavigation();
  const lists = useAppStore(s => s.lists);
  const totalSpent = lists.reduce((s, l) => s + l.subtotal, 0);
  const totalSaved = lists.reduce((s, l) => s + l.savings, 0);

  return (
    <View style={styles.root}>
      <AppScreenHeader
        title="Listas salvas"
        subtitle="Compare compras passadas"
        leading={
          <Pressable onPress={() => nav.goBack()} style={{padding: 8}}>
            <ArrowLeft color={colors.navy} size={22} />
          </Pressable>
        }
      />
      <AppScreenNavyBar
        value={formatBrl(totalSpent)}
        label="Total gasto nas listas"
        trailing={
          <View>
            <View style={styles.pill}>
              <Text style={styles.pillText}>
                {formatBrl(totalSaved)} economizados
              </Text>
            </View>
            <Text style={styles.count}>{lists.length} LISTAS</Text>
          </View>
        }
      />
      <FlatList
        data={lists}
        keyExtractor={l => String(l.id)}
        contentContainerStyle={{padding: 16}}
        renderItem={({item}) => (
          <AppListCard>
            <Text style={styles.name}>{item.name}</Text>
            <Text style={styles.muted}>
              {item.marketName} ·{' '}
              {new Date(item.finishedAt).toLocaleDateString('pt-BR')} ·{' '}
              {item.itemCount} itens
            </Text>
            <Text style={styles.price}>{formatBrl(item.subtotal)}</Text>
          </AppListCard>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: colors.bg},
  pill: {
    backgroundColor: colors.yellowBright,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  pillText: {color: colors.navy, fontWeight: '800', fontSize: 11},
  count: {color: '#fff', fontWeight: '700', fontSize: 12, marginTop: 6, textAlign: 'right'},
  name: {fontWeight: '800', color: colors.navy},
  muted: {color: colors.muted, marginTop: 2},
  price: {fontWeight: '800', color: colors.navy, marginTop: 6},
});

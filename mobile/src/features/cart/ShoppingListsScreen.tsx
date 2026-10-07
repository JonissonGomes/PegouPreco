import React from 'react';
import {
  Alert,
  LayoutAnimation,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  UIManager,
  View,
} from 'react-native';
import {FlatList} from 'react-native-gesture-handler';
import {useNavigation} from '@react-navigation/native';
import {ArrowLeft} from 'lucide-react-native';
import {AppListCard, AppScreenHeader, AppScreenNavyBar} from '@/ui/chrome';
import {SwipeableActions} from '@/ui/SwipeableActions';
import {colors} from '@/ui/theme';
import {formatBrl} from '@/domain/money';
import {shoppingListRepo, useAppStore} from '@/store/appStore';

if (
  Platform.OS === 'android' &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export function ShoppingListsScreen() {
  const nav = useNavigation();
  const lists = useAppStore(s => s.lists);
  const refresh = useAppStore(s => s.refresh);
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
          <SwipeableActions
            onDelete={() => {
              Alert.alert(
                'Excluir lista?',
                `"${item.name}" será removida do histórico.`,
                [
                  {text: 'Cancelar', style: 'cancel'},
                  {
                    text: 'Excluir',
                    style: 'destructive',
                    onPress: () => {
                      LayoutAnimation.configureNext(
                        LayoutAnimation.Presets.easeInEaseOut,
                      );
                      shoppingListRepo.remove(item.id);
                      refresh();
                    },
                  },
                ],
              );
            }}>
            <AppListCard style={{marginBottom: 0}}>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.muted}>
                {item.marketName} ·{' '}
                {new Date(item.finishedAt).toLocaleDateString('pt-BR')} ·{' '}
                {item.itemCount} itens
              </Text>
              <Text style={styles.price}>{formatBrl(item.subtotal)}</Text>
              <Text style={styles.hint}>Arraste ← para excluir</Text>
            </AppListCard>
          </SwipeableActions>
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
  count: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 12,
    marginTop: 6,
    textAlign: 'right',
  },
  name: {fontWeight: '800', color: colors.navy},
  muted: {color: colors.muted, marginTop: 2},
  price: {fontWeight: '800', color: colors.navy, marginTop: 6},
  hint: {
    marginTop: 6,
    fontSize: 10,
    fontWeight: '600',
    color: 'rgba(107,114,128,0.75)',
  },
});

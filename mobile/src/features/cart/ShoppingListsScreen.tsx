import React, {useMemo, useState} from 'react';
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
import {FlatList, ScrollView} from 'react-native-gesture-handler';
import {useNavigation} from '@react-navigation/native';
import {ArrowLeft} from 'lucide-react-native';
import {AppListCard, AppScreenHeader, AppScreenNavyBar} from '@/ui/chrome';
import {KeyboardSafeSheet} from '@/ui/keyboardSheet';
import {SwipeableActions} from '@/ui/SwipeableActions';
import {colors} from '@/ui/theme';
import {formatBrl, formatQty} from '@/domain/money';
import {effectiveUnitPrice, lineTotal} from '@/domain/pricing';
import {shoppingListRepo, useAppStore} from '@/store/appStore';
import type {CartItem, ShoppingList} from '@/data/types';

if (
  Platform.OS === 'android' &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

function parseListItems(list: ShoppingList): CartItem[] {
  try {
    const raw = JSON.parse(list.itemsJson) as CartItem[];
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

export function ShoppingListsScreen() {
  const nav = useNavigation();
  const lists = useAppStore(s => s.lists);
  const refresh = useAppStore(s => s.refresh);
  const [selected, setSelected] = useState<ShoppingList | null>(null);
  const totalSpent = lists.reduce((s, l) => s + l.subtotal, 0);
  const totalSaved = lists.reduce((s, l) => s + l.savings, 0);
  const detailItems = useMemo(
    () => (selected ? parseListItems(selected) : []),
    [selected],
  );

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
            <AppListCard
              style={{marginBottom: 0}}
              onPress={() => setSelected(item)}>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.muted}>
                {item.marketName} ·{' '}
                {new Date(item.finishedAt).toLocaleDateString('pt-BR')} ·{' '}
                {item.itemCount} itens
              </Text>
              <Text style={styles.price}>{formatBrl(item.subtotal)}</Text>
              <Text style={styles.hint}>Toque para ver itens · arraste ← para excluir</Text>
            </AppListCard>
          </SwipeableActions>
        )}
      />

      <KeyboardSafeSheet
        visible={selected != null}
        onClose={() => setSelected(null)}>
        {selected ? (
          <>
            <Text style={styles.detailTitle}>{selected.name}</Text>
            <Text style={styles.detailMeta}>
              {selected.marketName || 'Mercado'} ·{' '}
              {new Date(selected.finishedAt).toLocaleDateString('pt-BR')}
            </Text>
            <View style={styles.detailTotals}>
              <Text style={styles.detailTotal}>
                {formatBrl(selected.subtotal)}
              </Text>
              {selected.savings > 0 ? (
                <Text style={styles.detailSave}>
                  {formatBrl(selected.savings)} economizados
                </Text>
              ) : null}
            </View>
            <ScrollView style={styles.detailScroll}>
              {detailItems.length === 0 ? (
                <Text style={styles.muted}>Nenhum item nesta lista.</Text>
              ) : (
                detailItems.map((it, idx) => {
                  const unit = effectiveUnitPrice(it);
                  const total = lineTotal(it);
                  return (
                    <View
                      key={`${it.id}-${idx}`}
                      style={[
                        styles.detailRow,
                        idx < detailItems.length - 1 && styles.detailRowBorder,
                      ]}>
                      <View style={{flex: 1, minWidth: 0}}>
                        <Text style={styles.detailName} numberOfLines={2}>
                          {it.productName}
                        </Text>
                        <Text style={styles.detailQty}>
                          {formatQty(it.quantity)} un · {formatBrl(unit)} / un
                          {it.useWholesale ? ' · atacado' : ''}
                        </Text>
                      </View>
                      <Text style={styles.detailLine}>{formatBrl(total)}</Text>
                    </View>
                  );
                })
              )}
            </ScrollView>
          </>
        ) : null}
      </KeyboardSafeSheet>
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
  detailTitle: {fontSize: 18, fontWeight: '800', color: colors.navy},
  detailMeta: {marginTop: 4, color: colors.muted, fontWeight: '600'},
  detailTotals: {
    marginTop: 12,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 12,
  },
  detailTotal: {fontSize: 22, fontWeight: '900', color: colors.navy},
  detailSave: {fontWeight: '700', color: colors.trustGreen, fontSize: 13},
  detailScroll: {maxHeight: 360, marginTop: 4},
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
  },
  detailRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  detailName: {fontWeight: '700', color: colors.ink, fontSize: 14},
  detailQty: {marginTop: 2, fontSize: 12, fontWeight: '600', color: colors.muted},
  detailLine: {fontWeight: '800', color: colors.navy, fontSize: 14},
});

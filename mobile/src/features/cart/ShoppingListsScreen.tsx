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
import {
  ArrowLeft,
  ClipboardList,
  ShoppingCart,
  Store,
} from 'lucide-react-native';
import {AppButton} from '@/ui/chrome';
import {FeatureEmptyGuide} from '@/ui/FeatureEmptyGuide';
import {KeyboardSafeSheet} from '@/ui/keyboardSheet';
import {SwipeableActions} from '@/ui/SwipeableActions';
import {
  BackCircleButton,
  SoftCard,
  SoftHeader,
} from '@/ui/screenChrome';
import {colors, space, spacing} from '@/ui/theme';
import {formatBrl, formatQty} from '@/domain/money';
import {lineTotal} from '@/domain/pricing';
import {
  cartRepo,
  shoppingListRepo,
  useAppStore,
} from '@/store/appStore';
import type {CartItem, ShoppingList} from '@/data/types';

if (
  Platform.OS === 'android' &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const DETAIL_PREVIEW = 4;

function parseListItems(list: ShoppingList): CartItem[] {
  try {
    const raw = JSON.parse(list.itemsJson) as CartItem[];
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function formatListDate(iso: string) {
  const d = new Date(iso);
  const day = d.getDate().toString().padStart(2, '0');
  const month = d.toLocaleDateString('pt-BR', {month: 'short'}).replace('.', '');
  return `${day} ${month}`;
}

export function ShoppingListsScreen() {
  const nav = useNavigation<any>();
  const lists = useAppStore(s => s.lists);
  const refresh = useAppStore(s => s.refresh);
  const startList = useAppStore(s => s.startList);
  const [selected, setSelected] = useState<ShoppingList | null>(null);
  const totalSpent = lists.reduce((s, l) => s + l.subtotal, 0);
  const detailItems = useMemo(
    () => (selected ? parseListItems(selected) : []),
    [selected],
  );
  const preview = detailItems.slice(0, DETAIL_PREVIEW);
  const extraCount = Math.max(0, detailItems.length - DETAIL_PREVIEW);

  const redoList = (list: ShoppingList) => {
    const items = parseListItems(list);
    cartRepo.clear();
    for (const it of items) {
      cartRepo.upsert({
        productId: it.productId,
        productName: it.productName,
        quantity: it.quantity,
        retailPrice: it.retailPrice,
        wholesalePrice: it.wholesalePrice,
        minWholesaleQty: it.minWholesaleQty,
        useWholesale: it.useWholesale,
        checkedOff: 0,
      });
    }
    if (list.marketId == null) {
      Alert.alert(
        'Mercado ausente',
        'Esta lista não tem mercado vinculado. Crie uma nova lista e escolha o mercado.',
      );
      return;
    }
    startList(list.name, list.marketId);
    setSelected(null);
    nav.navigate('Main', {screen: 'Lists'});
  };

  return (
    <View style={styles.root}>
      <SoftHeader
        title="Listas salvas"
        subtitle={`${lists.length} listas · ${formatBrl(totalSpent)} gastos`}
        leading={
          <BackCircleButton onPress={() => nav.goBack()}>
            <ArrowLeft color={colors.navy} size={22} />
          </BackCircleButton>
        }
      />
      <FlatList
        data={lists}
        keyExtractor={l => String(l.id)}
        contentContainerStyle={[
          styles.listPad,
          lists.length === 0 && styles.listPadEmpty,
        ]}
        ListEmptyComponent={
          <FeatureEmptyGuide
            HeroIcon={ClipboardList}
            title="Nenhuma lista salva ainda"
            subtitle="Listas finalizadas ficam aqui para você refazer a mesma cesta depois."
            stepsLabel="O que é esta tela"
            steps={[
              {
                n: '1',
                title: 'Finalize uma compra',
                text: 'Na aba Listas, termine a lista ativa ao sair do mercado.',
                Icon: ShoppingCart,
              },
              {
                n: '2',
                title: 'Ela aparece aqui',
                text: 'Nome, mercado, total e itens ficam salvos no histórico.',
                Icon: ClipboardList,
              },
              {
                n: '3',
                title: 'Refaça quando quiser',
                text: 'Toque em uma lista para reabrir os itens no carrinho.',
                Icon: Store,
              },
            ]}
            PrimaryIcon={ShoppingCart}
            primaryLabel="Ir para Listas"
            onPrimary={() => nav.navigate('Main', {screen: 'Lists'})}
            secondaryLabel="Ver mercados no mapa"
            onSecondary={() => nav.navigate('Main', {screen: 'Map'})}
          />
        }
        ListFooterComponent={
          lists.length ? (
            <Text style={styles.footerHint}>
              Deslize para a esquerda para excluir
            </Text>
          ) : null
        }
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
                      if (selected?.id === item.id) setSelected(null);
                    },
                  },
                ],
              );
            }}>
            <SoftCard onPress={() => setSelected(item)} style={styles.listCard}>
              <View style={styles.listRow}>
                <View style={{flex: 1, minWidth: 0}}>
                  <Text style={styles.name}>{item.name}</Text>
                  <Text style={styles.muted} numberOfLines={1}>
                    {item.marketName} · {formatListDate(item.finishedAt)} ·{' '}
                    {item.itemCount} itens
                  </Text>
                </View>
                <Text style={styles.price}>{formatBrl(item.subtotal)}</Text>
              </View>
            </SoftCard>
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
              {formatListDate(selected.finishedAt)}
            </Text>
            <Text style={styles.detailTotal}>
              {formatBrl(selected.subtotal)}
            </Text>
            <ScrollView style={styles.detailScroll}>
              {preview.map((it, idx) => (
                <View
                  key={`${it.productId}-${idx}`}
                  style={[
                    styles.detailRow,
                    idx < preview.length - 1 && styles.detailRowBorder,
                  ]}>
                  <View style={{flex: 1, minWidth: 0}}>
                    <Text style={styles.detailName} numberOfLines={2}>
                      {it.productName}
                    </Text>
                    <Text style={styles.detailQty}>
                      {formatQty(it.quantity)} un
                    </Text>
                  </View>
                  <Text style={styles.detailLine}>
                    {formatBrl(lineTotal(it))}
                  </Text>
                </View>
              ))}
              {extraCount > 0 ? (
                <Text style={styles.moreItems}>+ {extraCount} itens</Text>
              ) : null}
            </ScrollView>
            <View style={styles.detailActions}>
              <View style={{flex: 1}}>
                <AppButton
                  label="Refazer esta lista"
                  onPress={() => redoList(selected)}
                />
              </View>
              <View style={{flex: 1}}>
                <AppButton
                  label="Excluir"
                  outlined
                  onPress={() => {
                    Alert.alert(
                      'Excluir lista?',
                      `"${selected.name}" será removida.`,
                      [
                        {text: 'Cancelar', style: 'cancel'},
                        {
                          text: 'Excluir',
                          style: 'destructive',
                          onPress: () => {
                            shoppingListRepo.remove(selected.id);
                            refresh();
                            setSelected(null);
                          },
                        },
                      ],
                    );
                  }}
                />
              </View>
            </View>
          </>
        ) : null}
      </KeyboardSafeSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: colors.bg},
  listPad: {padding: space.md, paddingBottom: 40},
  listPadEmpty: {
    flexGrow: 1,
    paddingBottom: spacing.bottomNavClearance,
  },
  listCard: {marginBottom: space.sm},
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  name: {fontWeight: '900', color: colors.navy, fontSize: 16},
  muted: {color: colors.muted, marginTop: 4, fontWeight: '600', fontSize: 13},
  price: {fontWeight: '900', color: colors.navy, fontSize: 17},
  footerHint: {
    textAlign: 'center',
    color: colors.muted,
    fontWeight: '600',
    fontSize: 13,
    marginTop: space.md,
  },
  detailTitle: {fontSize: 20, fontWeight: '900', color: colors.navy},
  detailMeta: {marginTop: 4, color: colors.muted, fontWeight: '600'},
  detailTotal: {
    marginTop: 12,
    marginBottom: 8,
    fontSize: 28,
    fontWeight: '900',
    color: colors.navy,
  },
  detailScroll: {maxHeight: 320, marginTop: 4},
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
  detailName: {fontWeight: '800', color: colors.navy, fontSize: 15},
  detailQty: {marginTop: 2, fontSize: 12, fontWeight: '600', color: colors.muted},
  detailLine: {fontWeight: '900', color: colors.navy, fontSize: 15},
  moreItems: {
    marginTop: 8,
    fontSize: 13,
    fontWeight: '700',
    color: colors.muted,
  },
  detailActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: space.md,
  },
});

import React, {useMemo, useState} from 'react';
import {
  LayoutAnimation,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  UIManager,
  View,
} from 'react-native';
import {FlatList, ScrollView} from 'react-native-gesture-handler';
import {useNavigation} from '@react-navigation/native';
import {
  ArrowLeft,
  ClipboardList,
  QrCode,
  Receipt,
  ShoppingCart,
  Store,
} from 'lucide-react-native';
import {AppButton} from '@/ui/chrome';
import {appAlert} from '@/ui/appDialog';
import {FeatureEmptyGuide} from '@/ui/FeatureEmptyGuide';
import {KeyboardSafeSheet} from '@/ui/keyboardSheet';
import {SwipeableActions} from '@/ui/SwipeableActions';
import {
  BackCircleButton,
  SoftCard,
  SoftHeader,
} from '@/ui/screenChrome';
import {colors, radii, space, spacing} from '@/ui/theme';
import {formatBrl, formatQty} from '@/domain/money';
import {guessCategory} from '@/domain/productCategory';
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
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'nfce' | 'list'>('all');
  const totalSpent = lists.reduce((s, l) => s + l.subtotal, 0);
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return lists.filter(l => {
      if (filter === 'nfce' && !l.nfceKey) return false;
      if (filter === 'list' && l.nfceKey) return false;
      if (!q) return true;
      return (
        l.name.toLowerCase().includes(q) ||
        (l.marketName ?? '').toLowerCase().includes(q)
      );
    });
  }, [lists, query, filter]);
  const detailItems = useMemo(
    () => (selected ? parseListItems(selected) : []),
    [selected],
  );
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
      appAlert(
        'Mercado ausente',
        'Esta lista não tem mercado vinculado. Crie uma nova compra e escolha o mercado.',
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
        trailing={
          <Pressable
            onPress={() => nav.navigate('ImportPurchase')}
            style={styles.importBtn}
            accessibilityLabel="Importar compra anterior">
            <QrCode size={16} color={colors.navy} />
            <Text style={styles.importText}>Cadastrar nota</Text>
          </Pressable>
        }
      />
      <FlatList
        data={visible}
        keyExtractor={l => String(l.id)}
        contentContainerStyle={[
          styles.listPad,
          lists.length === 0 && styles.listPadEmpty,
        ]}
        ListHeaderComponent={
          lists.length ? (
            <View style={styles.filters}>
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Buscar lista ou mercado"
                placeholderTextColor={colors.muted}
                style={styles.search}
              />
              <View style={styles.chips}>
                {(
                  [
                    ['all', 'Todas'],
                    ['nfce', 'Notas'],
                    ['list', 'Listas'],
                  ] as const
                ).map(([id, label]) => {
                  const on = filter === id;
                  return (
                    <Pressable
                      key={id}
                      onPress={() => setFilter(id)}
                      style={[styles.chip, on && styles.chipOn]}>
                      <Text style={[styles.chipText, on && styles.chipTextOn]}>
                        {label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null
        }
        ListEmptyComponent={
          <FeatureEmptyGuide
            HeroIcon={ClipboardList}
            title="Nenhuma lista salva ainda"
            subtitle="Finalize uma compra ou importe uma nota antiga. As listas ficam aqui para você refazer a cesta."
            stepsLabel="O que é esta tela"
            steps={[
              {
                n: '1',
                title: 'Finalize uma compra',
                text: 'Na aba Compras, finalize a compra ao sair do mercado.',
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
            primaryLabel="Ir para Compras"
            onPrimary={() => nav.navigate('Main', {screen: 'Lists'})}
            secondaryLabel="Cadastrar nota"
            onSecondary={() => nav.navigate('ImportPurchase')}
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
              appAlert(
                'Excluir lista?',
                `"${item.name}" será removida do histórico.`,
                [
                  {label: 'Cancelar', style: 'cancel'},
                  {
                    label: 'Excluir',
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
                <View style={styles.itemIcon}>
                  <Receipt size={16} color={colors.navy} />
                </View>
                <View style={styles.listBody}>
                  <Text style={styles.name} numberOfLines={1}>
                    {item.marketName || item.name}
                  </Text>
                  <View style={styles.metaLine}>
                    <Text style={styles.muted} numberOfLines={1}>
                      {item.name} · {formatListDate(item.finishedAt)}
                    </Text>
                    <View
                      style={[
                        styles.pill,
                        item.nfceKey ? styles.pillNote : styles.pillList,
                      ]}>
                      <Text style={styles.pillText}>
                        {item.nfceKey ? 'Nota' : 'Lista'}
                      </Text>
                    </View>
                  </View>
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
              {detailItems.map((it, idx) => (
                <View
                  key={`${it.productId}-${idx}`}
                  style={[
                    styles.detailRow,
                    idx < detailItems.length - 1 && styles.detailRowBorder,
                  ]}>
                  <View style={{flex: 1, minWidth: 0}}>
                    <Text style={styles.detailName} numberOfLines={2}>
                      {it.productName}
                    </Text>
                    <Text style={styles.detailQty}>
                      {guessCategory(it.productName)} · {formatQty(it.quantity)} ×{' '}
                      {formatBrl(it.retailPrice)}
                    </Text>
                  </View>
                  <Text style={styles.detailLine}>
                    {formatBrl(lineTotal(it))}
                  </Text>
                </View>
              ))}
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
                    appAlert(
                      'Excluir lista?',
                      `"${selected.name}" será removida.`,
                      [
                        {label: 'Cancelar', style: 'cancel'},
                        {
                          label: 'Excluir',
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
  filters: {gap: 10, marginBottom: space.sm},
  search: {
    backgroundColor: colors.white,
    borderRadius: radii.pill,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontWeight: '600',
    color: colors.ink,
  },
  chips: {flexDirection: 'row', gap: 8},
  chip: {
    borderRadius: radii.pill,
    backgroundColor: '#E8EAED',
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  chipOn: {backgroundColor: colors.navy},
  chipText: {fontWeight: '800', color: colors.ink, fontSize: 13},
  chipTextOn: {color: colors.white},
  listCard: {marginBottom: 8, paddingVertical: 10, paddingHorizontal: 12},
  listRow: {flexDirection: 'row', alignItems: 'center', gap: 10},
  listBody: {flex: 1, minWidth: 0, gap: 2},
  itemIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#FFF6D8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: {fontWeight: '900', color: colors.navy, fontSize: 14},
  muted: {flexShrink: 1, color: colors.muted, fontWeight: '600', fontSize: 12},
  metaLine: {flexDirection: 'row', alignItems: 'center', gap: 6},
  pill: {borderRadius: radii.pill, paddingHorizontal: 8, paddingVertical: 2},
  pillNote: {backgroundColor: '#DCFCE7'},
  pillList: {backgroundColor: '#E0E7FF'},
  pillText: {fontSize: 11, fontWeight: '800', color: colors.navy},
  price: {fontWeight: '900', color: colors.navy, fontSize: 14},
  importBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#fff',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  importText: {fontWeight: '800', color: colors.navy, fontSize: 13},
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

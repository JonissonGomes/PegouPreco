import React, {useMemo, useState} from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {History, Receipt, ScanLine, SlidersHorizontal, Store} from 'lucide-react-native';
import {FeatureEmptyGuide} from '@/ui/FeatureEmptyGuide';
import {SoftCard, SoftHeader} from '@/ui/screenChrome';
import {colors, radii, space, spacing} from '@/ui/theme';
import {formatBrl} from '@/domain/money';
import {guessCategory} from '@/domain/productCategory';
import {useAppStore} from '@/store/appStore';
import type {CartItem, ShoppingList} from '@/data/types';
import {categoryTone} from './categoryTone';
import {HistoryDetailSheet} from './HistoryDetailSheet';
import {HistoryFilterSheet} from './HistoryFilterSheet';

function parseItems(list: ShoppingList): CartItem[] {
  try {
    const raw = JSON.parse(list.itemsJson) as CartItem[];
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function itemCategory(item: CartItem, products: {id: number; category: string | null}[]) {
  const stored = products.find(p => p.id === item.productId)?.category?.trim();
  return stored || guessCategory(item.productName);
}

function formatWhen(iso: string) {
  const d = new Date(iso);
  const month = d.toLocaleDateString('pt-BR', {month: 'short'}).replace('.', '');
  return `${d.getDate()} ${month}, ${d.getFullYear()}`;
}

function marketLabel(list: ShoppingList) {
  return list.marketName?.trim() || 'Sem mercado';
}

export function HistoryScreen() {
  const nav = useNavigation<any>();
  const products = useAppStore(s => s.products);
  const lists = useAppStore(s => s.lists);
  const [query, setQuery] = useState('');
  const [market, setMarket] = useState<string | null>(null);
  const [category, setCategory] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [openList, setOpenList] = useState<ShoppingList | null>(null);

  const catalog = useMemo(
    () =>
      lists.map(list => ({
        list,
        items: parseItems(list),
        categories: [] as string[],
      })),
    [lists],
  );
  const withCats = useMemo(
    () =>
      catalog.map(row => ({
        ...row,
        categories: Array.from(
          new Set(row.items.map(it => itemCategory(it, products))),
        ),
      })),
    [catalog, products],
  );
  const markets = useMemo(() => {
    const names = new Set(withCats.map(row => marketLabel(row.list)));
    return Array.from(names).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [withCats]);
  const categories = useMemo(() => {
    const names = new Set(withCats.flatMap(row => row.categories));
    return Array.from(names).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [withCats]);
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return withCats.filter(row => {
      if (market && marketLabel(row.list) !== market) return false;
      if (category && !row.categories.includes(category)) return false;
      if (!q) return true;
      if (row.list.name.toLowerCase().includes(q)) return true;
      if (marketLabel(row.list).toLowerCase().includes(q)) return true;
      return row.items.some(it => it.productName.toLowerCase().includes(q));
    });
  }, [withCats, query, market, category]);

  const filterCount = (market ? 1 : 0) + (category ? 1 : 0);

  return (
    <View style={styles.root}>
      <SoftHeader
        title="Histórico"
        subtitle={`${lists.length} compras`}
      />
      {lists.length > 0 ? (
        <View style={styles.filters}>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Buscar compra, mercado ou item"
            placeholderTextColor={colors.muted}
            style={styles.search}
          />
          <Pressable style={styles.filterBtn} onPress={() => setFiltersOpen(true)}>
            <SlidersHorizontal size={16} color={colors.navy} />
            {filterCount > 0 ? (
              <View style={styles.filterBadge}>
                <Text style={styles.filterBadgeText}>{filterCount}</Text>
              </View>
            ) : null}
          </Pressable>
        </View>
      ) : null}
      <FlatList
        data={visible}
        keyExtractor={row => String(row.list.id)}
        contentContainerStyle={[
          styles.list,
          visible.length === 0 && styles.listEmpty,
        ]}
        ListEmptyComponent={
          <FeatureEmptyGuide
            HeroIcon={History}
            title={lists.length ? 'Nenhuma compra neste filtro' : 'Nenhuma compra no histórico'}
            subtitle="Importe uma nota antiga ou finalize uma compra para ver o resumo aqui."
            stepsLabel="Como usar"
            steps={[
              {
                n: '1',
                title: 'Abra os filtros',
                text: 'O botão ao lado da busca escolhe mercado e categoria.',
                Icon: Store,
              },
              {
                n: '2',
                title: 'Escolha a categoria',
                text: 'No modal, cada categoria aparece com a cor dela.',
                Icon: Receipt,
              },
              {
                n: '3',
                title: 'Abra a compra',
                text: 'Cada item aparece com a categoria, a quantidade e o valor.',
                Icon: ScanLine,
              },
            ]}
            PrimaryIcon={ScanLine}
            primaryLabel="Cadastrar nota"
            onPrimary={() => nav.navigate('ImportPurchase')}
            secondaryLabel="Ir para Compras"
            onSecondary={() => nav.navigate('Lists')}
          />
        }
        renderItem={({item}) => (
          <PurchaseCard row={item} onPress={() => setOpenList(item.list)} />
        )}
      />
      <HistoryDetailSheet
        list={openList}
        products={products}
        onClose={() => setOpenList(null)}
      />
      <HistoryFilterSheet
        visible={filtersOpen}
        market={market}
        category={category}
        markets={markets}
        categories={categories}
        onClose={() => setFiltersOpen(false)}
        onApply={next => {
          setMarket(next.market);
          setCategory(next.category);
          setFiltersOpen(false);
        }}
      />
    </View>
  );
}

function PurchaseCard({
  row,
  onPress,
}: {
  row: {list: ShoppingList; categories: string[]};
  onPress: () => void;
}) {
  const shown = row.categories.slice(0, 1);
  const extra = row.categories.length - shown.length;
  return (
    <SoftCard onPress={onPress} style={styles.card}>
      <View style={styles.top}>
        <View style={styles.icon}>
          <Receipt size={16} color={colors.navy} />
        </View>
        <View style={styles.body}>
          <Text style={styles.name} numberOfLines={1}>
            {marketLabel(row.list)}
          </Text>
          <View style={styles.metaRow}>
            <Text style={styles.meta} numberOfLines={1}>
              {row.list.name} · {formatWhen(row.list.finishedAt)}
            </Text>
            {shown.map(cat => {
              const tone = categoryTone(cat);
              return (
                <View key={cat} style={[styles.pill, {backgroundColor: tone.bg}]}>
                  <Text style={[styles.pillText, {color: tone.fg}]}>{cat}</Text>
                </View>
              );
            })}
            {extra > 0 ? <Text style={styles.extra}>+{extra}</Text> : null}
          </View>
        </View>
        <Text style={styles.price}>{formatBrl(row.list.subtotal)}</Text>
      </View>
    </SoftCard>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: colors.bg},
  filters: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.md,
    gap: 8,
    marginBottom: space.sm,
  },
  search: {
    flex: 1,
    height: 48,
    backgroundColor: colors.white,
    borderRadius: radii.pill,
    paddingHorizontal: space.md,
    fontSize: 15,
    fontWeight: '600',
    color: colors.ink,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.yellow,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  filterBadgeText: {fontSize: 10, fontWeight: '900', color: colors.navy},
  list: {
    paddingHorizontal: space.md,
    paddingBottom: spacing.bottomNavClearance,
    gap: 8,
  },
  listEmpty: {flexGrow: 1},
  card: {paddingVertical: 10, paddingHorizontal: 12},
  top: {flexDirection: 'row', alignItems: 'center', gap: 10},
  icon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#FFF6D8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {flex: 1, minWidth: 0, gap: 2},
  name: {fontWeight: '900', color: colors.navy, fontSize: 14},
  metaRow: {flexDirection: 'row', alignItems: 'center', gap: 6},
  meta: {flexShrink: 1, color: colors.muted, fontWeight: '600', fontSize: 12},
  price: {fontWeight: '900', color: colors.navy, fontSize: 14},
  pill: {borderRadius: radii.pill, paddingHorizontal: 8, paddingVertical: 2},
  pillText: {fontWeight: '800', fontSize: 11},
  extra: {color: colors.muted, fontWeight: '800', fontSize: 11},
});

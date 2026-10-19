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
import {History, QrCode, Receipt, ScanLine, SlidersHorizontal, Store, ClipboardList} from 'lucide-react-native';
import {FeatureEmptyGuide} from '@/ui/FeatureEmptyGuide';
import {appAlert} from '@/ui/appDialog';
import {SoftCard, SoftHeader} from '@/ui/screenChrome';
import {colors, radii, space, spacing} from '@/ui/theme';
import {formatBrl} from '@/domain/money';
import {dateSearchText} from '@/domain/dateSearch';
import {isFiscalList} from '@/domain/fiscal';
import {PRODUCT_CATEGORIES, resolveCategory} from '@/domain/productCategory';
import {forgetPurchase, useAppStore} from '@/store/appStore';
import {requestAutoSync} from '@/data/syncWorker';
import type {CartItem, ShoppingList} from '@/data/types';
import {CategoryIcon} from './categoryIcon';
import {HistoryDetailSheet} from './HistoryDetailSheet';
import {HistoryFilterSheet} from './HistoryFilterSheet';
import {useClearOnBlur} from '@/ui/useClearOnBlur';

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
  return resolveCategory(stored, item.productName);
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
  const refresh = useAppStore(s => s.refresh);
  const [query, setQuery] = useState('');
  const [market, setMarket] = useState<string | null>(null);
  const [category, setCategory] = useState<string[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [openList, setOpenList] = useState<ShoppingList | null>(null);
  useClearOnBlur(() => {
    setQuery('');
    setMarket(null);
    setCategory([]);
    setFiltersOpen(false);
    setOpenList(null);
  });

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
    const names = new Set<string>([
      ...PRODUCT_CATEGORIES,
      ...withCats.flatMap(row => row.categories),
    ]);
    return Array.from(names).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [withCats]);
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return withCats.filter(row => {
      if (market && marketLabel(row.list) !== market) return false;
      if (category.length > 0 && !category.some(name => row.categories.includes(name))) {
        return false;
      }
      if (!q) return true;
      if (row.list.name.toLowerCase().includes(q)) return true;
      if (marketLabel(row.list).toLowerCase().includes(q)) return true;
      if (dateSearchText(row.list.finishedAt).includes(q)) return true;
      return row.items.some(it => it.productName.toLowerCase().includes(q));
    });
  }, [withCats, query, market, category]);

  const filterCount = (market ? 1 : 0) + (category.length > 0 ? 1 : 0);
  const readNote = (list: ShoppingList) => {
    setOpenList(null);
    nav.navigate('ImportPurchase', {replaceListId: list.id});
  };

  return (
    <View style={styles.root}>
      <SoftHeader
        title="Histórico"
        subtitle={`${lists.length} compras`}
        trailing={
          <Pressable
            style={styles.noteBtn}
            onPress={() => nav.navigate('ImportPurchase')}
            accessibilityLabel="Cadastrar nota fiscal">
            <QrCode size={16} color={colors.navy} />
            <Text style={styles.noteBtnText}>Nota</Text>
          </Pressable>
        }
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
          <PurchaseCard
            row={item}
            onPress={() => setOpenList(item.list)}
            onReadNote={() => readNote(item.list)}
          />
        )}
      />
      <HistoryDetailSheet
        list={openList}
        products={products}
        onClose={() => setOpenList(null)}
        onReadNote={readNote}
        onDelete={list => {
          appAlert(
            'Remover esta compra?',
            'A nota sai do histórico, dos gastos, das dicas e da comunidade neste aparelho.',
            [
              {label: 'Cancelar', style: 'cancel'},
              {
                label: 'Remover',
                style: 'destructive',
                onPress: () => {
                  forgetPurchase(list);
                  refresh();
                  requestAutoSync('nfce');
                  setOpenList(null);
                },
              },
            ],
          );
        }}
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
  onReadNote,
}: {
  row: {list: ShoppingList; categories: string[]};
  onPress: () => void;
  onReadNote: () => void;
}) {
  const shown = row.categories.slice(0, 1);
  const extra = row.categories.length - shown.length;
  const fiscal = isFiscalList(row.list);
  return (
    <SoftCard onPress={onPress} style={styles.card}>
      <View style={styles.top}>
        <View style={[styles.icon, fiscal ? styles.iconNote : styles.iconList]}>
          {fiscal ? (
            <Receipt size={16} color={colors.navy} />
          ) : (
            <ClipboardList size={16} color={colors.navy} />
          )}
          <View style={[styles.mark, fiscal ? styles.markNote : styles.markList]}>
            <Text style={styles.markText}>{fiscal ? 'NF' : 'L'}</Text>
          </View>
        </View>
        <View style={styles.body}>
          <Text style={styles.name} numberOfLines={1}>
            {marketLabel(row.list)}
          </Text>
          <View style={styles.metaRow}>
            <Text style={styles.meta} numberOfLines={1}>
              {row.list.name} · {formatWhen(row.list.finishedAt)}
            </Text>
            {shown.map(cat => (
              <CategoryIcon key={cat} name={cat} size={12} />
            ))}
            {extra > 0 ? <Text style={styles.extra}>+{extra}</Text> : null}
          </View>
        </View>
        {!fiscal ? (
          <Pressable
            style={styles.rowNote}
            accessibilityLabel="Cadastrar nota fiscal desta compra"
            onPress={onReadNote}>
            <QrCode size={16} color={colors.navy} />
          </Pressable>
        ) : null}
        <Text style={styles.price}>{formatBrl(row.list.subtotal)}</Text>
      </View>
    </SoftCard>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: colors.bg},
  noteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.yellow,
    borderRadius: radii.pill,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  noteBtnText: {fontWeight: '900', color: colors.navy, fontSize: 13},
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
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconNote: {backgroundColor: '#FFF6D8'},
  iconList: {backgroundColor: '#E4ECFA'},
  mark: {
    position: 'absolute',
    right: -4,
    bottom: -4,
    minWidth: 16,
    height: 14,
    borderRadius: 7,
    paddingHorizontal: 3,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.white,
  },
  markNote: {backgroundColor: colors.navy},
  markList: {backgroundColor: colors.cyan},
  markText: {fontSize: 8, fontWeight: '900', color: colors.white},
  body: {flex: 1, minWidth: 0, gap: 2},
  name: {fontWeight: '900', color: colors.navy, fontSize: 14},
  metaRow: {flexDirection: 'row', alignItems: 'center', gap: 6},
  meta: {flexShrink: 1, color: colors.muted, fontWeight: '600', fontSize: 12},
  rowNote: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FFF6D8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  price: {fontWeight: '900', color: colors.navy, fontSize: 14},
  extra: {color: colors.muted, fontWeight: '800', fontSize: 11},
});

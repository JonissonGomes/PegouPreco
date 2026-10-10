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
import {ArrowLeft, History, ScanLine, TrendingDown} from 'lucide-react-native';
import {FeatureEmptyGuide} from '@/ui/FeatureEmptyGuide';
import {
  BackCircleButton,
  SavePill,
  SoftCard,
  SoftHeader,
} from '@/ui/screenChrome';
import {colors, radii, space, spacing} from '@/ui/theme';
import {formatBrl, formatQty} from '@/domain/money';
import {lineTotal} from '@/domain/pricing';
import {guessCategory} from '@/domain/productCategory';
import {priceLogRepo, useAppStore} from '@/store/appStore';
import {KeyboardSafeSheet} from '@/ui/keyboardSheet';
import type {CartItem, ShoppingList} from '@/data/types';

type Filter = 'all' | 'lowest' | 'above';
type ViewMode = 'purchase' | 'category' | 'price';

function parseItems(list: ShoppingList): CartItem[] {
  try {
    const raw = JSON.parse(list.itemsJson) as CartItem[];
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function formatWhen(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR', {day: '2-digit', month: 'short'});
}

function pctAboveMin(last: number, min: number): number {
  if (min <= 0) return 0;
  return ((last - min) / min) * 100;
}

export function HistoryScreen() {
  const nav = useNavigation<any>();
  const products = useAppStore(s => s.products);
  const lists = useAppStore(s => s.lists);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [view, setView] = useState<ViewMode>('purchase');
  const [category, setCategory] = useState('Todas');
  const [openList, setOpenList] = useState<ShoppingList | null>(null);

  const rows = useMemo(
    () =>
      products.map(p => {
        const stats = priceLogRepo.statsForProduct(p.id);
        const atLowest =
          stats != null && stats.lastPrice <= stats.minPrice * 1.001;
        const pct =
          stats && !atLowest ? pctAboveMin(stats.lastPrice, stats.minPrice) : 0;
        return {product: p, stats, atLowest, pct};
      }),
    [products],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter(r => {
      if (q && !r.product.name.toLowerCase().includes(q)) return false;
      if (filter === 'lowest') return r.atLowest && r.stats;
      if (filter === 'above') return r.stats && !r.atLowest;
      return true;
    });
  }, [rows, query, filter]);

  const chips: {key: Filter; label: string}[] = [
    {key: 'all', label: 'Todos'},
    {key: 'lowest', label: 'No menor preço'},
    {key: 'above', label: 'Acima do menor'},
  ];
  const views: {key: ViewMode; label: string}[] = [
    {key: 'purchase', label: 'Por compra'},
    {key: 'category', label: 'Por categoria'},
    {key: 'price', label: 'Por preço'},
  ];
  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const p of products) set.add(p.category?.trim() || guessCategory(p.name));
    return ['Todas', ...Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'))];
  }, [products]);
  const purchases = useMemo(() => {
    const q = query.trim().toLowerCase();
    return lists.filter(l => {
      if (!q) return true;
      if (l.name.toLowerCase().includes(q)) return true;
      if ((l.marketName ?? '').toLowerCase().includes(q)) return true;
      return parseItems(l).some(it => it.productName.toLowerCase().includes(q));
    });
  }, [lists, query]);
  const byCategory = useMemo(() => {
    const q = query.trim().toLowerCase();
    const groups = new Map<string, typeof rows>();
    for (const row of rows) {
      const cat = row.product.category?.trim() || guessCategory(row.product.name);
      if (category !== 'Todas' && cat !== category) continue;
      if (q && !row.product.name.toLowerCase().includes(q)) continue;
      const bucket = groups.get(cat) ?? [];
      bucket.push(row);
      groups.set(cat, bucket);
    }
    return Array.from(groups.entries()).sort((a, b) =>
      a[0].localeCompare(b[0], 'pt-BR'),
    );
  }, [rows, query, category]);
  const openItems = openList ? parseItems(openList) : [];

  return (
    <View style={styles.root}>
      <SoftHeader
        title="Histórico"
        subtitle={`${products.length} produtos rastreados`}
        leading={
          <BackCircleButton onPress={() => nav.goBack()}>
            <ArrowLeft color={colors.navy} size={22} />
          </BackCircleButton>
        }
      />

      <View style={styles.searchWrap}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Buscar produto"
          placeholderTextColor={colors.muted}
          style={styles.search}
        />
      </View>

      <View style={styles.chips}>
        {views.map(c => {
          const on = view === c.key;
          return (
            <Pressable
              key={c.key}
              onPress={() => setView(c.key)}
              style={[styles.chip, on && styles.chipOn]}>
              <Text style={[styles.chipText, on && styles.chipTextOn]}>
                {c.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {view === 'price' ? (
        <View style={styles.chips}>
          {chips.map(c => {
            const on = filter === c.key;
            return (
              <Pressable
                key={c.key}
                onPress={() => setFilter(c.key)}
                style={[styles.chip, on && styles.chipOn]}>
                <Text style={[styles.chipText, on && styles.chipTextOn]}>
                  {c.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
      {view === 'category' ? (
        <View style={styles.chips}>
          {categories.map(c => {
            const on = category === c;
            return (
              <Pressable
                key={c}
                onPress={() => setCategory(c)}
                style={[styles.chip, on && styles.chipOn]}>
                <Text style={[styles.chipText, on && styles.chipTextOn]}>
                  {c}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {view === 'purchase' ? (
        <FlatList
          data={purchases}
          keyExtractor={l => String(l.id)}
          contentContainerStyle={[
            styles.list,
            purchases.length === 0 && styles.listEmpty,
          ]}
          ListEmptyComponent={
            <FeatureEmptyGuide
              HeroIcon={History}
              title="Nenhuma compra no histórico"
              subtitle="Importe uma nota antiga ou finalize uma compra para ver o resumo aqui."
              stepsLabel="Como agrupar"
              steps={[
                {
                  n: '1',
                  title: 'Por compra',
                  text: 'Cada nota ou lista finalizada aparece com mercado, data e total.',
                  Icon: History,
                },
                {
                  n: '2',
                  title: 'Por categoria',
                  text: 'Os itens se agrupam em hortifruti, mercearia, limpeza e outras.',
                  Icon: TrendingDown,
                },
                {
                  n: '3',
                  title: 'Por preço',
                  text: 'Compare o último preço com o menor que você já viu.',
                  Icon: ScanLine,
                },
              ]}
              PrimaryIcon={ScanLine}
              primaryLabel="Importar nota"
              onPrimary={() => nav.navigate('ImportPurchase')}
              secondaryLabel="Ir para Compras"
              onSecondary={() => nav.navigate('Main', {screen: 'Lists'})}
            />
          }
          renderItem={({item}) => (
            <SoftCard onPress={() => setOpenList(item)} style={styles.productCard}>
              <View style={styles.row}>
                <View style={{flex: 1, minWidth: 0}}>
                  <Text style={styles.name} numberOfLines={1}>
                    {item.marketName || item.name}
                  </Text>
                  <Text style={styles.muted}>
                    {formatWhen(item.finishedAt)} · {item.itemCount} itens
                  </Text>
                </View>
                <Text style={styles.price}>{formatBrl(item.subtotal)}</Text>
              </View>
            </SoftCard>
          )}
        />
      ) : null}

      {view === 'category' ? (
        <FlatList
          data={byCategory}
          keyExtractor={([cat]) => cat}
          contentContainerStyle={styles.list}
          renderItem={({item: [cat, group]}) => (
            <View style={styles.group}>
              <Text style={styles.groupTitle}>
                {cat} · {group.length}
              </Text>
              {group.map(row => (
                <SoftCard
                  key={row.product.id}
                  onPress={() =>
                    nav.navigate('ProductDetail', {productId: row.product.id})
                  }
                  style={styles.productCard}>
                  <View style={styles.row}>
                    <Text style={[styles.name, {flex: 1}]} numberOfLines={1}>
                      {row.product.name}
                    </Text>
                    {row.stats ? (
                      <Text style={styles.price}>{formatBrl(row.stats.lastPrice)}</Text>
                    ) : null}
                  </View>
                </SoftCard>
              ))}
            </View>
          )}
        />
      ) : null}

      {view === 'price' ? (
      <FlatList
        data={filtered}
        keyExtractor={r => String(r.product.id)}
        contentContainerStyle={[
          styles.list,
          filtered.length === 0 && styles.listEmpty,
        ]}
        ListEmptyComponent={
          <FeatureEmptyGuide
            HeroIcon={History}
            title="Nada no histórico ainda"
            subtitle="Aqui você acompanha evolução de preço dos produtos que já registrou."
            stepsLabel="O que é esta tela"
            steps={[
              {
                n: '1',
                title: 'Produtos com preço',
                text: 'Itens que você já capturou entram neste histórico.',
                Icon: History,
              },
              {
                n: '2',
                title: 'Último vs menor',
                text: 'Compare o preço atual com a mínima que você já viu.',
                Icon: TrendingDown,
              },
              {
                n: '3',
                title: 'Abra o detalhe',
                text: 'Toque em um produto para ver a linha do tempo de preços.',
                Icon: ScanLine,
              },
            ]}
            PrimaryIcon={ScanLine}
            primaryLabel="Registrar um preço"
            onPrimary={() => nav.navigate('Main', {screen: 'Capture'})}
            secondaryLabel="Ir para Compras"
            onSecondary={() => nav.navigate('Main', {screen: 'Lists'})}
          />
        }
        renderItem={({item}) => {
          const {product, stats, atLowest, pct} = item;
          return (
            <SoftCard
              onPress={() =>
                nav.navigate('ProductDetail', {productId: product.id})
              }
              style={styles.productCard}>
              <View style={styles.row}>
                <View style={{flex: 1, minWidth: 0}}>
                  <Text style={styles.name} numberOfLines={2}>
                    {product.name}
                  </Text>
                  {stats ? (
                    <Text style={styles.muted}>
                      Menor já visto {formatBrl(stats.minPrice)}
                    </Text>
                  ) : (
                    <Text style={styles.muted}>Sem registros</Text>
                  )}
                </View>
                <View style={styles.rightCol}>
                  {stats ? (
                    <Text style={styles.price}>
                      {formatBrl(stats.lastPrice)}
                    </Text>
                  ) : null}
                  {stats && atLowest ? (
                    <SavePill label="Menor preço" />
                  ) : stats && pct > 0 ? (
                    <SavePill
                      label={`+${pct >= 10 ? Math.round(pct) : pct.toFixed(1).replace('.', ',')}%`}
                      tone="orange"
                    />
                  ) : null}
                </View>
              </View>
            </SoftCard>
          );
        }}
      />
      ) : null}
      <KeyboardSafeSheet visible={openList != null} onClose={() => setOpenList(null)}>
        {openList ? (
          <>
            <Text style={styles.groupTitle}>{openList.marketName || openList.name}</Text>
            <Text style={styles.muted}>
              {formatWhen(openList.finishedAt)} · {formatBrl(openList.subtotal)}
            </Text>
            <FlatList
              data={openItems}
              keyExtractor={(it, i) => `${it.productId}-${i}`}
              style={{maxHeight: 360, marginTop: 12}}
              renderItem={({item}) => (
                <View style={styles.detailRow}>
                  <View style={{flex: 1}}>
                    <Text style={styles.name}>{item.productName}</Text>
                    <Text style={styles.muted}>
                      {item.productName
                        ? guessCategory(item.productName)
                        : 'Outros'}{' '}
                      · {formatQty(item.quantity)} × {formatBrl(item.retailPrice)}
                    </Text>
                  </View>
                  <Text style={styles.price}>{formatBrl(lineTotal(item))}</Text>
                </View>
              )}
            />
          </>
        ) : null}
      </KeyboardSafeSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: colors.bg},
  searchWrap: {paddingHorizontal: space.md, marginBottom: space.sm},
  search: {
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
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: space.md,
    marginBottom: space.sm,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radii.pill,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipOn: {
    backgroundColor: colors.yellow,
    borderColor: colors.yellow,
  },
  chipText: {fontWeight: '800', color: colors.navy, fontSize: 13},
  chipTextOn: {color: colors.navy},
  list: {paddingHorizontal: space.md, paddingBottom: 40, gap: space.sm},
  listEmpty: {
    flexGrow: 1,
    paddingBottom: spacing.bottomNavClearance,
  },
  productCard: {marginBottom: space.sm},
  row: {flexDirection: 'row', alignItems: 'flex-start', gap: 10},
  name: {fontWeight: '900', color: colors.navy, fontSize: 15},
  muted: {color: colors.muted, marginTop: 4, fontWeight: '600', fontSize: 12},
  rightCol: {alignItems: 'flex-end', gap: 6},
  price: {fontWeight: '900', color: colors.navy, fontSize: 18},
  group: {marginBottom: space.md},
  groupTitle: {fontWeight: '900', color: colors.navy, fontSize: 16, marginBottom: 8},
  detailRow: {
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
});

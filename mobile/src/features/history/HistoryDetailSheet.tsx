import React, {useMemo, useState} from 'react';
import {Pressable, ScrollView, StyleSheet, Text, TextInput, View} from 'react-native';
import {Receipt, Search, Trash2, X} from 'lucide-react-native';
import {KeyboardSafeSheet} from '@/ui/keyboardSheet';
import {colors, radii, space} from '@/ui/theme';
import {formatBrl, formatQty} from '@/domain/money';
import {resolveCategory} from '@/domain/productCategory';
import {isFiscalList} from '@/domain/fiscal';
import {lineSavings, lineTotal} from '@/domain/pricing';
import type {CartItem, Product, ShoppingList} from '@/data/types';
import {categoryTone} from './categoryTone';
import {CategoryIcon} from './categoryIcon';

function parseItems(list: ShoppingList): CartItem[] {
  try {
    const raw = JSON.parse(list.itemsJson) as CartItem[];
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function itemCategory(item: CartItem, products: Product[]): string {
  const stored = products.find(p => p.id === item.productId)?.category?.trim();
  return resolveCategory(stored, item.productName);
}

function formatWhen(iso: string) {
  const d = new Date(iso);
  const month = d.toLocaleDateString('pt-BR', {month: 'short'}).replace('.', '');
  return `${d.getDate()} ${month}, ${d.getFullYear()}`;
}

export function HistoryDetailSheet({
  list,
  products,
  onClose,
  onDelete,
  onReadNote,
}: {
  list: ShoppingList | null;
  products: Product[];
  onClose: () => void;
  onDelete: (list: ShoppingList) => void;
  onReadNote: (list: ShoppingList) => void;
}) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('Todas');
  const items = useMemo(() => (list ? parseItems(list) : []), [list]);
  const categories = useMemo(() => {
    const set = new Set(items.map(it => itemCategory(it, products)));
    return ['Todas', ...Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'))];
  }, [items, products]);
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter(it => {
      const cat = itemCategory(it, products);
      if (category !== 'Todas' && cat !== category) return false;
      if (q && !it.productName.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [items, products, query, category]);
  const byCategory = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of items) {
      const cat = itemCategory(item, products);
      counts.set(cat, (counts.get(cat) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [items, products]);
  const discount = useMemo(
    () => items.reduce((sum, item) => sum + lineSavings(item), 0),
    [items],
  );
  const maxCount = Math.max(...byCategory.map(([, count]) => count), 1);

  return (
    <KeyboardSafeSheet
      visible={list != null}
      onClose={() => {
        setQuery('');
        setCategory('Todas');
        onClose();
      }}>
      {list ? (
        <>
          <View style={styles.sheetHeader}>
            <View style={{flex: 1, marginRight: 8}}>
              <Text style={styles.title} numberOfLines={1}>
                {list.marketName || list.name}
              </Text>
              <Text style={styles.sub}>{formatWhen(list.finishedAt)}</Text>
            </View>
            <Pressable
              onPress={() => onDelete(list)}
              hitSlop={8}
              style={styles.deleteHeaderBtn}
              accessibilityLabel="Remover do histórico">
              <Trash2 size={18} color={colors.danger} />
            </Pressable>
          </View>

          <View style={styles.chart}>
            <View style={styles.chartHeaderRow}>
              <View>
                <Text style={styles.chartLabel}>TOTAL DA COMPRA</Text>
                <Text style={styles.chartPrice}>{formatBrl(list.subtotal)}</Text>
              </View>
              <View style={styles.chartMeta}>
                <View style={styles.chartBadge}>
                  <Text style={styles.chartCount}>
                    {items.length} {items.length === 1 ? 'item' : 'itens'}
                  </Text>
                </View>
                {discount > 0 ? (
                  <Text style={styles.chartSave}>
                    Economia {formatBrl(discount)}
                  </Text>
                ) : null}
              </View>
            </View>

            {byCategory.slice(0, 3).map(([name, count]) => (
              <View key={name} style={styles.chartRow}>
                <CategoryIcon name={name} size={12} />
                <Text style={styles.chartName} numberOfLines={1}>
                  {name}
                </Text>
                <View style={styles.chartTrack}>
                  <View
                    style={[
                      styles.chartFill,
                      {width: `${Math.max(8, (count / maxCount) * 100)}%`},
                    ]}
                  />
                </View>
                <Text style={styles.chartQty}>{count}</Text>
              </View>
            ))}
          </View>

          <View style={styles.searchBar}>
            <Search size={15} color={colors.muted} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Buscar item nesta compra…"
              placeholderTextColor={colors.muted}
              style={styles.search}
            />
            {query ? (
              <Pressable onPress={() => setQuery('')} hitSlop={8}>
                <X size={15} color={colors.navy} />
              </Pressable>
            ) : null}
          </View>

          <ScrollView
            horizontal
            nestedScrollEnabled
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chips}>
            {categories.map(name => {
              const on = category === name;
              const tone = name === 'Todas' ? null : categoryTone(name);
              return (
                <Pressable
                  key={name}
                  onPress={() => setCategory(name)}
                  style={[
                    styles.chip,
                    tone && {backgroundColor: tone.bg, borderColor: tone.bg},
                    on && styles.chipOn,
                    on && tone && {backgroundColor: tone.fg, borderColor: tone.fg},
                  ]}>
                  <Text
                    style={[
                      styles.chipText,
                      tone && {color: tone.fg},
                      on && styles.chipTextOn,
                    ]}>
                    {name}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {visible.map((item, index) => {
            const cat = itemCategory(item, products);
            return (
              <View key={`${item.productId}-${index}`} style={styles.card}>
                <View style={styles.icon}>
                  <Receipt size={14} color={colors.navy} />
                </View>
                <View style={styles.body}>
                  <Text style={styles.name} numberOfLines={1}>
                    {item.productName}
                  </Text>
                  <View style={styles.metaRow}>
                    <Text style={styles.meta} numberOfLines={1}>
                      {formatQty(item.quantity)} × {formatBrl(item.retailPrice)}
                    </Text>
                    <CategoryIcon name={cat} size={11} />
                  </View>
                </View>
                <Text style={styles.price}>{formatBrl(lineTotal(item))}</Text>
              </View>
            );
          })}
          {visible.length === 0 ? (
            <Text style={styles.empty}>Nenhum item neste filtro.</Text>
          ) : null}
          {!isFiscalList(list) ? (
            <Pressable style={styles.readNote} onPress={() => onReadNote(list)}>
              <Text style={styles.readNoteText}>Cadastrar nota fiscal</Text>
            </Pressable>
          ) : null}
        </>
      ) : null}
    </KeyboardSafeSheet>
  );
}

const styles = StyleSheet.create({
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  title: {fontWeight: '900', color: colors.navy, fontSize: 20},
  sub: {color: colors.muted, fontWeight: '700', fontSize: 12},
  deleteHeaderBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chart: {
    backgroundColor: colors.bg,
    borderRadius: 16,
    padding: 10,
    gap: 6,
    marginVertical: 4,
  },
  chartHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  chartLabel: {
    fontSize: 9,
    fontWeight: '900',
    color: colors.muted,
    letterSpacing: 0.5,
  },
  chartPrice: {fontSize: 22, fontWeight: '900', color: colors.navy, letterSpacing: -0.5},
  chartMeta: {alignItems: 'flex-end', gap: 2},
  chartBadge: {
    backgroundColor: '#fff',
    borderRadius: radii.pill,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  chartCount: {fontWeight: '800', color: colors.ink, fontSize: 11},
  chartSave: {fontWeight: '800', color: colors.trustGreen, fontSize: 11},
  chartRow: {flexDirection: 'row', alignItems: 'center', gap: 6},
  chartName: {width: 80, fontSize: 11, fontWeight: '700', color: colors.ink},
  chartTrack: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.white,
    overflow: 'hidden',
  },
  chartFill: {height: '100%', borderRadius: 3, backgroundColor: colors.navy},
  chartQty: {width: 16, textAlign: 'right', fontWeight: '800', color: colors.navy, fontSize: 11},
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bg,
    borderRadius: radii.pill,
    paddingHorizontal: space.sm,
    height: 38,
    gap: 6,
    marginVertical: 4,
  },
  search: {
    flex: 1,
    height: 38,
    paddingVertical: 0,
    fontSize: 13,
    fontWeight: '600',
    color: colors.ink,
  },
  chips: {gap: 6, paddingVertical: 2},
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radii.pill,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.bg,
  },
  chipOn: {backgroundColor: colors.navy, borderColor: colors.navy},
  chipText: {fontWeight: '800', color: colors.navy, fontSize: 12},
  chipTextOn: {color: colors.white},
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bg,
    borderRadius: 12,
    paddingVertical: 6,
    paddingHorizontal: 10,
    gap: 8,
    marginBottom: 4,
  },
  icon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: colors.white,
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
  empty: {color: colors.muted, fontWeight: '700', textAlign: 'center', marginTop: 8},
  readNote: {
    marginTop: 12,
    borderRadius: radii.pill,
    backgroundColor: colors.yellow,
    paddingVertical: 12,
    alignItems: 'center',
  },
  readNoteText: {fontWeight: '900', color: colors.navy},
  remove: {
    marginTop: 12,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.danger,
    paddingVertical: 12,
    alignItems: 'center',
  },
  removeText: {color: colors.danger, fontWeight: '800'},
});

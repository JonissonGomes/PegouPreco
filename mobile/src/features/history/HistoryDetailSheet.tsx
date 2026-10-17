import React, {useMemo, useState} from 'react';
import {Pressable, ScrollView, StyleSheet, Text, TextInput, View} from 'react-native';
import {Receipt} from 'lucide-react-native';
import {KeyboardSafeSheet} from '@/ui/keyboardSheet';
import {colors, radii, space} from '@/ui/theme';
import {formatBrl, formatQty} from '@/domain/money';
import {resolveCategory} from '@/domain/productCategory';
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
}: {
  list: ShoppingList | null;
  products: Product[];
  onClose: () => void;
  onDelete: (list: ShoppingList) => void;
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
          <Text style={styles.title}>{list.marketName || list.name}</Text>
          <Text style={styles.sub}>
            {formatWhen(list.finishedAt)}
          </Text>
          <View style={styles.chart}>
            <Text style={styles.chartPrice}>{formatBrl(list.subtotal)}</Text>
            <Text style={styles.chartCount}>
              {items.length} {items.length === 1 ? 'item' : 'itens'}
            </Text>
            {discount > 0 ? (
              <Text style={styles.chartSave}>
                Desconto {formatBrl(discount)}
              </Text>
            ) : null}
            {byCategory.slice(0, 4).map(([name, count]) => (
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
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Buscar item"
            placeholderTextColor={colors.muted}
            style={styles.search}
          />
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
                    <CategoryIcon name={cat} size={12} />
                  </View>
                </View>
                <Text style={styles.price}>{formatBrl(lineTotal(item))}</Text>
              </View>
            );
          })}
          {visible.length === 0 ? (
            <Text style={styles.empty}>Nenhum item neste filtro.</Text>
          ) : null}
          <Pressable
            style={styles.remove}
            onPress={() => onDelete(list)}>
            <Text style={styles.removeText}>Remover do histórico</Text>
          </Pressable>
        </>
      ) : null}
    </KeyboardSafeSheet>
  );
}

const styles = StyleSheet.create({
  title: {fontWeight: '900', color: colors.navy, fontSize: 22},
  sub: {color: colors.muted, fontWeight: '700', marginBottom: 4},
  chart: {
    backgroundColor: colors.bg,
    borderRadius: 16,
    padding: 12,
    gap: 8,
  },
  chartPrice: {fontSize: 28, fontWeight: '900', color: colors.navy},
  chartCount: {fontWeight: '800', color: colors.ink},
  chartSave: {fontWeight: '800', color: colors.trustGreen},
  chartRow: {flexDirection: 'row', alignItems: 'center', gap: 6},
  chartName: {width: 88, fontSize: 12, fontWeight: '700', color: colors.ink},
  chartTrack: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.white,
    overflow: 'hidden',
  },
  chartFill: {height: '100%', borderRadius: 4, backgroundColor: colors.navy},
  chartQty: {width: 18, textAlign: 'right', fontWeight: '800', color: colors.navy, fontSize: 12},
  search: {
    height: 44,
    backgroundColor: colors.bg,
    borderRadius: radii.pill,
    paddingHorizontal: space.md,
    fontSize: 15,
    fontWeight: '600',
    color: colors.ink,
  },
  chips: {gap: 8, paddingVertical: 4},
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radii.pill,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.bg,
  },
  chipOn: {backgroundColor: colors.navy, borderColor: colors.navy},
  chipText: {fontWeight: '800', color: colors.navy, fontSize: 13},
  chipTextOn: {color: colors.white},
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bg,
    borderRadius: 14,
    paddingVertical: 8,
    paddingHorizontal: 10,
    gap: 8,
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

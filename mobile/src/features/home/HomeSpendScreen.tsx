import React, {useCallback, useMemo, useState} from 'react';
import {Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import {useFocusEffect, useNavigation, useRoute} from '@react-navigation/native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {ArrowLeft} from 'lucide-react-native';
import {formatBrl, formatQty} from '@/domain/money';
import {resolveCategory} from '@/domain/productCategory';
import {lineTotal} from '@/domain/pricing';
import {isFiscalList, isFiscalLog} from '@/domain/fiscal';
import {buildHomeDash, type HomePeriodDays} from '@/domain/homeDashboard';
import {
  cheaperCategories,
  pointsFromLists,
  pointsFromLogs,
} from '@/domain/purchaseInsights';
import {CategoryIcon} from '@/features/history/categoryIcon';
import {HomeCheaperChart} from '@/features/home/HomeCheaperChart';
import {HomeSpendBoard} from '@/features/home/HomeSpendBoard';
import {priceLogRepo, useAppStore} from '@/store/appStore';
import {colors, space} from '@/ui/theme';
import type {CartItem, ShoppingList} from '@/data/types';

type Params = {
  period: HomePeriodDays;
  marketId: number | null;
  categories?: string[];
  category?: string | null;
};

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
  const month = d.toLocaleDateString('pt-BR', {month: 'short'}).replace('.', '');
  return `${d.getDate()} ${month}`;
}

export function HomeSpendScreen() {
  const nav = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const route = useRoute();
  const params = (route.params ?? {}) as Partial<Params>;
  const period = params.period ?? 30;
  const marketId = params.marketId ?? null;
  const categories =
    params.categories ??
    (params.category ? [params.category] : []);
  const lists = useAppStore(s => s.lists);
  const products = useAppStore(s => s.products);
  const logs = useMemo(() => priceLogRepo.all(), [lists, products]);
  const [play, setPlay] = useState(0);
  useFocusEffect(
    useCallback(() => {
      setPlay(n => n + 1);
    }, []),
  );
  const dash = useMemo(
    () => buildHomeDash(lists, products, period, marketId, categories, logs),
    [lists, products, period, marketId, categories, logs],
  );
  const dearest = useMemo(() => {
    let best: {market: string; total: number} | null = null;
    for (const list of dash.purchases) {
      for (const item of parseItems(list)) {
        const stored = products.find(p => p.id === item.productId)?.category?.trim();
        const cat = resolveCategory(stored, item.productName);
        if (categories.length > 0 && !categories.includes(cat)) continue;
        const total = lineTotal(item);
        if (!best || total > best.total) {
          best = {market: list.marketName || list.name, total};
        }
      }
    }
    return best;
  }, [dash.purchases, products, categories]);
  const cheaper = useMemo(() => {
    const receipts = lists.filter(isFiscalList);
    const fiscalLogs = logs.filter(isFiscalLog);
    const purchases = pointsFromLists(receipts, products);
    return cheaperCategories(
      purchases,
      [...purchases, ...pointsFromLogs(fiscalLogs, products)],
      7,
    ).filter(item => categories.length === 0 || categories.includes(item.category));
  }, [lists, products, logs, categories]);

  return (
    <View style={[styles.root, {paddingTop: insets.top + 8}]}>
      <View style={styles.header}>
        <Pressable style={styles.back} onPress={() => nav.goBack()}>
          <ArrowLeft size={20} color={colors.navy} />
        </Pressable>
        <Text style={styles.title}>Gastos</Text>
      </View>
      <ScrollView contentContainerStyle={{paddingBottom: insets.bottom + 24}}>
        <HomeSpendBoard dash={dash} period={period} play={play} />
        <HomeCheaperChart items={cheaper} play={play} />
        <Text style={styles.section}>
          {categories.length ? categories.join(' · ') : 'Todas as notas'}
        </Text>
        <View style={styles.summary}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Total</Text>
            <Text style={styles.summaryValue}>{formatBrl(dash.spent)}</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Mais cara</Text>
            <Text style={styles.summaryValue} numberOfLines={1}>
              {dearest
                ? `${dearest.market} · ${formatBrl(dearest.total)}`
                : '—'}
            </Text>
          </View>
        </View>
        {dash.purchases.length === 0 ? (
          <Text style={styles.empty}>Nenhuma compra neste filtro.</Text>
        ) : (
          dash.purchases.map(list => (
            <View key={list.id} style={styles.purchase}>
              <View style={styles.purchaseHead}>
                <View style={{flex: 1}}>
                  <Text style={styles.market} numberOfLines={1}>
                    {list.marketName || list.name}
                  </Text>
                  <Text style={styles.meta}>
                    {formatWhen(list.finishedAt)} · {list.itemCount} itens
                  </Text>
                </View>
                <Text style={styles.total}>{formatBrl(list.subtotal)}</Text>
              </View>
              {parseItems(list).map((item, index) => {
                const stored = products.find(p => p.id === item.productId)?.category?.trim();
                const cat = resolveCategory(stored, item.productName);
                if (categories.length > 0 && !categories.includes(cat)) return null;
                return (
                  <View key={`${item.productId}-${index}`} style={styles.line}>
                    <CategoryIcon name={cat} />
                    <View style={{flex: 1}}>
                      <Text style={styles.item} numberOfLines={1}>
                        {item.productName}
                      </Text>
                      <Text style={styles.meta}>
                        {formatQty(item.quantity)} × {formatBrl(item.retailPrice)}
                      </Text>
                    </View>
                    <Text style={styles.linePrice}>{formatBrl(lineTotal(item))}</Text>
                  </View>
                );
              })}
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: colors.bg},
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: space.md,
    marginBottom: space.sm,
  },
  back: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {fontSize: 22, fontWeight: '900', color: colors.navy},
  section: {
    marginHorizontal: space.md,
    marginBottom: space.sm,
    fontSize: 18,
    fontWeight: '900',
    color: colors.navy,
  },
  summary: {
    flexDirection: 'row',
    gap: 8,
    marginHorizontal: space.md,
    marginBottom: space.md,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: 16,
    padding: 12,
    gap: 4,
  },
  summaryLabel: {fontSize: 12, fontWeight: '800', color: colors.muted},
  summaryValue: {fontSize: 14, fontWeight: '900', color: colors.navy},
  empty: {marginHorizontal: space.md, color: colors.muted, fontWeight: '700'},
  purchase: {
    marginHorizontal: space.md,
    marginBottom: 12,
    backgroundColor: colors.white,
    borderRadius: 20,
    padding: 14,
    gap: 10,
  },
  purchaseHead: {flexDirection: 'row', alignItems: 'flex-start', gap: 8},
  market: {fontWeight: '900', color: colors.navy, fontSize: 15},
  meta: {color: colors.muted, fontWeight: '600', fontSize: 12, marginTop: 2},
  total: {fontWeight: '900', color: colors.navy, fontSize: 16},
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  item: {fontWeight: '800', color: colors.ink, fontSize: 14},
  lineRight: {alignItems: 'flex-end', gap: 4},
  linePrice: {fontWeight: '900', color: colors.navy},
});

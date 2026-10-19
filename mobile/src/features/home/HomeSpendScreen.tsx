import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import {useFocusEffect, useNavigation, useRoute} from '@react-navigation/native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {ArrowLeft, ChevronDown, SlidersHorizontal} from 'lucide-react-native';
import {formatBrl, formatQty} from '@/domain/money';
import {PRODUCT_CATEGORIES, resolveCategory} from '@/domain/productCategory';
import {lineTotal} from '@/domain/pricing';
import {
  buildHomeDash,
  calendarRange,
  spendSpanLabel,
  type HomePeriodDays,
  type SpendSpan,
} from '@/domain/homeDashboard';
import {CategoryIcon} from '@/features/history/categoryIcon';
import {HomeFilterSheet} from '@/features/home/HomeFilterSheet';
import {SpendOverview} from '@/features/home/SpendOverview';
import {priceLogRepo, useAppStore} from '@/store/appStore';
import {colors, space} from '@/ui/theme';
import {useClearOnBlur} from '@/ui/useClearOnBlur';
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

function spanOf(period: HomePeriodDays): SpendSpan {
  if (period === 7) return 'week';
  if (period === 90) return 'quarter';
  return 'month';
}

function periodOf(span: SpendSpan): HomePeriodDays {
  if (span === 'week') return 7;
  if (span === 'quarter') return 90;
  return 30;
}

function monthStart(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date: Date, delta: number) {
  return new Date(date.getFullYear(), date.getMonth() + delta, 1);
}

function monthName(date: Date, length: 'long' | 'short') {
  const raw = date
    .toLocaleDateString('pt-BR', {month: length})
    .replace('.', '');
  return raw.charAt(0).toUpperCase() + raw.slice(1);
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
  const [period, setPeriod] = useState<HomePeriodDays>(params.period ?? 30);
  const [span, setSpan] = useState<SpendSpan>(spanOf(params.period ?? 30));
  const [month, setMonth] = useState(() => monthStart(new Date()));
  const [marketId, setMarketId] = useState<number | null>(params.marketId ?? null);
  const [categories, setCategories] = useState<string[]>(
    params.categories ?? (params.category ? [params.category] : []),
  );
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [play, setPlay] = useState(0);
  const [openPurchaseId, setOpenPurchaseId] = useState<number | null>(null);
  const lists = useAppStore(s => s.lists);
  const products = useAppStore(s => s.products);
  const markets = useAppStore(s => s.markets);
  const logs = useMemo(() => priceLogRepo.all(), [lists, products]);
  useEffect(() => {
    const nextPeriod = params.period ?? 30;
    setPeriod(nextPeriod);
    setSpan(spanOf(nextPeriod));
    setMarketId(params.marketId ?? null);
    setCategories(params.categories ?? (params.category ? [params.category] : []));
  }, [params.period, params.marketId, params.category, params.categories]);
  useFocusEffect(
    useCallback(() => {
      setPlay(value => value + 1);
    }, [month, span]),
  );
  useClearOnBlur(() => {
    setPeriod(30);
    setSpan('month');
    setMonth(monthStart(new Date()));
    setMarketId(null);
    setCategories([]);
    setFiltersOpen(false);
    setOpenPurchaseId(null);
  });
  const range = useMemo(() => calendarRange(month, span), [month, span]);
  const dash = useMemo(
    () =>
      buildHomeDash(
        lists,
        products,
        period,
        marketId,
        categories,
        logs,
        Date.now(),
        range,
      ),
    [lists, products, period, marketId, categories, logs, range],
  );
  const previousMonth = addMonths(month, -1);
  const nextMonth = addMonths(month, 1);
  const canNext = nextMonth.getTime() <= monthStart(new Date()).getTime();
  const neighborSpent = useMemo(() => {
    const totalAt = (anchor: Date) =>
      buildHomeDash(
        lists,
        products,
        period,
        marketId,
        categories,
        logs,
        Date.now(),
        calendarRange(anchor, span),
      ).spent;
    return {
      previous: totalAt(previousMonth),
      next: canNext ? totalAt(nextMonth) : 0,
    };
  }, [
    lists,
    products,
    period,
    marketId,
    categories,
    logs,
    span,
    previousMonth,
    nextMonth,
    canNext,
  ]);
  const filterCount =
    (period !== 30 ? 1 : 0) + (marketId != null ? 1 : 0) + categories.length;

  return (
    <View style={[styles.root, {paddingTop: insets.top + 8}]}>
      <View style={styles.header}>
        <Pressable style={styles.back} onPress={() => nav.goBack()}>
          <ArrowLeft size={20} color={colors.navy} />
        </Pressable>
        <Text style={styles.title}>Gastos</Text>
        <Pressable style={styles.filterBtn} onPress={() => setFiltersOpen(true)}>
          <SlidersHorizontal size={16} color={colors.navy} />
          {filterCount > 0 ? (
            <View style={styles.filterBadge}>
              <Text style={styles.filterBadgeText}>{filterCount}</Text>
            </View>
          ) : null}
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={{paddingBottom: insets.bottom + 24}}>
        <SpendOverview
          dash={dash}
          span={span}
          selectedLabel={monthName(month, 'long')}
          previousLabel={monthName(previousMonth, 'short')}
          nextLabel={monthName(nextMonth, 'short')}
          previousTotal={neighborSpent.previous}
          nextTotal={neighborSpent.next}
          canNext={canNext}
          onSpan={next => {
            setSpan(next);
            setPeriod(periodOf(next));
          }}
          onPrevious={() => setMonth(previousMonth)}
          onNext={() => {
            if (canNext) setMonth(nextMonth);
          }}
          onOpenCategory={category =>
            setCategories(current =>
              current.length === 1 && current[0] === category ? [] : [category],
            )
          }
          play={play}
          periodLabel={spendSpanLabel(month, span)}
        />
        <Text style={styles.section}>
          {categories.length ? categories.join(' · ') : 'Compras do filtro'}
        </Text>
        {dash.purchases.length === 0 ? (
          <Text style={styles.empty}>Nenhuma compra neste filtro.</Text>
        ) : (
          dash.purchases.map(list => {
            const open = openPurchaseId === list.id;
            return (
            <View key={list.id} style={styles.purchase}>
              <Pressable
                style={styles.purchaseHead}
                onPress={() =>
                  setOpenPurchaseId(current => (current === list.id ? null : list.id))
                }>
                <View style={{flex: 1}}>
                  <Text style={styles.market} numberOfLines={1}>
                    {list.marketName || list.name}
                  </Text>
                  <Text style={styles.meta}>
                    {formatWhen(list.finishedAt)} · {list.itemCount} itens
                  </Text>
                </View>
                <Text style={styles.total}>{formatBrl(list.subtotal)}</Text>
                <ChevronDown
                  size={18}
                  color={colors.navy}
                  style={{transform: [{rotate: open ? '180deg' : '0deg'}]}}
                />
              </Pressable>
              {open ? parseItems(list).map((item, index) => {
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
              }) : null}
            </View>
            );
          })
        )}
      </ScrollView>
      <HomeFilterSheet
        visible={filtersOpen}
        period={period}
        marketId={marketId}
        category={categories}
        markets={markets.map(market => ({id: market.id, name: market.name}))}
        categories={[...PRODUCT_CATEGORIES]}
        onClose={() => setFiltersOpen(false)}
        onApply={next => {
          setPeriod(next.period);
          setMarketId(next.marketId);
          setCategories(next.category);
          setFiltersOpen(false);
        }}
      />
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
  title: {flex: 1, fontSize: 22, fontWeight: '900', color: colors.navy},
  filterBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.yellow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterBadgeText: {fontSize: 10, fontWeight: '900', color: colors.navy},
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

import React, {useMemo} from 'react';
import {Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import {useNavigation, useRoute} from '@react-navigation/native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {ArrowLeft} from 'lucide-react-native';
import {formatBrl, formatQty} from '@/domain/money';
import {guessCategory} from '@/domain/productCategory';
import {lineTotal} from '@/domain/pricing';
import {buildHomeDash, type HomePeriodDays} from '@/domain/homeDashboard';
import {HomeSpendBoard} from '@/features/home/HomeSpendBoard';
import {categoryTone} from '@/features/history/categoryTone';
import {priceLogRepo, useAppStore} from '@/store/appStore';
import {colors, radii, space} from '@/ui/theme';
import type {CartItem, ShoppingList} from '@/data/types';

type Params = {
  period: HomePeriodDays;
  marketId: number | null;
  category: string | null;
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
  const category = params.category ?? null;
  const lists = useAppStore(s => s.lists);
  const products = useAppStore(s => s.products);
  const logs = useMemo(() => priceLogRepo.all(), [lists, products]);
  const dash = useMemo(
    () => buildHomeDash(lists, products, period, marketId, category, logs),
    [lists, products, period, marketId, category, logs],
  );

  return (
    <View style={[styles.root, {paddingTop: insets.top + 8}]}>
      <View style={styles.header}>
        <Pressable style={styles.back} onPress={() => nav.goBack()}>
          <ArrowLeft size={20} color={colors.navy} />
        </Pressable>
        <Text style={styles.title}>Gastos</Text>
      </View>
      <ScrollView contentContainerStyle={{paddingBottom: insets.bottom + 24}}>
        <HomeSpendBoard dash={dash} period={period} />
        <Text style={styles.section}>Detalhes</Text>
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
                const cat = stored || guessCategory(item.productName);
                const tone = categoryTone(cat);
                return (
                  <View key={`${item.productId}-${index}`} style={styles.line}>
                    <View style={{flex: 1}}>
                      <Text style={styles.item} numberOfLines={2}>
                        {item.productName}
                      </Text>
                      <Text style={styles.meta}>
                        {formatQty(item.quantity)} × {formatBrl(item.retailPrice)}
                      </Text>
                    </View>
                    <View style={styles.lineRight}>
                      <Text style={styles.linePrice}>{formatBrl(lineTotal(item))}</Text>
                      <View style={[styles.pill, {backgroundColor: tone.bg}]}>
                        <Text style={[styles.pillText, {color: tone.fg}]}>{cat}</Text>
                      </View>
                    </View>
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
    gap: 10,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  item: {fontWeight: '800', color: colors.ink, fontSize: 14},
  lineRight: {alignItems: 'flex-end', gap: 4},
  linePrice: {fontWeight: '900', color: colors.navy},
  pill: {borderRadius: radii.pill, paddingHorizontal: 8, paddingVertical: 3},
  pillText: {fontSize: 11, fontWeight: '800'},
});

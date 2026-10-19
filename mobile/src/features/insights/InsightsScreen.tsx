import React, {useMemo, useState} from 'react';
import {Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {Minus, TrendingDown, TrendingUp} from 'lucide-react-native';
import {SoftCard, SoftHeader} from '@/ui/screenChrome';
import {CategoryIcon} from '@/features/history/categoryIcon';
import {colors, radii, space, spacing} from '@/ui/theme';
import {formatBrl} from '@/domain/money';
import {buildInsightBoard, type PriceTrend} from '@/domain/insightBoard';
import type {InsightPeriod} from '@/domain/homeInsights';
import {isFiscalList, isFiscalLog} from '@/domain/fiscal';
import {priceLogRepo, useAppStore} from '@/store/appStore';
import {useWeekdayBuyTip} from '@/features/home/useWeekdayBuyTip';
import {buyDayPhrase} from '@/domain/homeDashboard';
import {useClearOnBlur} from '@/ui/useClearOnBlur';

const PERIODS: Array<{id: InsightPeriod; label: string}> = [
  {id: 'week', label: '7 dias'},
  {id: 'month', label: '30 dias'},
  {id: 'all', label: 'Tudo'},
];

export function InsightsScreen() {
  const nav = useNavigation<any>();
  const lists = useAppStore(s => s.lists);
  const markets = useAppStore(s => s.markets);
  const products = useAppStore(s => s.products);
  const [period, setPeriod] = useState<InsightPeriod>('month');
  const auth = useAppStore(s => s.auth);
  const buyTip = useWeekdayBuyTip(lists, products, auth?.token);
  useClearOnBlur(() => setPeriod('month'));

  const board = useMemo(() => {
    const notes = lists.filter(isFiscalList);
    const logs = priceLogRepo.all().filter(isFiscalLog);
    return buildInsightBoard({lists: notes, logs, products, markets, period});
  }, [lists, markets, products, period]);

  const empty =
    board.averages.length === 0 &&
    board.rising.length === 0 &&
    board.places.length === 0;

  return (
    <View style={styles.root}>
      <SoftHeader
        title="Dicas"
        subtitle="Onde economizar, sem lista infinita"
      />
      <ScrollView
        contentContainerStyle={styles.pad}
        showsVerticalScrollIndicator={false}>
        <View style={styles.periods}>
          {PERIODS.map(item => {
            const on = period === item.id;
            return (
              <Pressable
                key={item.id}
                onPress={() => setPeriod(item.id)}
                style={[styles.period, on && styles.periodOn]}>
                <Text style={[styles.periodText, on && styles.periodTextOn]}>
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <SoftCard style={styles.hero}>
          <Text style={styles.kicker}>Sua economia</Text>
          <Text style={styles.heroValue}>
            {board.saved > 0 ? formatBrl(board.saved) : 'R$ 0,00'}
          </Text>
          <Text style={styles.heroHint}>
            {board.saved > 0
              ? 'Pago abaixo de outros preços do mesmo item.'
              : 'Aparece quando o mesmo item tiver dois preços.'}
          </Text>
        </SoftCard>

        {buyTip ? (
          <View style={styles.tipPill}>
            <Text style={styles.tipText}>{buyDayPhrase(buyTip)}</Text>
          </View>
        ) : null}

        <SoftCard>
          <Text style={styles.section}>Onde você encontrou mais economia</Text>
          {board.bestMarket ? (
            <>
              <Text style={[styles.place, styles.center]}>{board.bestMarket}</Text>
              {board.bestDetail ? (
                <Text style={[styles.hint, styles.center]}>{board.bestDetail}</Text>
              ) : null}
            </>
          ) : (
            <Text style={styles.hint}>Cadastre uma nota para ver o mercado da compra.</Text>
          )}
        </SoftCard>

        <SoftCard>
          <Text style={styles.section}>Onde e quando comprar</Text>
          {board.places.length === 0 ? (
            <Text style={styles.hint}>Sem categorias comparadas neste período.</Text>
          ) : (
            board.places.map(item => (
              <View key={item.category} style={styles.row}>
                <CategoryIcon name={item.category} />
                <View style={styles.rowBody}>
                  <Text style={styles.rowTitle} numberOfLines={1}>
                    {item.category}
                  </Text>
                  <Text style={styles.hint} numberOfLines={1}>
                    {item.marketName}
                  </Text>
                  {item.weekday && item.dateLabel ? (
                    <Text style={styles.when}>
                      {item.weekday}, {item.dateLabel}
                    </Text>
                  ) : null}
                </View>
                <TrendMark trend={item.trend} />
              </View>
            ))
          )}
        </SoftCard>

        <SoftCard>
          <Text style={styles.section}>Média de preço por categoria</Text>
          {board.averages.length === 0 ? (
            <Text style={styles.hint}>Ainda não há preços de nota neste período.</Text>
          ) : (
            board.averages.map(item => (
              <View key={item.category} style={styles.avgRow}>
                <CategoryIcon name={item.category} />
                <View style={styles.rowBody}>
                  <Text style={styles.rowTitle} numberOfLines={1}>
                    {item.category}
                  </Text>
                  <Text style={styles.hint} numberOfLines={2}>
                    mais barato em: {item.marketName}
                  </Text>
                </View>
                <Text style={styles.price}>
                  {item.low === item.high
                    ? formatBrl(item.low)
                    : `${formatBrl(item.low)} – ${formatBrl(item.high)}`}
                </Text>
              </View>
            ))
          )}
        </SoftCard>

        <SoftCard>
          <Text style={styles.section}>Itens que subiram</Text>
          {board.rising.length === 0 ? (
            <Text style={styles.hint}>Nenhum item subiu de preço.</Text>
          ) : (
            board.rising.map(item => (
              <Pressable
                key={item.productId}
                style={styles.row}
                onPress={() =>
                  nav.navigate('ProductDetail', {productId: item.productId})
                }>
                <View style={styles.riseBadge}>
                  <Text style={styles.riseText}>+{item.pct}%</Text>
                </View>
                <View style={styles.rowBody}>
                  <Text style={styles.rowTitle} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={styles.hint}>
                    {formatBrl(item.previous)} → {formatBrl(item.latest)}
                  </Text>
                </View>
              </Pressable>
            ))
          )}
        </SoftCard>

        {empty ? (
          <Text style={styles.footer}>
            As notas fiscais alimentam estes números.
          </Text>
        ) : null}
      </ScrollView>
    </View>
  );
}

function TrendMark({trend}: {trend: PriceTrend}) {
  if (trend === 'down') {
    return (
      <View style={[styles.mark, styles.markDown]}>
        <TrendingDown size={16} color={colors.trustGreen} />
      </View>
    );
  }
  if (trend === 'up') {
    return (
      <View style={[styles.mark, styles.markUp]}>
        <TrendingUp size={16} color={colors.danger} />
      </View>
    );
  }
  return (
    <View style={[styles.mark, styles.markFlat]}>
      <Minus size={16} color={colors.muted} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: colors.bg},
  pad: {
    padding: space.md,
    paddingBottom: spacing.bottomNavClearance,
    gap: 12,
  },
  tipPill: {
    alignSelf: 'stretch',
    backgroundColor: '#FFF6D8',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  tipText: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.navy,
    textAlign: 'center',
  },
  periods: {flexDirection: 'row', gap: 8},
  period: {
    borderRadius: radii.pill,
    backgroundColor: colors.white,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  periodOn: {backgroundColor: colors.navy},
  periodText: {fontWeight: '800', color: colors.ink, fontSize: 13},
  periodTextOn: {color: colors.white},
  hero: {backgroundColor: colors.navy},
  kicker: {
    color: colors.yellow,
    fontWeight: '800',
    fontSize: 12,
    letterSpacing: 0.3,
  },
  heroValue: {
    marginTop: 4,
    color: colors.white,
    fontSize: 32,
    fontWeight: '900',
  },
  heroHint: {
    marginTop: 6,
    color: '#D6E2F5',
    fontWeight: '600',
    lineHeight: 18,
  },
  section: {fontWeight: '900', color: colors.navy, fontSize: 16, marginBottom: 8},
  place: {fontWeight: '900', color: colors.ink, fontSize: 18},
  center: {textAlign: 'center'},
  hint: {color: colors.muted, fontWeight: '600', fontSize: 13, lineHeight: 18},
  row: {flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8},
  rowBody: {flex: 1, minWidth: 0},
  rowTitle: {flex: 1, fontWeight: '800', color: colors.navy, fontSize: 14},
  when: {marginTop: 2, fontWeight: '800', color: colors.navy, fontSize: 13},
  mark: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markDown: {backgroundColor: '#DCFCE7'},
  markUp: {backgroundColor: '#FEE2E2'},
  markFlat: {backgroundColor: colors.bg},
  avgRow: {flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8},
  price: {fontWeight: '900', color: colors.navy, fontSize: 13, textAlign: 'right'},
  riseBadge: {
    minWidth: 52,
    borderRadius: radii.pill,
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 8,
    paddingVertical: 6,
    alignItems: 'center',
  },
  riseText: {fontWeight: '900', color: colors.danger, fontSize: 12},
  footer: {
    color: colors.muted,
    fontWeight: '600',
    fontSize: 13,
    lineHeight: 18,
  },
});

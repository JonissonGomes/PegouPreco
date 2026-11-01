import React, {useMemo, useState} from 'react';
import {Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {Minus, TrendingDown, TrendingUp} from 'lucide-react-native';
import {SoftCard, SoftHeader} from '@/ui/screenChrome';
import {CategoryIcon} from '@/features/history/categoryIcon';
import {colors, radii, space, spacing} from '@/ui/theme';
import {PressableScale} from '@/ui/PressableScale';
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
              <PressableScale
                key={item.id}
                onPress={() => setPeriod(item.id)}
                activeScale={0.92}
                style={[styles.period, on && styles.periodOn]}>
                <Text style={[styles.periodText, on && styles.periodTextOn]}>
                  {item.label}
                </Text>
              </PressableScale>
            );
          })}
        </View>

        <View style={styles.heroRow}>
          <View style={[styles.heroCard, styles.heroCardMain]}>
            <Text style={styles.kicker}>SUA ECONOMIA</Text>
            <Text style={styles.heroValue}>
              {board.saved > 0 ? formatBrl(board.saved) : 'R$ 0,00'}
            </Text>
            <Text style={styles.heroHint} numberOfLines={2}>
              {board.saved > 0
                ? 'Economizado em itens comparados'
                : 'Aparece ao comparar notas'}
            </Text>
          </View>
          <View style={[styles.heroCard, styles.heroCardSec]}>
            <Text style={styles.kickerSec}>MELHOR MERCADO</Text>
            <Text style={styles.heroSecValue} numberOfLines={1}>
              {board.bestMarket ? board.bestMarket : '—'}
            </Text>
            <Text style={styles.heroHintSec} numberOfLines={2}>
              {board.bestDetail || 'Baseado em suas compras'}
            </Text>
          </View>
        </View>

        {buyTip ? (
          <View style={styles.tipPill}>
            <Text style={styles.tipText}>{buyDayPhrase(buyTip)}</Text>
          </View>
        ) : null}

        <SoftCard style={styles.cardPad}>
          <Text style={styles.section}>Onde e quando comprar</Text>
          {board.places.length === 0 ? (
            <Text style={styles.hint}>Sem categorias comparadas neste período.</Text>
          ) : (
            board.places.map(item => (
              <View key={item.category} style={styles.row}>
                <CategoryIcon name={item.category} size={14} />
                <View style={styles.rowBody}>
                  <Text style={styles.rowTitle} numberOfLines={1}>
                    {item.category}
                  </Text>
                  <Text style={styles.hint} numberOfLines={1}>
                    {item.marketName}
                    {item.weekday && item.dateLabel ? ` · ${item.weekday}` : ''}
                  </Text>
                </View>
                <TrendMark trend={item.trend} />
              </View>
            ))
          )}
        </SoftCard>

        <SoftCard style={styles.cardPad}>
          <Text style={styles.section}>Média de preço por categoria</Text>
          {board.averages.length === 0 ? (
            <Text style={styles.hint}>Ainda não há preços de nota neste período.</Text>
          ) : (
            board.averages.map(item => (
              <View key={item.category} style={styles.avgRow}>
                <CategoryIcon name={item.category} size={14} />
                <View style={styles.rowBody}>
                  <Text style={styles.rowTitle} numberOfLines={1}>
                    {item.category}
                  </Text>
                  <Text style={styles.hint} numberOfLines={1}>
                    menor: {item.marketName}
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

        <SoftCard style={styles.cardPad}>
          <Text style={styles.section}>Itens que subiram de preço</Text>
          {board.rising.length === 0 ? (
            <Text style={styles.hint}>Nenhum item subiu de preço no período.</Text>
          ) : (
            board.rising.map(item => (
              <PressableScale
                key={item.productId}
                style={styles.row}
                activeScale={0.96}
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
              </PressableScale>
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
  periods: {flexDirection: 'row', gap: 6},
  period: {
    borderRadius: radii.pill,
    backgroundColor: colors.white,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  periodOn: {backgroundColor: colors.navy},
  periodText: {fontWeight: '800', color: colors.ink, fontSize: 12},
  periodTextOn: {color: colors.white},
  heroRow: {flexDirection: 'row', gap: 10},
  heroCard: {
    flex: 1,
    borderRadius: radii.xl,
    padding: space.md,
    justifyContent: 'space-between',
    minHeight: 104,
  },
  heroCardMain: {
    backgroundColor: colors.navy,
  },
  heroCardSec: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: 'rgba(230, 235, 245, 0.9)',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: {width: 0, height: 2},
    elevation: 2,
  },
  kicker: {
    color: colors.yellow,
    fontWeight: '800',
    fontSize: 10,
    letterSpacing: 0.5,
  },
  kickerSec: {
    color: colors.muted,
    fontWeight: '800',
    fontSize: 10,
    letterSpacing: 0.5,
  },
  heroValue: {
    marginTop: 2,
    color: colors.white,
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  heroSecValue: {
    marginTop: 2,
    color: colors.navy,
    fontSize: 18,
    fontWeight: '900',
  },
  heroHint: {
    marginTop: 4,
    color: '#D6E2F5',
    fontWeight: '600',
    fontSize: 11,
    lineHeight: 14,
  },
  heroHintSec: {
    marginTop: 4,
    color: colors.muted,
    fontWeight: '600',
    fontSize: 11,
    lineHeight: 14,
  },
  cardPad: {
    padding: space.sm + 4,
  },
  section: {fontWeight: '900', color: colors.navy, fontSize: 15, marginBottom: 4},
  place: {fontWeight: '900', color: colors.ink, fontSize: 16},
  center: {textAlign: 'center'},
  hint: {color: colors.muted, fontWeight: '600', fontSize: 12, lineHeight: 16},
  row: {flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6},
  rowBody: {flex: 1, minWidth: 0},
  rowTitle: {flex: 1, fontWeight: '800', color: colors.navy, fontSize: 13},
  when: {marginTop: 1, fontWeight: '800', color: colors.navy, fontSize: 12},
  mark: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markDown: {backgroundColor: '#DCFCE7'},
  markUp: {backgroundColor: '#FEE2E2'},
  markFlat: {backgroundColor: colors.bg},
  avgRow: {flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6},
  price: {fontWeight: '900', color: colors.navy, fontSize: 12, textAlign: 'right'},
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

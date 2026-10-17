import React, {useMemo, useState} from 'react';
import {Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {SoftCard, SoftHeader} from '@/ui/screenChrome';
import {CategoryIcon} from '@/features/history/categoryIcon';
import {colors, radii, space, spacing} from '@/ui/theme';
import {formatBrl} from '@/domain/money';
import {buildInsightBoard} from '@/domain/insightBoard';
import type {InsightPeriod} from '@/domain/homeInsights';
import {isFiscalList, isFiscalLog} from '@/domain/fiscal';
import {priceLogRepo, useAppStore} from '@/store/appStore';

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
        title="Insights"
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
              ? 'Você pagou abaixo da média dos outros preços do mesmo item.'
              : 'Quando houver dois preços do mesmo item, a economia aparece aqui.'}
          </Text>
        </SoftCard>

        <SoftCard>
          <Text style={styles.section}>Onde você está mais econômico</Text>
          {board.bestMarket ? (
            <>
              <Text style={styles.place}>{board.bestMarket}</Text>
              {board.bestDetail ? (
                <Text style={styles.hint}>{board.bestDetail}</Text>
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
                  <Text style={styles.hint} numberOfLines={2}>
                    {item.marketName} · {item.when}
                  </Text>
                </View>
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
                <Text style={styles.rowTitle} numberOfLines={1}>
                  {item.category}
                </Text>
                <View style={styles.avgValue}>
                  <Text style={styles.price}>{formatBrl(item.avg)}</Text>
                  <Text style={styles.hint} numberOfLines={1}>
                    menor em {item.marketName}
                  </Text>
                </View>
              </View>
            ))
          )}
        </SoftCard>

        <SoftCard>
          <Text style={styles.section}>Itens que subiram</Text>
          {board.rising.length === 0 ? (
            <Text style={styles.hint}>
              Nenhum item subiu mais de 8% em relação ao preço anterior.
            </Text>
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
            Os insights usam as notas fiscais. Uma nota já mostra a média; duas do mesmo item mostram economia e alta.
          </Text>
        ) : null}
      </ScrollView>
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
  hint: {color: colors.muted, fontWeight: '600', fontSize: 13, lineHeight: 18},
  row: {flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8},
  rowBody: {flex: 1, minWidth: 0},
  rowTitle: {flex: 1, fontWeight: '800', color: colors.navy, fontSize: 14},
  avgRow: {flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8},
  avgValue: {alignItems: 'flex-end', maxWidth: 140},
  price: {fontWeight: '900', color: colors.navy},
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

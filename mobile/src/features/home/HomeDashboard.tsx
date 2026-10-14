import React from 'react';
import {Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import {formatBrl} from '@/domain/money';
import type {HomeDash, HomePeriodDays} from '@/domain/homeDashboard';
import type {ShoppingList} from '@/data/types';
import {colors, radii, space} from '@/ui/theme';
import {GrowBar, Reveal} from '@/ui/reveal';

const PERIODS: {days: HomePeriodDays; label: string}[] = [
  {days: 7, label: '7 dias'},
  {days: 30, label: '30 dias'},
  {days: 90, label: '90 dias'},
];

function Chip({
  label,
  on,
  onPress,
}: {
  label: string;
  on: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, on && styles.chipOn]}>
      <Text style={[styles.chipText, on && styles.chipTextOn]}>{label}</Text>
    </Pressable>
  );
}

function formatWhen(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('pt-BR', {day: '2-digit', month: 'short'});
}

export function HomeDashboard({
  dash,
  period,
  marketId,
  category,
  onPeriod,
  onMarket,
  onCategory,
  onOpenHistory,
  onOpenList,
}: {
  dash: HomeDash;
  period: HomePeriodDays;
  marketId: number | null;
  category: string | null;
  onPeriod: (days: HomePeriodDays) => void;
  onMarket: (id: number | null) => void;
  onCategory: (name: string | null) => void;
  onOpenHistory: () => void;
  onOpenList: (list: ShoppingList) => void;
}) {
  return (
    <View style={styles.wrap}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipRow}>
        {PERIODS.map(p => (
          <Chip
            key={p.days}
            label={p.label}
            on={period === p.days}
            onPress={() => onPeriod(p.days)}
          />
        ))}
      </ScrollView>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipRow}>
        <Chip
          label="Todos os mercados"
          on={marketId == null}
          onPress={() => onMarket(null)}
        />
        {dash.markets.map(m => (
          <Chip
            key={m.id}
            label={m.name}
            on={marketId === m.id}
            onPress={() => onMarket(m.id)}
          />
        ))}
      </ScrollView>

      {dash.categoryNames.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}>
          <Chip
            label="Todas as categorias"
            on={category == null}
            onPress={() => onCategory(null)}
          />
          {dash.categoryNames.map(name => (
            <Chip
              key={name}
              label={name}
              on={category === name}
              onPress={() => onCategory(name)}
            />
          ))}
        </ScrollView>
      ) : null}

      <Reveal delay={40}>
      <View style={styles.stats}>
        <View style={styles.stat}>
          <Text style={styles.statLabel}>Gasto</Text>
          <Text style={styles.statValue}>{formatBrl(dash.spent)}</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statLabel}>Economia</Text>
          <Text style={styles.statValue}>{formatBrl(dash.savings)}</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statLabel}>Compras</Text>
          <Text style={styles.statValue}>{dash.purchaseCount}</Text>
        </View>
      </View>
      </Reveal>

      {dash.categories.length > 0 ? (
        <Reveal delay={120}>
        <View style={styles.block}>
          <Text style={styles.blockTitle}>Por categoria</Text>
          {dash.categories.slice(0, 6).map((c, index) => {
            const max = Math.max(...dash.categories.map(row => row.total), 1);
            return (
              <View key={c.category} style={styles.catRow}>
                <View style={{flex: 1, gap: 4}}>
                  <Text style={styles.catName} numberOfLines={1}>
                    {c.category}
                  </Text>
                  <View style={styles.track}>
                    <GrowBar
                      ratio={c.total / max}
                      color={index === 0 ? colors.yellow : colors.navy}
                      delay={180 + index * 60}
                    />
                  </View>
                </View>
                <Text style={styles.catTotal}>{formatBrl(c.total)}</Text>
              </View>
            );
          })}
        </View>
        </Reveal>
      ) : null}

      <Reveal delay={200}>
      <View style={styles.block}>
        <View style={styles.blockHead}>
          <Text style={styles.blockTitle}>Últimas compras</Text>
          <Pressable onPress={onOpenHistory} hitSlop={8}>
            <Text style={styles.link}>Histórico</Text>
          </Pressable>
        </View>
        {dash.recent.length === 0 ? (
          <Text style={styles.empty}>Nenhuma compra nesse filtro.</Text>
        ) : (
          dash.recent.map(list => (
            <Pressable
              key={list.id}
              style={styles.purchase}
              onPress={() => onOpenList(list)}>
              <View style={{flex: 1}}>
                <Text style={styles.purchaseName} numberOfLines={1}>
                  {list.name}
                </Text>
                <Text style={styles.purchaseMeta} numberOfLines={1}>
                  {list.marketName || 'Mercado'} · {formatWhen(list.finishedAt)}
                </Text>
              </View>
              <Text style={styles.purchaseTotal}>{formatBrl(list.subtotal)}</Text>
            </Pressable>
          ))
        )}
      </View>
      </Reveal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {gap: 8, marginBottom: space.md},
  chipRow: {
    paddingHorizontal: space.md,
    gap: 8,
    flexDirection: 'row',
  },
  chip: {
    borderRadius: radii.pill,
    backgroundColor: colors.white,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipOn: {backgroundColor: colors.navy, borderColor: colors.navy},
  chipText: {fontSize: 12, fontWeight: '800', color: colors.navy},
  chipTextOn: {color: colors.white},
  stats: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: space.md,
    marginTop: 4,
  },
  stat: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    padding: 12,
    gap: 2,
  },
  statLabel: {fontSize: 11, fontWeight: '700', color: colors.muted},
  statValue: {fontSize: 15, fontWeight: '900', color: colors.navy},
  block: {
    marginHorizontal: space.md,
    backgroundColor: colors.white,
    borderRadius: radii.xl,
    padding: space.md,
    gap: 8,
  },
  blockHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  blockTitle: {fontSize: 16, fontWeight: '900', color: colors.navy},
  link: {fontSize: 13, fontWeight: '800', color: colors.navy},
  catRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  catName: {flex: 1, fontWeight: '700', color: colors.ink, fontSize: 14},
  catTotal: {fontWeight: '900', color: colors.navy, fontSize: 14},
  track: {
    height: 4,
    borderRadius: 4,
    backgroundColor: '#E5E7EB',
    overflow: 'hidden',
  },
  purchase: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 6,
  },
  purchaseName: {fontWeight: '900', color: colors.navy, fontSize: 14},
  purchaseMeta: {color: colors.muted, fontWeight: '600', fontSize: 12},
  purchaseTotal: {fontWeight: '900', color: colors.navy, fontSize: 14},
  empty: {color: colors.muted, fontWeight: '600', fontSize: 13},
});

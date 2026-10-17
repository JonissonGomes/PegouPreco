import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {formatBrl} from '@/domain/money';
import type {HomeDash} from '@/domain/homeDashboard';
import {CategoryIcon} from '@/features/history/categoryIcon';
import {paletteAt} from '@/ui/primaryColors';
import {colors, space} from '@/ui/theme';

/** Painel da tela de Gastos: barras de categoria e de período, sem o anel da Home. */
export function SpendOverview({dash}: {dash: HomeDash}) {
  const slices = dash.categories.slice(0, 6);
  const maxCat = Math.max(...slices.map(item => item.total), 1);
  const maxTrend = Math.max(...dash.trend.map(point => point.total), 1);
  const ticket =
    dash.purchaseCount > 0 ? dash.spent / dash.purchaseCount : 0;

  return (
    <View style={styles.wrap}>
      <View style={styles.metrics}>
        <Metric label="Gasto" value={formatBrl(dash.spent)} />
        <Metric label="Notas" value={String(dash.purchaseCount)} />
        <Metric label="Ticket" value={formatBrl(ticket)} />
      </View>
      <Text style={styles.title}>Valor por categoria</Text>
      {slices.length === 0 ? (
        <Text style={styles.empty}>Nenhuma categoria neste filtro.</Text>
      ) : (
        slices.map((item, index) => (
          <View key={item.category} style={styles.catRow}>
            <CategoryIcon name={item.category} />
            <Text style={styles.catName} numberOfLines={1}>
              {item.category}
            </Text>
            <View style={styles.catTrack}>
              <View
                style={[
                  styles.catFill,
                  {
                    width: `${Math.max(8, (item.total / maxCat) * 100)}%`,
                    backgroundColor: paletteAt(index),
                  },
                ]}
              />
            </View>
            <Text style={styles.catValue}>{formatBrl(item.total)}</Text>
          </View>
        ))
      )}
      <Text style={styles.title}>Gasto no período</Text>
      <View style={styles.bars}>
        {dash.trend.map((point, index) => {
          const ratio = point.total / maxTrend;
          return (
            <View key={`${point.label}-${index}`} style={styles.barCol}>
              <View style={styles.barTrack}>
                <View
                  style={[
                    styles.barFill,
                    {
                      height: `${Math.max(point.total > 0 ? 8 : 0, ratio * 100)}%`,
                      backgroundColor: colors.navy,
                    },
                  ]}
                />
              </View>
              <Text style={styles.barLabel} numberOfLines={1}>
                {point.label}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function Metric({label, value}: {label: string; value: string}) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: space.md,
    marginBottom: space.md,
    backgroundColor: colors.white,
    borderRadius: 20,
    padding: space.md,
    gap: 10,
  },
  metrics: {flexDirection: 'row', gap: 8},
  metric: {
    flex: 1,
    backgroundColor: colors.bg,
    borderRadius: 14,
    padding: 10,
    gap: 2,
  },
  metricLabel: {fontSize: 11, fontWeight: '700', color: colors.muted},
  metricValue: {fontSize: 14, fontWeight: '900', color: colors.navy},
  title: {fontSize: 15, fontWeight: '900', color: colors.navy, marginTop: 4},
  empty: {color: colors.muted, fontWeight: '600'},
  catRow: {flexDirection: 'row', alignItems: 'center', gap: 8},
  catName: {width: 92, fontWeight: '700', color: colors.ink, fontSize: 12},
  catTrack: {
    flex: 1,
    height: 10,
    borderRadius: 6,
    backgroundColor: colors.bg,
    overflow: 'hidden',
  },
  catFill: {height: '100%', borderRadius: 6},
  catValue: {width: 72, textAlign: 'right', fontWeight: '800', color: colors.navy, fontSize: 12},
  bars: {flexDirection: 'row', alignItems: 'flex-end', gap: 8, height: 110},
  barCol: {flex: 1, alignItems: 'center', gap: 4},
  barTrack: {
    width: '70%',
    height: 84,
    borderRadius: 8,
    backgroundColor: colors.bg,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  barFill: {width: '100%', backgroundColor: colors.navy, borderRadius: 8},
  barLabel: {fontSize: 10, fontWeight: '700', color: colors.muted},
});

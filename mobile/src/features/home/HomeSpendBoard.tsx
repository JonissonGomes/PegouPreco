import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import Svg, {Circle, Polyline} from 'react-native-svg';
import {formatBrl} from '@/domain/money';
import type {HomeDash, HomePeriodDays} from '@/domain/homeDashboard';
import {categoryTone} from '@/features/history/categoryTone';
import {Reveal} from '@/ui/reveal';
import {colors, space} from '@/ui/theme';

const PERIOD_LABEL: Record<HomePeriodDays, string> = {
  7: '7 dias',
  30: '30 dias',
  90: '90 dias',
};

export function HomeSpendBoard({
  dash,
  period,
}: {
  dash: HomeDash;
  period: HomePeriodDays;
}) {
  const slices = dash.categories.slice(0, 5);
  const total = slices.reduce((sum, item) => sum + item.total, 0) || dash.spent || 1;
  const lead = slices[0];
  const leadPct = lead ? Math.round((lead.total / total) * 100) : 0;
  const trendMax = Math.max(...dash.trend.map(point => point.total), 1);

  return (
    <View style={styles.wrap}>
      <Reveal>
        <View style={styles.card}>
          <View style={styles.head}>
            <Text style={styles.kicker}>Gastos</Text>
            <View style={styles.periodPill}>
              <Text style={styles.periodText}>{PERIOD_LABEL[period]}</Text>
            </View>
          </View>
          <View style={styles.heroRow}>
            <View style={styles.heroCopy}>
              <Text style={styles.big}>{formatBrl(dash.spent)}</Text>
              <Text style={styles.hint}>
                {dash.purchaseCount} compra{dash.purchaseCount === 1 ? '' : 's'} no período
              </Text>
            </View>
            <MiniRing
              ratio={
                dash.spent + dash.savings > 0
                  ? dash.savings / (dash.spent + dash.savings)
                  : 0
              }
            />
          </View>
          <View style={styles.tiles}>
            <View style={styles.tile}>
              <Text style={styles.tileValue}>{formatBrl(dash.spent)}</Text>
              <Text style={styles.tileLabel}>Gasto</Text>
            </View>
            <View style={styles.tile}>
              <Text style={styles.tileValue}>{formatBrl(dash.savings)}</Text>
              <Text style={styles.tileLabel}>Economia</Text>
            </View>
            <View style={styles.tile}>
              <Text style={styles.tileValue}>{dash.categories.length}</Text>
              <Text style={styles.tileLabel}>Categorias</Text>
            </View>
          </View>
          <View style={styles.track}>
            <View
              style={[
                styles.trackSpend,
                {
                  flex: dash.spent + dash.savings > 0 ? dash.spent : 1,
                },
              ]}
            />
            {dash.savings > 0 ? (
              <View style={[styles.trackSave, {flex: dash.savings}]} />
            ) : null}
          </View>
          <View style={styles.barEnds}>
            <Text style={styles.barLabel}>Gasto</Text>
            <Text style={styles.barLabel}>Economia</Text>
          </View>
        </View>
      </Reveal>

      <Reveal delay={80}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Gasto por categoria</Text>
          {slices.length === 0 ? (
            <Text style={styles.empty}>Cadastre uma nota para ver as categorias.</Text>
          ) : (
            <View style={styles.donutRow}>
              <Donut
                slices={slices.map(item => ({
                  total: item.total,
                  color: categoryTone(item.category).fg,
                }))}
                center={`${leadPct}%`}
              />
              <View style={styles.legend}>
                {slices.map(item => (
                  <View key={item.category} style={styles.legendRow}>
                    <View
                      style={[
                        styles.dot,
                        {backgroundColor: categoryTone(item.category).fg},
                      ]}
                    />
                    <Text style={styles.legendName} numberOfLines={1}>
                      {item.category}
                    </Text>
                    <Text style={styles.legendValue}>{formatBrl(item.total)}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}
        </View>
      </Reveal>

      {dash.trend.some(point => point.total > 0) ? (
        <Reveal delay={140}>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Evolução do gasto</Text>
            <Trend points={dash.trend} max={trendMax} />
          </View>
        </Reveal>
      ) : null}
    </View>
  );
}

function MiniRing({ratio}: {ratio: number}) {
  const size = 84;
  const stroke = 10;
  const radius = (size - stroke) / 2;
  const length = 2 * Math.PI * radius;
  const part = Math.max(0, Math.min(1, ratio)) * length;
  const pct = Math.round(ratio * 100);
  return (
    <View style={{width: size, height: size}}>
      <Svg width={size} height={size}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="#E5E7EB"
          strokeWidth={stroke}
          fill="none"
        />
        {part > 0 ? (
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={colors.yellow}
            strokeWidth={stroke}
            fill="none"
            strokeDasharray={`${part} ${length - part}`}
            strokeLinecap="round"
            originX={size / 2}
            originY={size / 2}
            rotation={-90}
          />
        ) : null}
      </Svg>
      <View style={styles.donutCenter}>
        <Text style={styles.ringPct}>{pct}%</Text>
      </View>
    </View>
  );
}

function Donut({
  slices,
  center,
}: {
  slices: {total: number; color: string}[];
  center: string;
}) {
  const size = 132;
  const stroke = 16;
  const radius = (size - stroke) / 2;
  const length = 2 * Math.PI * radius;
  const sum = slices.reduce((acc, item) => acc + item.total, 0) || 1;
  let cursor = 0;
  return (
    <View style={{width: size, height: size}}>
      <Svg width={size} height={size}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="#E5E7EB"
          strokeWidth={stroke}
          fill="none"
        />
        {slices.map(slice => {
          const part = (slice.total / sum) * length;
          const node = (
            <Circle
              key={`${slice.color}-${cursor}`}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke={slice.color}
              strokeWidth={stroke}
              fill="none"
              strokeDasharray={`${part} ${length - part}`}
              strokeDashoffset={-cursor}
              strokeLinecap="butt"
              originX={size / 2}
              originY={size / 2}
              rotation={-90}
            />
          );
          cursor += part;
          return node;
        })}
      </Svg>
      <View style={styles.donutCenter}>
        <Text style={styles.donutPct}>{center}</Text>
      </View>
    </View>
  );
}

function Trend({
  points,
  max,
}: {
  points: {label: string; total: number}[];
  max: number;
}) {
  const width = 280;
  const height = 72;
  const step = points.length > 1 ? width / (points.length - 1) : width;
  const coords = points
    .map((point, index) => {
      const x = index * step;
      const y = height - 8 - (point.total / max) * (height - 16);
      return `${x},${y}`;
    })
    .join(' ');
  return (
    <View>
      <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
        <Polyline
          points={coords}
          fill="none"
          stroke={colors.navy}
          strokeWidth={3}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </Svg>
      <View style={styles.trendLabels}>
        {points.map((point, index) => (
          <Text key={`${point.label}-${index}`} style={styles.trendLabel}>
            {point.label}
          </Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {gap: 12, marginBottom: space.md},
  card: {
    marginHorizontal: space.md,
    backgroundColor: colors.white,
    borderRadius: 24,
    padding: space.lg,
    gap: 8,
  },
  kicker: {fontSize: 16, fontWeight: '900', color: colors.navy},
  head: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  periodPill: {
    backgroundColor: '#FFF6D8',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  periodText: {fontSize: 12, fontWeight: '800', color: colors.navy},
  heroRow: {flexDirection: 'row', alignItems: 'center', gap: 12},
  heroCopy: {flex: 1, gap: 4},
  big: {fontSize: 32, fontWeight: '900', color: colors.navy},
  hint: {fontWeight: '700', color: colors.muted},
  tiles: {flexDirection: 'row', gap: 8},
  tile: {
    flex: 1,
    backgroundColor: colors.bg,
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 8,
    gap: 2,
  },
  tileValue: {fontSize: 13, fontWeight: '900', color: colors.navy},
  tileLabel: {fontSize: 11, fontWeight: '700', color: colors.muted},
  barEnds: {flexDirection: 'row', justifyContent: 'space-between'},
  barLabel: {fontSize: 12, fontWeight: '700', color: colors.muted},
  track: {
    height: 10,
    borderRadius: 8,
    backgroundColor: '#E5E7EB',
    overflow: 'hidden',
    flexDirection: 'row',
  },
  trackSpend: {backgroundColor: colors.navy},
  trackSave: {backgroundColor: colors.yellow},
  ringPct: {fontSize: 14, fontWeight: '900', color: colors.navy},
  cardTitle: {fontSize: 16, fontWeight: '900', color: colors.navy},
  empty: {color: colors.muted, fontWeight: '600'},
  donutRow: {flexDirection: 'row', alignItems: 'center', gap: 12},
  legend: {flex: 1, gap: 8},
  legendRow: {flexDirection: 'row', alignItems: 'center', gap: 6},
  dot: {width: 8, height: 8, borderRadius: 4},
  legendName: {flex: 1, fontWeight: '700', color: colors.ink, fontSize: 13},
  legendValue: {fontWeight: '800', color: colors.navy, fontSize: 12},
  donutCenter: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  donutPct: {fontSize: 18, fontWeight: '900', color: colors.navy},
  trendLabels: {flexDirection: 'row', justifyContent: 'space-between'},
  trendLabel: {fontSize: 11, fontWeight: '700', color: colors.muted},
});

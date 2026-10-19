import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import Svg, {Circle, Path} from 'react-native-svg';
import {formatBrl} from '@/domain/money';
import type {HomeDash, HomePeriodDays} from '@/domain/homeDashboard';
import {Reveal, useDraw} from '@/ui/reveal';
import {palette} from '@/ui/primaryColors';
import {colors, space} from '@/ui/theme';

const PERIOD_LABEL: Record<HomePeriodDays, string> = {
  7: '7 dias',
  30: '30 dias',
  90: '90 dias',
};

export function HomeSpendBoard({
  dash,
  period,
  play = 0,
  onPress,
}: {
  dash: HomeDash;
  period: HomePeriodDays;
  play?: number;
  onPress?: () => void;
}) {
  const trendMax = Math.max(...dash.trend.map(point => point.total), 1);
  const draw = useDraw(160, 900, play);

  return (
    <View style={styles.wrap}>
      <Reveal play={play}>
        <Pressable
          style={styles.card}
          onPress={onPress}
          disabled={!onPress}>
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
              play={play}
              ratio={
                dash.spent + dash.savings > 0
                  ? dash.savings / (dash.spent + dash.savings)
                  : 0
              }
            />
          </View>
          <View style={styles.tiles}>
            <View style={[styles.tile, {backgroundColor: palette.navySoft}]}>
              <Text style={[styles.tileValue, {color: palette.ink}]}>{formatBrl(dash.spent)}</Text>
              <Text style={styles.tileLabel}>Gasto</Text>
            </View>
            <View style={[styles.tile, {backgroundColor: palette.yellowSoft}]}>
              <Text style={[styles.tileValue, {color: palette.ink}]}>{formatBrl(dash.savings)}</Text>
              <Text style={styles.tileLabel}>Economia</Text>
            </View>
            <View style={[styles.tile, {backgroundColor: palette.cyanSoft}]}>
              <Text style={[styles.tileValue, {color: palette.ink}]}>{dash.categories.length}</Text>
              <Text style={styles.tileLabel}>Categorias</Text>
            </View>
          </View>
          <View style={[styles.track, {backgroundColor: palette.yellowSoft}]}>
            <View
              style={[
                styles.trackSpend,
                {
                  flex: dash.spent + dash.savings > 0 ? dash.spent * draw : 1,
                  backgroundColor: palette.navy,
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
        </Pressable>
      </Reveal>

      {dash.trend.some(point => point.total > 0) ? (
        <Reveal delay={140} play={play}>
          <Pressable style={styles.card} onPress={onPress} disabled={!onPress}>
            <Text style={styles.cardTitle}>Evolução do gasto</Text>
            <Trend play={play} points={dash.trend} max={trendMax} />
          </Pressable>
        </Reveal>
      ) : null}
    </View>
  );
}

function MiniRing({ratio, play}: {ratio: number; play: number}) {
  const size = 84;
  const stroke = 10;
  const radius = (size - stroke) / 2;
  const length = 2 * Math.PI * radius;
  const progress = useDraw(80, 800, play);
  const part = Math.max(0, Math.min(1, ratio)) * length * progress;
  const pct = Math.round(ratio * progress * 100);
  return (
    <View style={{width: size, height: size}}>
      <Svg width={size} height={size}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={palette.cyanSoft}
          strokeWidth={stroke}
          fill="none"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={palette.navy}
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={`${part} ${length - part}`}
          strokeLinecap="round"
          originX={size / 2}
          originY={size / 2}
          rotation={-90}
        />
      </Svg>
      <View style={styles.donutCenter}>
        <Text style={[styles.ringPct, {color: palette.ink}]}>{pct}%</Text>
      </View>
    </View>
  );
}

function Trend({
  points,
  max,
  play,
}: {
  points: {label: string; total: number}[];
  max: number;
  play: number;
}) {
  const [width, setWidth] = React.useState(0);
  const progress = useDraw(160, 800, play);
  const height = 96;
  const coords =
    width > 0
      ? points.map((point, index) => {
          const x =
            points.length === 1
              ? width / 2
              : (index / (points.length - 1)) * (width - 16) + 8;
          const ratio = max > 0 ? Math.min(1, point.total / max) : 0;
          const y = height - 8 - ratio * progress * (height - 20);
          return {x, y, label: point.label};
        })
      : [];
  const line = coords
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
    .join(' ');
  const area =
    coords.length > 1
      ? `${line} L ${coords[coords.length - 1].x} ${height} L ${coords[0].x} ${height} Z`
      : '';
  return (
    <View onLayout={e => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 ? (
        <Svg width={width} height={height}>
          {area ? <Path d={area} fill={palette.navySoft} /> : null}
          {line ? (
            <Path
              d={line}
              stroke={palette.navy}
              strokeWidth={3}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}
          {coords.map(point => (
            <Circle
              key={`${point.label}-${point.x}`}
              cx={point.x}
              cy={point.y}
              r={4}
              fill={colors.white}
              stroke={palette.navy}
              strokeWidth={2}
            />
          ))}
        </Svg>
      ) : (
        <View style={{height}} />
      )}
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
  trackSpend: {backgroundColor: palette.navy},
  trackSave: {backgroundColor: palette.cyan},
  ringPct: {fontSize: 14, fontWeight: '900', color: colors.navy},
  cardTitle: {fontSize: 16, fontWeight: '900', color: colors.navy},
  donutCenter: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trendLabels: {flexDirection: 'row', justifyContent: 'space-between'},
  trendLabel: {fontSize: 11, fontWeight: '700', color: colors.muted},
});

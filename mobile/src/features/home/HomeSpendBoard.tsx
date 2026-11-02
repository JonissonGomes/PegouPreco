import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import Svg, {Circle, Path} from 'react-native-svg';
import {formatBrl} from '@/domain/money';
import {buyDayPhrase, type HomeDash, type HomePeriodDays} from '@/domain/homeDashboard';
import {Reveal, useDraw} from '@/ui/reveal';
import {palette} from '@/ui/primaryColors';
import {heatColor} from '@/features/history/categoryTone';
import {colors, space} from '@/ui/theme';
import {PressableScale} from '@/ui/PressableScale';

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
  onOpenCategory,
  buyTip,
}: {
  dash: HomeDash;
  period: HomePeriodDays;
  play?: number;
  onPress?: () => void;
  onOpenCategory?: (category: string) => void;
  buyTip?: string | null;
}) {
  const slices = dash.categories.slice(0, 5);
  const total = slices.reduce((sum, item) => sum + item.total, 0) || dash.spent || 1;
  const lead = slices[0];
  const trendMax = Math.max(...dash.trend.map(point => point.total), 1);
  const draw = useDraw(160, 900, play);

  return (
    <View style={styles.wrap}>
      <Reveal play={play}>
        <PressableScale
          style={styles.card}
          onPress={onPress}
          disabled={!onPress}
          activeScale={0.98}>
          <View style={styles.head}>
            {buyTip ? (
              <View style={styles.tipPill}>
                <Text style={styles.tipText}>{buyDayPhrase(buyTip)}</Text>
              </View>
            ) : (
              <View />
            )}
            <View style={styles.periodPill}>
              <Text style={styles.periodText}>{PERIOD_LABEL[period]}</Text>
            </View>
          </View>
          <View style={styles.heroRow}>
            <View style={styles.heroCopy}>
              <Text style={styles.heroPreLabel}>Gasto acumulado</Text>
              <Text style={styles.big}>{formatBrl(dash.spent)}</Text>
              <Text style={styles.hint}>
                {dash.purchaseCount} compra{dash.purchaseCount === 1 ? '' : 's'} registradas
              </Text>
            </View>
            {lead ? (
              <View style={styles.ringWrap}>
                <MiniRing play={play} ratio={lead.total / total} />
                <Text style={styles.ringCaption} numberOfLines={1}>
                  {lead.category}
                </Text>
              </View>
            ) : null}
          </View>
          <View style={styles.tiles}>
            <View style={[styles.tile, {backgroundColor: '#F3F6FD'}]}>
              <Text style={[styles.tileValue, {color: palette.navy}]}>{formatBrl(dash.spent)}</Text>
              <Text style={styles.tileLabel}>Gasto</Text>
            </View>
            <View style={[styles.tile, {backgroundColor: '#ECFDF5'}]}>
              <Text style={[styles.tileValue, {color: '#059669'}]}>{formatBrl(dash.savings)}</Text>
              <Text style={styles.tileLabel}>Economia</Text>
            </View>
            <View style={[styles.tile, {backgroundColor: '#FFFBEB'}]}>
              <Text style={[styles.tileValue, {color: '#D97706'}]}>{dash.categories.length}</Text>
              <Text style={styles.tileLabel}>Categorias</Text>
            </View>
          </View>
          <View style={[styles.track, {backgroundColor: '#E5E7EB'}]}>
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
        </PressableScale>
      </Reveal>

      <Reveal delay={80} play={play}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Gasto por categoria</Text>
          {slices.length === 0 ? (
            <Text style={styles.empty}>Cadastre uma nota para ver as categorias.</Text>
          ) : (
            <View style={styles.donutSection}>
              <View style={styles.donutCenterWrap}>
                <PressableScale onPress={onPress} disabled={!onPress} activeScale={0.96}>
                  <CategoryDonut
                    play={play}
                    slices={slices.map((item, index) => ({
                      total: item.total,
                      color: heatColor(index, slices.length),
                    }))}
                    center={formatBrl(dash.spent)}
                  />
                </PressableScale>
              </View>
              <View style={styles.categoryGrid}>
                {slices.map((item, index) => (
                  <View key={item.category} style={styles.gridCol}>
                    <PressableScale
                      style={styles.gridCard}
                      activeScale={0.97}
                      onPress={() => onOpenCategory?.(item.category)}>
                      <View style={styles.gridItemRow}>
                        <View
                          style={[
                            styles.dot,
                            {backgroundColor: heatColor(index, slices.length)},
                          ]}
                        />
                        <Text style={styles.legendName} numberOfLines={1}>
                          {item.category}
                        </Text>
                      </View>
                      <Text style={styles.gridValue}>{formatBrl(item.total)}</Text>
                    </PressableScale>
                  </View>
                ))}
              </View>
            </View>
          )}
        </View>
      </Reveal>

      {dash.trend.some(point => point.total > 0) ? (
        <Reveal delay={140} play={play}>
          <PressableScale style={styles.card} onPress={onPress} disabled={!onPress} activeScale={0.98}>
            <Text style={styles.cardTitle}>Evolução do gasto</Text>
            <Trend play={play} points={dash.trend} max={trendMax} />
          </PressableScale>
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

function CategoryDonut({
  slices,
  center,
  play,
}: {
  slices: {total: number; color: string}[];
  center: string;
  play: number;
}) {
  const size = 132;
  const stroke = 16;
  const radius = (size - stroke) / 2;
  const length = 2 * Math.PI * radius;
  const progress = useDraw(200, 1100, play);
  const sum = slices.reduce((acc, item) => acc + item.total, 0) || 1;
  const gap = slices.length > 1 ? 1 : 0;
  const usable = Math.max(length - gap * slices.length, 1);
  const arcs: {color: string; start: number; part: number}[] = [];
  let cursor = 0;
  for (const slice of slices) {
    const part = (slice.total / sum) * usable;
    arcs.push({color: slice.color, start: cursor, part});
    cursor += part + gap;
  }
  return (
    <View style={{width: size, height: size}}>
      <Svg width={size} height={size}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="#E8EDF5"
          strokeWidth={stroke}
          fill="none"
        />
        {arcs.map(arc => (
          <Circle
            key={`${arc.color}-${arc.start}`}
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={arc.color}
            strokeWidth={stroke}
            fill="none"
            strokeDasharray={`${arc.part * progress} ${length - arc.part * progress}`}
            strokeDashoffset={-arc.start}
            strokeLinecap="butt"
            originX={size / 2}
            originY={size / 2}
            rotation={-90}
          />
        ))}
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
  wrap: {gap: 14, marginBottom: space.md},
  card: {
    marginHorizontal: space.md,
    backgroundColor: colors.white,
    borderRadius: 26,
    padding: space.lg,
    gap: 10,
    shadowColor: '#0A2540',
    shadowOpacity: 0.07,
    shadowRadius: 14,
    shadowOffset: {width: 0, height: 4},
    elevation: 3,
    borderWidth: 1,
    borderColor: 'rgba(230, 235, 245, 0.9)',
  },
  head: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  periodPill: {
    backgroundColor: '#FEF3C7',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  periodText: {fontSize: 12, fontWeight: '800', color: colors.navy},
  tipPill: {
    flex: 1,
    marginRight: 8,
    backgroundColor: '#F3F4F6',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  tipText: {fontSize: 12, fontWeight: '700', color: colors.navy},
  heroRow: {flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4},
  heroCopy: {flex: 1, gap: 2},
  heroPreLabel: {fontSize: 12, fontWeight: '800', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.5},
  big: {fontSize: 34, fontWeight: '900', color: colors.navy, letterSpacing: -0.5},
  hint: {fontWeight: '700', color: colors.muted, fontSize: 13},
  tiles: {flexDirection: 'row', gap: 8, marginTop: 4},
  tile: {
    flex: 1,
    borderRadius: 18,
    paddingVertical: 12,
    paddingHorizontal: 8,
    gap: 3,
    alignItems: 'center',
  },
  tileValue: {fontSize: 14, fontWeight: '900', textAlign: 'center'},
  tileLabel: {fontSize: 11, fontWeight: '800', color: colors.muted, textAlign: 'center'},
  ringWrap: {alignItems: 'center', width: 92},
  ringCaption: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: '800',
    color: colors.navy,
    textAlign: 'center',
  },
  barEnds: {flexDirection: 'row', justifyContent: 'space-between', marginTop: 2},
  barLabel: {fontSize: 11, fontWeight: '800', color: colors.muted},
  track: {
    height: 10,
    borderRadius: 8,
    overflow: 'hidden',
    flexDirection: 'row',
    marginTop: 6,
  },
  trackSpend: {backgroundColor: palette.navy},
  trackSave: {backgroundColor: palette.cyan},
  ringPct: {fontSize: 14, fontWeight: '900', color: colors.navy},
  cardTitle: {fontSize: 16, fontWeight: '900', color: colors.navy},
  empty: {color: colors.muted, fontWeight: '600'},
  donutSection: {gap: 16, marginTop: 4},
  donutCenterWrap: {alignItems: 'center', justifyContent: 'center'},
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 8,
  },
  gridCol: {
    width: '48.5%',
  },
  gridCard: {
    width: '100%',
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 4,
  },
  gridItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  gridValue: {
    fontSize: 13,
    fontWeight: '900',
    color: colors.navy,
    marginLeft: 18,
  },
  donutRow: {flexDirection: 'row', alignItems: 'center', gap: 12},
  legend: {flex: 1, gap: 8},
  legendRow: {flexDirection: 'row', alignItems: 'center', gap: 6},
  dot: {width: 10, height: 10, borderRadius: 5},
  legendName: {flex: 1, fontWeight: '700', color: colors.ink, fontSize: 13},
  legendValue: {fontWeight: '800', color: colors.navy, fontSize: 12},
  donutPct: {fontSize: 18, fontWeight: '900', color: colors.navy},
  donutCenter: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trendLabels: {flexDirection: 'row', justifyContent: 'space-between'},
  trendLabel: {fontSize: 11, fontWeight: '700', color: colors.muted},
});

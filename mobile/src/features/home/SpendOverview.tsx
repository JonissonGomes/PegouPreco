import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import Svg, {Circle} from 'react-native-svg';
import {formatBrl} from '@/domain/money';
import type {HomeDash, SpendSpan} from '@/domain/homeDashboard';
import {CategoryIcon} from '@/features/history/categoryIcon';
import {heatColor} from '@/features/history/categoryTone';
import {useDraw} from '@/ui/reveal';
import {colors, space} from '@/ui/theme';

const SPANS: {id: SpendSpan; label: string}[] = [
  {id: 'week', label: 'Semana'},
  {id: 'month', label: 'Mês'},
  {id: 'quarter', label: 'Trimestre'},
];

function compactBrl(value: number) {
  if (value >= 1000) {
    const mil = value / 1000;
    const digits = mil >= 10 ? 0 : 1;
    return `R$ ${mil.toFixed(digits).replace('.', ',')} mil`;
  }
  return formatBrl(value);
}

/** Classificação visual dos gastos: período, meses e anel por categoria. */
export function SpendOverview({
  dash,
  span,
  selectedLabel,
  previousLabel,
  nextLabel,
  previousTotal,
  nextTotal,
  canNext,
  onSpan,
  onPrevious,
  onNext,
  onOpenCategory,
  play = 0,
  periodLabel,
}: {
  dash: HomeDash;
  span: SpendSpan;
  selectedLabel: string;
  previousLabel: string;
  nextLabel: string;
  previousTotal: number;
  nextTotal: number;
  canNext: boolean;
  onSpan: (span: SpendSpan) => void;
  onPrevious: () => void;
  onNext: () => void;
  onOpenCategory?: (category: string) => void;
  play?: number;
  periodLabel: string;
}) {
  const slices = dash.categories;
  return (
    <View style={styles.card}>
      <View style={styles.spans}>
        {SPANS.map(item => {
          const on = item.id === span;
          return (
            <Pressable
              key={item.id}
              style={[styles.span, on && styles.spanOn]}
              onPress={() => onSpan(item.id)}>
              <Text style={[styles.spanText, on && styles.spanTextOn]}>
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.months}>
        <Pressable style={styles.monthSide} onPress={onPrevious}>
          <Text style={styles.monthSideName}>{previousLabel}</Text>
          <Text style={styles.monthSideValue}>{formatBrl(previousTotal)}</Text>
        </Pressable>
        <View style={styles.monthCurrent}>
          <Text style={styles.monthCurrentName}>{selectedLabel}</Text>
        </View>
        <Pressable
          style={[styles.monthSide, !canNext && styles.monthOff]}
          disabled={!canNext}
          onPress={onNext}>
          <Text style={styles.monthSideName}>{nextLabel}</Text>
          <Text style={styles.monthSideValue}>
            {canNext ? formatBrl(nextTotal) : '—'}
          </Text>
        </Pressable>
      </View>

      {slices.length === 0 ? (
        <Text style={styles.empty}>Nenhuma compra neste período.</Text>
      ) : (
        <>
          <View style={styles.donutWrap}>
            <Donut
              play={play}
              slices={slices.map((item, index) => ({
                total: item.total,
                color: heatColor(index, slices.length),
                category: item.category,
              }))}
              center={compactBrl(dash.spent)}
              caption={periodLabel}
            />
          </View>
          <View style={styles.legend}>
            {slices.map(item => (
              <Pressable
                key={item.category}
                style={styles.legendItem}
                onPress={() => onOpenCategory?.(item.category)}>
                <CategoryIcon name={item.category} size={14} />
                <Text style={styles.legendName} numberOfLines={1}>
                  {item.category}
                </Text>
                <Text style={styles.legendValue}>{formatBrl(item.total)}</Text>
              </Pressable>
            ))}
          </View>
        </>
      )}
    </View>
  );
}

function Donut({
  slices,
  center,
  caption,
  play,
}: {
  slices: {total: number; color: string; category: string}[];
  center: string;
  caption: string;
  play: number;
}) {
  const size = 210;
  const stroke = 22;
  const radius = (size - stroke) / 2;
  const length = 2 * Math.PI * radius;
  const progress = useDraw(120, 900, play);
  const sum = slices.reduce((acc, item) => acc + item.total, 0) || 1;
  const gap = slices.length > 1 ? 1 : 0;
  const usable = Math.max(length - gap * slices.length, 1);
  const arcs: {color: string; start: number; part: number; category: string}[] = [];
  let cursor = 0;
  for (const slice of slices) {
    const part = (slice.total / sum) * usable;
    arcs.push({color: slice.color, start: cursor, part, category: slice.category});
    cursor += part + gap;
  }
  const iconBox = 28;
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
      {arcs.map(arc => {
        if (arc.part < length * 0.07) return null;
        const mid = arc.start + arc.part / 2;
        const theta = (mid / length) * Math.PI * 2 - Math.PI / 2;
        const left = size / 2 + Math.cos(theta) * radius - iconBox / 2;
        const top = size / 2 + Math.sin(theta) * radius - iconBox / 2;
        return (
          <View key={arc.category} style={[styles.arcIcon, {left, top}]}>
            <CategoryIcon name={arc.category} size={14} />
          </View>
        );
      })}
      <View style={styles.center}>
        <Text style={styles.centerValue}>{center}</Text>
        <Text style={styles.centerHint}>{caption}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: space.md,
    marginBottom: space.md,
    backgroundColor: colors.white,
    borderRadius: 28,
    padding: space.md,
    gap: 16,
  },
  spans: {
    flexDirection: 'row',
    backgroundColor: colors.bg,
    borderRadius: 999,
    padding: 4,
  },
  span: {flex: 1, borderRadius: 999, paddingVertical: 8, alignItems: 'center'},
  spanOn: {backgroundColor: colors.navy},
  spanText: {fontWeight: '800', color: colors.muted, fontSize: 13},
  spanTextOn: {color: colors.white},
  months: {flexDirection: 'row', alignItems: 'flex-end', gap: 8},
  monthSide: {flex: 1, alignItems: 'center', gap: 2, paddingVertical: 4},
  monthOff: {opacity: 0.35},
  monthSideName: {fontSize: 13, fontWeight: '700', color: colors.muted},
  monthSideValue: {fontSize: 12, fontWeight: '800', color: colors.navy},
  monthCurrent: {flex: 1.2, alignItems: 'center'},
  monthCurrentName: {fontSize: 20, fontWeight: '900', color: colors.navy},
  empty: {color: colors.muted, fontWeight: '600', textAlign: 'center'},
  donutWrap: {alignItems: 'center'},
  legend: {flexDirection: 'row', flexWrap: 'wrap', rowGap: 10},
  legendItem: {
    width: '50%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingRight: 10,
  },
  legendName: {flex: 1, fontWeight: '700', color: colors.ink, fontSize: 13},
  legendValue: {fontWeight: '800', color: colors.navy, fontSize: 12},
  arcIcon: {position: 'absolute'},
  center: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerValue: {fontSize: 22, fontWeight: '900', color: colors.navy},
  centerHint: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.muted,
    textAlign: 'center',
    paddingHorizontal: 36,
  },
});

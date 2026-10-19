import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import Svg, {Circle} from 'react-native-svg';
import {formatBrl} from '@/domain/money';
import type {HomeDash, SpendSpan} from '@/domain/homeDashboard';
import {categoryTone} from '@/features/history/categoryTone';
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
              slices={slices.map(item => ({
                total: item.total,
                color: categoryTone(item.category).fg,
              }))}
              center={compactBrl(dash.spent)}
            />
          </View>
          <View style={styles.legend}>
            {slices.map(item => (
              <Pressable
                key={item.category}
                style={styles.legendItem}
                onPress={() => onOpenCategory?.(item.category)}>
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
}: {
  slices: {total: number; color: string}[];
  center: string;
}) {
  const size = 210;
  const stroke = 22;
  const radius = (size - stroke) / 2;
  const length = 2 * Math.PI * radius;
  const sum = slices.reduce((acc, item) => acc + item.total, 0) || 1;
  const gap = slices.length > 1 ? 10 : 0;
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
            strokeDasharray={`${arc.part} ${length - arc.part}`}
            strokeDashoffset={-arc.start}
            strokeLinecap="round"
            originX={size / 2}
            originY={size / 2}
            rotation={-90}
          />
        ))}
      </Svg>
      <View style={styles.center}>
        <Text style={styles.centerValue}>{center}</Text>
        <Text style={styles.centerHint}>no período</Text>
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
    gap: 6,
    paddingRight: 8,
  },
  dot: {width: 8, height: 8, borderRadius: 4},
  legendName: {flex: 1, fontWeight: '700', color: colors.ink, fontSize: 13},
  legendValue: {fontWeight: '800', color: colors.navy, fontSize: 12},
  center: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerValue: {fontSize: 22, fontWeight: '900', color: colors.navy},
  centerHint: {fontSize: 12, fontWeight: '700', color: colors.muted},
});

import React, {useMemo, useState} from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {ChevronLeft, ChevronRight} from 'lucide-react-native';
import {
  normalizeRange,
  sameCalendarDay,
  startOfDay,
  type DateRange,
} from '@/domain/dateRange';
import {colors, radii, space} from '@/ui/theme';

const WEEKDAYS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

function monthTitle(anchor: Date) {
  const raw = anchor.toLocaleDateString('pt-BR', {
    month: 'long',
    year: 'numeric',
  });
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

export function DateRangeCalendar({
  value,
  onChange,
}: {
  value: DateRange | null;
  onChange: (range: DateRange) => void;
}) {
  const initial = value?.start ?? Date.now();
  const [cursor, setCursor] = useState(
    () => new Date(new Date(initial).getFullYear(), new Date(initial).getMonth(), 1),
  );
  const [pickStart, setPickStart] = useState<number | null>(
    value ? startOfDay(value.start) : null,
  );

  const cells = useMemo(() => {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const firstDow = new Date(year, month, 1).getDay();
    const total = daysInMonth(year, month);
    const out: Array<{ms: number; day: number} | null> = [];
    for (let i = 0; i < firstDow; i++) out.push(null);
    for (let day = 1; day <= total; day++) {
      out.push({ms: new Date(year, month, day).getTime(), day});
    }
    while (out.length % 7 !== 0) out.push(null);
    return out;
  }, [cursor]);

  const range = value;

  const onDay = (ms: number) => {
    const day = startOfDay(ms);
    if (pickStart == null || (range && sameCalendarDay(range.start, range.end - 1))) {
      setPickStart(day);
      onChange(normalizeRange(day, day));
      return;
    }
    onChange(normalizeRange(pickStart, day));
    setPickStart(null);
  };

  const shiftMonth = (delta: number) => {
    setCursor(
      new Date(cursor.getFullYear(), cursor.getMonth() + delta, 1),
    );
  };

  return (
    <View style={styles.root}>
      <View style={styles.nav}>
        <Pressable style={styles.navBtn} onPress={() => shiftMonth(-1)}>
          <ChevronLeft size={18} color={colors.navy} />
        </Pressable>
        <Text style={styles.month}>{monthTitle(cursor)}</Text>
        <Pressable style={styles.navBtn} onPress={() => shiftMonth(1)}>
          <ChevronRight size={18} color={colors.navy} />
        </Pressable>
      </View>
      <View style={styles.weekRow}>
        {WEEKDAYS.map((label, index) => (
          <Text key={`${label}-${index}`} style={styles.weekday}>
            {label}
          </Text>
        ))}
      </View>
      <View style={styles.grid}>
        {cells.map((cell, index) => {
          if (!cell) {
            return <View key={`empty-${index}`} style={styles.cell} />;
          }
          const inRange =
            range != null && cell.ms >= range.start && cell.ms < range.end;
          const isEdge =
            range != null &&
            (sameCalendarDay(cell.ms, range.start) ||
              sameCalendarDay(cell.ms, range.end - 1));
          return (
            <Pressable
              key={cell.ms}
              onPress={() => onDay(cell.ms)}
              style={[
                styles.cell,
                inRange && styles.cellIn,
                isEdge && styles.cellEdge,
              ]}>
              <Text
                style={[
                  styles.day,
                  inRange && styles.dayIn,
                  isEdge && styles.dayEdge,
                ]}>
                {cell.day}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={styles.hint}>Toque no início e no fim do período</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {gap: 8},
  nav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  navBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  month: {fontWeight: '900', color: colors.navy, fontSize: 15},
  weekRow: {flexDirection: 'row'},
  weekday: {
    flex: 1,
    textAlign: 'center',
    fontWeight: '800',
    color: colors.muted,
    fontSize: 11,
  },
  grid: {flexDirection: 'row', flexWrap: 'wrap'},
  cell: {
    width: '14.28%',
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellIn: {backgroundColor: '#E8F0FF'},
  cellEdge: {backgroundColor: colors.navy, borderRadius: radii.pill},
  day: {fontWeight: '700', color: colors.ink, fontSize: 13},
  dayIn: {color: colors.navy},
  dayEdge: {color: colors.white, fontWeight: '900'},
  hint: {
    textAlign: 'center',
    color: colors.muted,
    fontWeight: '600',
    fontSize: 12,
  },
});

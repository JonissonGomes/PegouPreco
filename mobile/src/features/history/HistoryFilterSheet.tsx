import React, {useEffect, useState} from 'react';
import {Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import {KeyboardSafeSheet} from '@/ui/keyboardSheet';
import {DateRangeCalendar} from '@/ui/DateRangeCalendar';
import {colors, radii} from '@/ui/theme';
import {categoryTone} from './categoryTone';
import {rangeLabel, type DateRange} from '@/domain/dateRange';
import type {HomePeriodDays} from '@/domain/homeDashboard';

const PERIODS: {days: HomePeriodDays | 'all' | 'custom'; label: string}[] = [
  {days: 'all', label: 'Tudo'},
  {days: 7, label: '7 dias'},
  {days: 30, label: '30 dias'},
  {days: 90, label: '90 dias'},
  {days: 'custom', label: 'Personalizado'},
];

export function HistoryFilterSheet({
  visible,
  market,
  category,
  periodDays,
  customRange,
  markets,
  categories,
  onClose,
  onApply,
}: {
  visible: boolean;
  market: string | null;
  category: string[];
  periodDays: HomePeriodDays | null;
  customRange: DateRange | null;
  markets: string[];
  categories: string[];
  onClose: () => void;
  onApply: (next: {
    market: string | null;
    category: string[];
    periodDays: HomePeriodDays | null;
    customRange: DateRange | null;
  }) => void;
}) {
  const [draftMarket, setDraftMarket] = useState(market);
  const [draftCategory, setDraftCategory] = useState(category);
  const [draftPeriod, setDraftPeriod] = useState<HomePeriodDays | null>(periodDays);
  const [draftCustom, setDraftCustom] = useState<DateRange | null>(customRange);
  const [customMode, setCustomMode] = useState(customRange != null);

  useEffect(() => {
    if (!visible) return;
    setDraftMarket(market);
    setDraftCategory(category);
    setDraftPeriod(periodDays);
    setDraftCustom(customRange);
    setCustomMode(customRange != null);
  }, [visible, market, category, periodDays, customRange]);

  const periodKey: HomePeriodDays | 'all' | 'custom' = customMode
    ? 'custom'
    : draftPeriod == null
      ? 'all'
      : draftPeriod;

  return (
    <KeyboardSafeSheet visible={visible} onClose={onClose}>
      <Text style={styles.title}>Filtros</Text>
      <Text style={styles.section}>Período</Text>
      <View style={styles.row}>
        {PERIODS.map(item => (
          <Pressable
            key={String(item.days)}
            onPress={() => {
              if (item.days === 'custom') {
                setCustomMode(true);
                return;
              }
              setCustomMode(false);
              setDraftCustom(null);
              setDraftPeriod(item.days === 'all' ? null : item.days);
            }}
            style={[styles.chip, periodKey === item.days && styles.chipOn]}>
            <Text
              style={[
                styles.chipText,
                periodKey === item.days && styles.chipTextOn,
              ]}>
              {item.label}
            </Text>
          </Pressable>
        ))}
      </View>
      {customMode ? (
        <>
          {draftCustom ? (
            <Text style={styles.rangeHint}>{rangeLabel(draftCustom)}</Text>
          ) : null}
          <DateRangeCalendar value={draftCustom} onChange={setDraftCustom} />
        </>
      ) : null}
      <Text style={styles.section}>Mercado</Text>
      <ScrollView style={styles.list} nestedScrollEnabled>
        <Option
          label="Todos os mercados"
          on={draftMarket == null}
          onPress={() => setDraftMarket(null)}
        />
        {markets.map(name => (
          <Option
            key={name}
            label={name}
            on={draftMarket === name}
            onPress={() => setDraftMarket(name)}
          />
        ))}
      </ScrollView>
      <Text style={styles.section}>Categoria</Text>
      <ScrollView style={styles.list} nestedScrollEnabled>
        <Option
          label="Todas as categorias"
          on={draftCategory.length === 0}
          onPress={() => setDraftCategory([])}
        />
        {categories.map(name => (
          <Option
            key={name}
            label={name}
            dot={categoryTone(name).fg}
            check
            on={draftCategory.includes(name)}
            onPress={() =>
              setDraftCategory(current =>
                current.includes(name)
                  ? current.filter(item => item !== name)
                  : [...current, name],
              )
            }
          />
        ))}
      </ScrollView>
      <View style={styles.actions}>
        <Pressable
          style={styles.clear}
          onPress={() => {
            setDraftMarket(null);
            setDraftCategory([]);
            setDraftPeriod(null);
            setDraftCustom(null);
            setCustomMode(false);
          }}>
          <Text style={styles.clearText}>Limpar</Text>
        </Pressable>
        <Pressable
          style={styles.apply}
          onPress={() => {
            if (customMode && !draftCustom) return;
            onApply({
              market: draftMarket,
              category: draftCategory,
              periodDays: customMode ? null : draftPeriod,
              customRange: customMode ? draftCustom : null,
            });
          }}>
          <Text style={styles.applyText}>Aplicar</Text>
        </Pressable>
      </View>
    </KeyboardSafeSheet>
  );
}

function Option({
  label,
  on,
  dot,
  check,
  onPress,
}: {
  label: string;
  on: boolean;
  dot?: string;
  check?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.option}>
      {dot ? <View style={[styles.dot, {backgroundColor: dot}]} /> : null}
      <Text style={styles.optionText}>{label}</Text>
      <View style={[check ? styles.box : styles.radio, on && styles.radioOn]}>
        {on ? <View style={check ? styles.boxMark : styles.radioDot} /> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  title: {fontSize: 22, fontWeight: '900', color: colors.navy},
  section: {
    marginTop: 8,
    fontSize: 13,
    fontWeight: '800',
    color: colors.muted,
  },
  rangeHint: {
    fontWeight: '800',
    color: colors.navy,
    fontSize: 13,
    marginBottom: 4,
  },
  row: {flexDirection: 'row', flexWrap: 'wrap', gap: 8},
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radii.pill,
    backgroundColor: colors.bg,
  },
  chipOn: {backgroundColor: colors.navy},
  chipText: {fontWeight: '800', color: colors.navy},
  chipTextOn: {color: colors.white},
  list: {maxHeight: 140},
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  optionText: {flex: 1, fontWeight: '700', color: colors.ink, marginRight: 12},
  dot: {width: 10, height: 10, borderRadius: 5, marginRight: 8},
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOn: {borderColor: colors.navy},
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.navy,
  },
  box: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxMark: {
    width: 12,
    height: 12,
    borderRadius: 3,
    backgroundColor: colors.navy,
  },
  actions: {flexDirection: 'row', gap: 10, marginTop: 8},
  clear: {
    flex: 1,
    height: 48,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
  },
  clearText: {fontWeight: '800', color: colors.navy},
  apply: {
    flex: 1.4,
    height: 48,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.yellow,
  },
  applyText: {fontWeight: '900', color: colors.navy},
});

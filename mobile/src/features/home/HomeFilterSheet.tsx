import React, {useEffect, useState} from 'react';
import {Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import {KeyboardSafeSheet} from '@/ui/keyboardSheet';
import {DateRangeCalendar} from '@/ui/DateRangeCalendar';
import {colors, radii} from '@/ui/theme';
import type {HomePeriodDays} from '@/domain/homeDashboard';
import {rangeLabel, type DateRange} from '@/domain/dateRange';

const PERIODS: {days: HomePeriodDays; label: string}[] = [
  {days: 7, label: '7 dias'},
  {days: 30, label: '30 dias'},
  {days: 90, label: '90 dias'},
];

export function HomeFilterSheet({
  visible,
  period,
  customRange,
  marketId,
  category,
  markets,
  categories,
  onClose,
  onApply,
}: {
  visible: boolean;
  period: HomePeriodDays;
  customRange: DateRange | null;
  marketId: number | null;
  category: string[];
  markets: {id: number; name: string}[];
  categories: string[];
  onClose: () => void;
  onApply: (next: {
    period: HomePeriodDays;
    customRange: DateRange | null;
    marketId: number | null;
    category: string[];
  }) => void;
}) {
  const [draftPeriod, setDraftPeriod] = useState(period);
  const [draftCustom, setDraftCustom] = useState<DateRange | null>(customRange);
  const [customMode, setCustomMode] = useState(customRange != null);
  const [draftMarket, setDraftMarket] = useState(marketId);
  const [draftCategory, setDraftCategory] = useState(category);

  useEffect(() => {
    if (!visible) return;
    setDraftPeriod(period);
    setDraftCustom(customRange);
    setCustomMode(customRange != null);
    setDraftMarket(marketId);
    setDraftCategory(category);
  }, [visible, period, customRange, marketId, category]);

  return (
    <KeyboardSafeSheet visible={visible} onClose={onClose}>
      <Text style={styles.title}>Filtros</Text>
      <Text style={styles.section}>Período</Text>
      <View style={styles.row}>
        {PERIODS.map(item => (
          <Pressable
            key={item.days}
            onPress={() => {
              setCustomMode(false);
              setDraftCustom(null);
              setDraftPeriod(item.days);
            }}
            style={[
              styles.chip,
              !customMode && draftPeriod === item.days && styles.chipOn,
            ]}>
            <Text
              style={[
                styles.chipText,
                !customMode && draftPeriod === item.days && styles.chipTextOn,
              ]}>
              {item.label}
            </Text>
          </Pressable>
        ))}
        <Pressable
          onPress={() => setCustomMode(true)}
          style={[styles.chip, customMode && styles.chipOn]}>
          <Text style={[styles.chipText, customMode && styles.chipTextOn]}>
            Personalizado
          </Text>
        </Pressable>
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
        {markets.map(market => (
          <Option
            key={market.id}
            label={market.name}
            on={draftMarket === market.id}
            onPress={() => setDraftMarket(market.id)}
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
            setDraftPeriod(30);
            setDraftCustom(null);
            setCustomMode(false);
            setDraftMarket(null);
            setDraftCategory([]);
          }}>
          <Text style={styles.clearText}>Limpar</Text>
        </Pressable>
        <Pressable
          style={styles.apply}
          onPress={() => {
            if (customMode && !draftCustom) return;
            onApply({
              period: draftPeriod,
              customRange: customMode ? draftCustom : null,
              marketId: draftMarket,
              category: draftCategory,
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
  check,
  onPress,
}: {
  label: string;
  on: boolean;
  check?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.option}>
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

import React, {useEffect, useState} from 'react';
import {Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import {KeyboardSafeSheet} from '@/ui/keyboardSheet';
import {colors, radii} from '@/ui/theme';
import {categoryTone} from './categoryTone';

export function HistoryFilterSheet({
  visible,
  market,
  category,
  markets,
  categories,
  onClose,
  onApply,
}: {
  visible: boolean;
  market: string | null;
  category: string | null;
  markets: string[];
  categories: string[];
  onClose: () => void;
  onApply: (next: {market: string | null; category: string | null}) => void;
}) {
  const [draftMarket, setDraftMarket] = useState(market);
  const [draftCategory, setDraftCategory] = useState(category);

  useEffect(() => {
    if (!visible) return;
    setDraftMarket(market);
    setDraftCategory(category);
  }, [visible, market, category]);

  return (
    <KeyboardSafeSheet visible={visible} onClose={onClose}>
      <Text style={styles.title}>Filtros</Text>
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
          on={draftCategory == null}
          onPress={() => setDraftCategory(null)}
        />
        {categories.map(name => (
          <Option
            key={name}
            label={name}
            dot={categoryTone(name).fg}
            on={draftCategory === name}
            onPress={() => setDraftCategory(name)}
          />
        ))}
      </ScrollView>
      <View style={styles.actions}>
        <Pressable
          style={styles.clear}
          onPress={() => {
            setDraftMarket(null);
            setDraftCategory(null);
          }}>
          <Text style={styles.clearText}>Limpar</Text>
        </Pressable>
        <Pressable
          style={styles.apply}
          onPress={() => onApply({market: draftMarket, category: draftCategory})}>
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
  onPress,
}: {
  label: string;
  on: boolean;
  dot?: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.option}>
      {dot ? <View style={[styles.dot, {backgroundColor: dot}]} /> : null}
      <Text style={styles.optionText}>{label}</Text>
      <View style={[styles.radio, on && styles.radioOn]}>
        {on ? <View style={styles.radioDot} /> : null}
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
  list: {maxHeight: 160},
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  dot: {width: 8, height: 8, borderRadius: 4, marginRight: 8},
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

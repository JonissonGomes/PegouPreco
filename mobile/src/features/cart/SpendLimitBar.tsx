import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {formatBrl, parseBrl} from '@/domain/money';
import {ProgressBar} from '@/ui/screenChrome';
import {colors} from '@/ui/theme';

const NEAR = 0.8;

export function parseSpendLimit(raw: string): number | null | 'invalid' {
  const text = raw.trim();
  if (!text) return null;
  const value = parseBrl(text);
  if (value == null || value <= 0) return 'invalid';
  return value;
}

export function spendLimitState(spent: number, limit: number) {
  const ratio = limit > 0 ? spent / limit : 0;
  const over = spent > limit + 0.001;
  const near = !over && ratio >= NEAR;
  const tone = over ? colors.danger : near ? colors.trustYellow : colors.trustGreen;
  const title = over
    ? 'Limite ultrapassado'
    : near
      ? 'Perto do limite'
      : 'Dentro do limite';
  const detail = over
    ? `${formatBrl(spent - limit)} a mais`
    : `restam ${formatBrl(Math.max(0, limit - spent))}`;
  return {ratio, tone, title, detail};
}

export function SpendLimitBar({
  spent,
  limit,
  onDark = false,
}: {
  spent: number;
  limit: number;
  onDark?: boolean;
}) {
  const state = spendLimitState(spent, limit);
  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <Text style={[styles.title, {color: onDark ? colors.white : state.tone}]}>
          {state.title}
        </Text>
        <Text style={[styles.detail, {color: onDark ? state.tone : colors.ink}]}>
          {formatBrl(spent)} de {formatBrl(limit)}
        </Text>
      </View>
      <ProgressBar progress={state.ratio} height={8} fillColor={state.tone} />
      <Text style={[styles.caption, {color: onDark ? state.tone : colors.muted}]}>
        {state.detail}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {gap: 6},
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  title: {fontSize: 13, fontWeight: '800'},
  detail: {flexShrink: 1, fontSize: 12, fontWeight: '700', textAlign: 'right'},
  caption: {fontSize: 12, fontWeight: '700'},
});

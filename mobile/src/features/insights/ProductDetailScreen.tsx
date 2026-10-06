import React, {useMemo} from 'react';
import {ScrollView, StyleSheet, Text, View} from 'react-native';
import {useRoute} from '@react-navigation/native';
import {AppScreenHeader} from '@/ui/chrome';
import {colors} from '@/ui/theme';
import {formatBrl} from '@/domain/money';
import {priceLogRepo, productRepo} from '@/store/appStore';

export function ProductDetailScreen() {
  const route = useRoute<any>();
  const productId = Number(route.params?.productId);
  const product = productRepo.getById(productId);
  const logs = useMemo(() => priceLogRepo.forProduct(productId), [productId]);
  const stats = useMemo(
    () => priceLogRepo.statsForProduct(productId),
    [productId],
  );

  return (
    <View style={styles.root}>
      <AppScreenHeader title={product?.name ?? 'Produto'} subtitle="Detalhe" />
      <ScrollView contentContainerStyle={styles.body}>
        {stats ? (
          <>
            <View style={styles.statsRow}>
              <Stat label="Menor" value={formatBrl(stats.minPrice)} accent={colors.trustGreen} />
              <Stat label="Média" value={formatBrl(stats.avgPrice)} />
              <Stat label="Maior" value={formatBrl(stats.maxPrice)} accent={colors.danger} />
            </View>
            <View style={styles.card}>
              <Text style={styles.label}>Última compra</Text>
              <Text style={styles.big}>{formatBrl(stats.lastPrice)}</Text>
              {stats.lastMarketName ? (
                <Text style={styles.muted}>{stats.lastMarketName}</Text>
              ) : null}
            </View>
          </>
        ) : null}
        <Text style={styles.section}>Histórico de compra</Text>
        {logs.map(log => (
          <View key={log.id} style={styles.card}>
            <Text style={styles.big}>{formatBrl(log.retailPrice)}</Text>
            <Text style={styles.muted}>
              {log.source} ·{' '}
              {new Date(log.capturedAt).toLocaleString('pt-BR')}
            </Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <View style={styles.stat}>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.statValue, accent ? {color: accent} : null]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: colors.bg},
  body: {padding: 16, gap: 10, paddingBottom: 40},
  statsRow: {flexDirection: 'row', gap: 8},
  stat: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    alignItems: 'center',
  },
  label: {color: colors.muted, fontWeight: '700', fontSize: 11},
  statValue: {fontWeight: '800', color: colors.navy, marginTop: 4, fontSize: 14},
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
  },
  big: {fontWeight: '800', fontSize: 18, color: colors.navy},
  muted: {color: colors.muted, marginTop: 2},
  section: {fontWeight: '800', fontSize: 16, color: colors.navy, marginTop: 8},
});

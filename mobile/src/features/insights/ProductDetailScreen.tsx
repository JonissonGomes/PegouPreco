import React, {useMemo} from 'react';
import {Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import {useNavigation, useRoute} from '@react-navigation/native';
import {ArrowLeft} from 'lucide-react-native';
import {
  AppScreenHeader,
  AppScreenNavyBar,
} from '@/ui/chrome';
import {PriceTrustBadge, SectionHeader} from '@/ui/components';
import {colors, radii, space} from '@/ui/theme';
import {formatBrl} from '@/domain/money';
import {priceLogRepo, productRepo} from '@/store/appStore';

export function ProductDetailScreen() {
  const nav = useNavigation();
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
      <AppScreenHeader
        title={product?.name ?? 'Produto'}
        subtitle="Linha do tempo de preços"
        leading={
          <Pressable onPress={() => nav.goBack()} style={{padding: 8}}>
            <ArrowLeft color={colors.navy} size={22} />
          </Pressable>
        }
      />
      <AppScreenNavyBar
        value={stats ? formatBrl(stats.lastPrice) : '—'}
        label="última compra"
        trailing={
          <View style={styles.pill}>
            <Text style={styles.pillText}>{logs.length} registros</Text>
          </View>
        }
      />
      <ScrollView contentContainerStyle={styles.body}>
        {stats ? (
          <>
            <View style={styles.statsRow}>
              <Stat
                label="Menor"
                value={formatBrl(stats.minPrice)}
                tone="good"
              />
              <Stat label="Média" value={formatBrl(stats.avgPrice)} />
              <Stat
                label="Maior"
                value={formatBrl(stats.maxPrice)}
                tone="bad"
              />
            </View>
            <View style={styles.heroCard}>
              <Text style={styles.kicker}>Última conquista de preço</Text>
              <Text style={styles.big}>{formatBrl(stats.lastPrice)}</Text>
              {stats.lastMarketName ? (
                <Text style={styles.muted}>{stats.lastMarketName}</Text>
              ) : null}
            </View>
          </>
        ) : null}

        <SectionHeader title="Histórico de compra" />
        <View style={styles.listPad}>
          {logs.length === 0 ? (
            <Text style={styles.muted}>Sem registros ainda.</Text>
          ) : (
            logs.map(log => (
              <View key={log.id} style={styles.card}>
                <View style={styles.cardTop}>
                  <Text style={styles.cardPrice}>
                    {formatBrl(log.retailPrice)}
                  </Text>
                  <PriceTrustBadge level={log.trustLevel} />
                </View>
                <Text style={styles.muted}>
                  {log.source} ·{' '}
                  {new Date(log.capturedAt).toLocaleString('pt-BR')}
                </Text>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </View>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'good' | 'bad';
}) {
  return (
    <View
      style={[
        styles.stat,
        tone === 'good' && styles.statGood,
        tone === 'bad' && styles.statBad,
      ]}>
      <Text style={styles.label}>{label}</Text>
      <Text
        style={[
          styles.statValue,
          tone === 'good' && {color: colors.trustGreen},
          tone === 'bad' && {color: colors.danger},
        ]}
        numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: colors.bg},
  body: {paddingBottom: 40},
  pill: {
    backgroundColor: colors.yellowBright,
    borderRadius: radii.pill,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  pillText: {color: colors.navy, fontWeight: '800', fontSize: 11},
  statsRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: space.md,
    paddingTop: space.md,
  },
  stat: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    alignItems: 'center',
  },
  statGood: {backgroundColor: '#ECFDF5', borderColor: '#A7F3D0'},
  statBad: {backgroundColor: '#FEF2F2', borderColor: '#FECACA'},
  label: {color: colors.muted, fontWeight: '800', fontSize: 10, letterSpacing: 0.3},
  statValue: {fontWeight: '800', color: colors.navy, marginTop: 4, fontSize: 14},
  heroCard: {
    margin: space.md,
    padding: space.md,
    backgroundColor: colors.yellowBright,
    borderRadius: radii.lg,
    borderWidth: 2,
    borderColor: colors.navy,
    gap: 4,
  },
  kicker: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.navy,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    opacity: 0.75,
  },
  big: {fontWeight: '900', fontSize: 28, color: colors.navy},
  muted: {color: colors.muted, marginTop: 2, fontWeight: '600', fontSize: 12},
  listPad: {paddingHorizontal: space.md, gap: 8},
  card: {
    backgroundColor: '#fff',
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  cardPrice: {fontWeight: '800', fontSize: 18, color: colors.navy},
});

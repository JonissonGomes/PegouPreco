import React, {useEffect, useState} from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {MapPin, Star, TrendingDown, TrendingUp, Minus} from 'lucide-react-native';
import {KeyboardSafeSheet} from '@/ui/keyboardSheet';
import {colors} from '@/ui/theme';
import {
  formatDistanceKm,
  priceBandLabel,
  resolvePriceBand,
  type PriceBand,
} from '@/domain/marketUi';
import type {Market} from '@/data/types';

function BandIcon({band}: {band: PriceBand}) {
  if (band === 'low') return <TrendingDown size={16} color={colors.trustGreen} />;
  if (band === 'high') return <TrendingUp size={16} color={colors.danger} />;
  return <Minus size={16} color={colors.trustYellow} />;
}

function bandStyle(band: PriceBand) {
  if (band === 'low') return styles.bandLow;
  if (band === 'high') return styles.bandHigh;
  if (band === 'fair') return styles.bandFair;
  return styles.bandUnknown;
}

export function MarketPinSheet({
  market,
  distanceKm,
  onClose,
  onUse,
}: {
  market: Market | null;
  distanceKm?: number | null;
  onClose: () => void;
  onUse?: (market: Market) => void;
}) {
  // Mantém o último mercado durante o fade-out do sheet.
  const [cached, setCached] = useState<Market | null>(market);
  const [cachedDist, setCachedDist] = useState(distanceKm);

  useEffect(() => {
    if (market) {
      setCached(market);
      setCachedDist(distanceKm);
    }
  }, [market, distanceKm]);

  const shown = market ?? cached;
  const dist = market ? distanceKm : cachedDist;
  const band = shown ? resolvePriceBand(shown) : 'unknown';
  const rating = shown?.avgRating ?? 0;

  return (
    <KeyboardSafeSheet visible={!!market} onClose={onClose}>
      {shown ? (
        <>
          <View style={styles.hero}>
            <View style={styles.pinBadge}>
              <MapPin size={22} color={colors.navy} />
            </View>
            <View style={{flex: 1}}>
              <Text style={styles.title}>{shown.name}</Text>
              <Text style={styles.addr} numberOfLines={2}>
                {shown.address || 'Endereço não informado'}
              </Text>
            </View>
          </View>

          <View style={styles.stats}>
            <View style={styles.stat}>
              <Text style={styles.statLabel}>Distância</Text>
              <Text style={styles.statValue}>{formatDistanceKm(dist)}</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statLabel}>Nota</Text>
              <View style={styles.ratingRow}>
                <Star
                  size={14}
                  color={colors.yellowBright}
                  fill={colors.yellowBright}
                />
                <Text style={styles.statValue}>
                  {rating > 0 ? rating.toFixed(1) : '—'}
                </Text>
              </View>
              <Text style={styles.statHint}>
                {shown.ratingsCount > 0
                  ? `${shown.ratingsCount} avaliações`
                  : 'ainda sem avaliações'}
              </Text>
            </View>
            <View style={[styles.stat, bandStyle(band)]}>
              <Text style={styles.statLabel}>Preço</Text>
              <View style={styles.ratingRow}>
                <BandIcon band={band} />
                <Text style={styles.statValue}>{priceBandLabel(band)}</Text>
              </View>
              <Text style={styles.statHint}>pela comunidade</Text>
            </View>
          </View>

          {onUse ? (
            <Pressable style={styles.cta} onPress={() => onUse(shown)}>
              <Text style={styles.ctaText}>Usar este mercado</Text>
            </Pressable>
          ) : null}
          <Pressable style={styles.secondary} onPress={onClose}>
            <Text style={styles.secondaryText}>Fechar</Text>
          </Pressable>
        </>
      ) : (
        <View />
      )}
    </KeyboardSafeSheet>
  );
}

const styles = StyleSheet.create({
  hero: {flexDirection: 'row', gap: 12, alignItems: 'flex-start'},
  pinBadge: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: colors.yellowBright,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.navy,
    letterSpacing: -0.3,
  },
  addr: {marginTop: 4, color: colors.muted, fontWeight: '600', fontSize: 13},
  stats: {flexDirection: 'row', gap: 8, marginTop: 16},
  stat: {
    flex: 1,
    backgroundColor: colors.bg,
    borderRadius: 14,
    padding: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  bandLow: {backgroundColor: '#ECFDF5', borderColor: '#A7F3D0'},
  bandFair: {backgroundColor: '#FFFBEB', borderColor: '#FDE68A'},
  bandHigh: {backgroundColor: '#FEF2F2', borderColor: '#FECACA'},
  bandUnknown: {},
  statLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  statValue: {
    marginTop: 4,
    fontSize: 14,
    fontWeight: '800',
    color: colors.navy,
  },
  statHint: {marginTop: 2, fontSize: 10, color: colors.muted, fontWeight: '600'},
  ratingRow: {flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4},
  cta: {
    marginTop: 16,
    backgroundColor: colors.navy,
    borderRadius: 16,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: {color: '#fff', fontWeight: '800', fontSize: 15},
  secondary: {
    marginTop: 8,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryText: {color: colors.navy, fontWeight: '700'},
});

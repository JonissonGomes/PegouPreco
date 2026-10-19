import React, {useEffect, useMemo, useState} from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {MapPin, Star, TrendingDown, TrendingUp, Minus, TriangleAlert} from 'lucide-react-native';
import {AppButton} from '@/ui/chrome';
import {appAlert} from '@/ui/appDialog';
import {KeyboardSafeSheet} from '@/ui/keyboardSheet';
import {MarketReviewSheet} from '@/ui/MarketReviewSheet';
import {XpBurst} from '@/ui/gamification';
import {colors} from '@/ui/theme';
import {
  formatDistanceKm,
  priceBandLabel,
  resolvePriceBand,
  type PriceBand,
} from '@/domain/marketUi';
import type {Market} from '@/data/types';
import {canContribute, marketRepo, prefs, priceLogRepo, useAppStore} from '@/store/appStore';
import {syncApi} from '@/data/remote/syncApi';
import {apiErrorMessage} from '@/data/remote/apiError';
import {reverseGeocode} from '@/data/remote/reverseGeocode';
import {MAPBOX_ACCESS_TOKEN} from '@/config/env';
import {PIN_REPORTS, type PinReportId} from '@/domain/pinReports';
import {friendlyMarketTitle, relatedMarketIds} from '@/domain/marketBrand';
import {getState} from '@/data/db';
import {marketShelf} from '@/domain/marketShelf';
import {MarketShelfBlock} from '@/ui/MarketShelfBlock';

function BandIcon({band}: {band: PriceBand}) {
  if (band === 'low') return <TrendingDown size={16} color={colors.trustGreen} />;
  if (band === 'high') return <TrendingUp size={16} color={colors.danger} />;
  return <Minus size={16} color={colors.trustYellow} />;
}

function userRegisteredReceipt(market: Market) {
  const ids = new Set(relatedMarketIds(market, marketRepo.all()));
  return getState().price_logs.some(
    log =>
      log.marketId != null &&
      ids.has(log.marketId) &&
      log.source === 'nfce' &&
      !!log.nfceKey,
  ) || getState().shopping_lists.some(
    list => list.marketId != null && ids.has(list.marketId) && !!list.nfceKey,
  );
}

function marketKey(market: Market) {
  return market.remoteId || `local:${market.id}`;
}

function localWeeklyVisitors(market: Market) {
  const ids = new Set(relatedMarketIds(market, marketRepo.all()));
  const since = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const users = new Set<string>();
  for (const log of getState().price_logs) {
    if (log.marketId == null || !ids.has(log.marketId)) continue;
    if (Date.parse(log.capturedAt) < since) continue;
    users.add(log.contributorId || 'local-shopper');
  }
  for (const list of getState().shopping_lists) {
    if (list.marketId == null || !ids.has(list.marketId)) continue;
    if (Date.parse(list.finishedAt) < since) continue;
    users.add('local-shopper');
  }
  return users.size;
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
  const nav = useNavigation<any>();
  const markets = useAppStore(s => s.markets);
  const products = useAppStore(s => s.products);
  const lists = useAppStore(s => s.lists);
  const auth = useAppStore(s => s.auth);
  const [cached, setCached] = useState<Market | null>(market);
  const [cachedDist, setCachedDist] = useState(distanceKm);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewBusy, setReviewBusy] = useState(false);
  const [burst, setBurst] = useState<{points: number; title: string} | null>(
    null,
  );
  const [addressLine, setAddressLine] = useState('');
  const [confirmedKeys, setConfirmedKeys] = useState<string[]>(() =>
    prefs.confirmedMarketKeys(),
  );

  useEffect(() => {
    if (market) {
      setCached(market);
      setCachedDist(distanceKm);
      setReviewOpen(false);
    }
  }, [market, distanceKm]);

  const shown = market ?? cached;
  const dist = market ? distanceKm : cachedDist;
  const band = shown ? resolvePriceBand(shown) : 'unknown';
  const rating = shown?.avgRating ?? 0;
  const visitors = shown
    ? Math.max(shown.weeklyVisitors ?? 0, localWeeklyVisitors(shown))
    : 0;
  const locationConfirmed = shown
    ? confirmedKeys.includes(marketKey(shown))
    : false;
  const shelf = useMemo(
    () =>
      shown
        ? marketShelf(shown, markets, products, priceLogRepo.all(), lists)
        : [],
    [shown, markets, products, lists],
  );

  useEffect(() => {
    if (!shown?.lat || shown.lng == null) {
      setAddressLine(shown?.address || '');
      return;
    }
    const current = shown.address?.trim() || '';
    const thin =
      !current || !current.includes(',') || /^BR[-\s]?\d+$/i.test(current);
    if (!thin) {
      setAddressLine(current);
      return;
    }
    let cancelled = false;
    setAddressLine(current);
    void reverseGeocode(shown.lat, shown.lng, MAPBOX_ACCESS_TOKEN).then(hit => {
      if (cancelled || !hit?.city) return;
      const base = current && !/^BR[-\s]?\d+$/i.test(current) ? current : '';
      const line = [base, hit.neighborhood, hit.city]
        .filter(Boolean)
        .filter((part, index, all) => all.indexOf(part) === index)
        .join(', ');
      setAddressLine(line || hit.city);
    });
    return () => {
      cancelled = true;
    };
  }, [shown?.id, shown?.address, shown?.lat, shown?.lng]);

  const requireVerified = (action: string) => {
    if (!canContribute(auth) || !auth?.token) {
      appAlert(
        'Conta necessária',
        `Verifique o e-mail no Perfil para ${action}.`,
        [
          {label: 'Agora não', style: 'cancel'},
          {
            label: 'Ir ao Perfil',
            style: 'primary',
            onPress: () => nav.navigate('Main', {screen: 'Profile'}),
          },
        ],
      );
      return false;
    }
    return true;
  };

  const submitReview = async (stars: number, tags: string[]) => {
    if (!shown) return;
    if (!requireVerified('avaliar mercados')) return;
    if (!shown.remoteId) {
      appAlert(
        'Mercado ainda local',
        'Sincronize no Perfil para enviar a avaliação deste mercado.',
        [
          {label: 'Ok', style: 'cancel'},
          {
            label: 'Ir ao Perfil',
            style: 'primary',
            onPress: () => nav.navigate('Main', {screen: 'Profile'}),
          },
        ],
      );
      return;
    }
    setReviewBusy(true);
    try {
      const data = (await syncApi.submitMarketReview(
        auth.token!,
        shown.remoteId,
        stars,
        tags,
      )) as {avgRating?: number; ratingsCount?: number};
      if (data?.avgRating != null) {
        marketRepo.upsertGeo(shown.id, {
          avgRating: Number(data.avgRating),
          ratingsCount: Number(data.ratingsCount ?? shown.ratingsCount),
          synced: 1,
        });
        useAppStore.getState().refresh();
      }
      setReviewOpen(false);
      setBurst({points: 5, title: `${stars}★ no ${shown.name}`});
    } catch (e) {
      appAlert('Avaliação', apiErrorMessage(e));
    } finally {
      setReviewBusy(false);
    }
  };

  const submitSuggestion = async (
    kind: 'confirm' | 'fix',
    reportType?: PinReportId,
    reportLabel?: string,
  ) => {
    if (!shown) return;
    if (!requireVerified('contribuir com mercados')) return;
    if (shown.lat == null || shown.lng == null) {
      appAlert('Localização', 'Este mercado ainda não tem coordenadas.');
      return;
    }
    setReviewBusy(true);
    try {
      await syncApi.submitMarketSuggestion(auth!.token!, {
        name: shown.name,
        lat: shown.lat,
        lng: shown.lng,
        address: addressLine || shown.address,
        cnpj: shown.cnpj,
        kind,
        reportType,
        targetMarketId: shown.remoteId,
        note:
          kind === 'fix'
            ? reportLabel ?? 'Usuário reportou pin incorreto'
            : 'Usuário confirmou localização',
      });
      if (kind === 'confirm') {
        const key = marketKey(shown);
        prefs.markMarketConfirmed(key);
        setConfirmedKeys(prefs.confirmedMarketKeys());
      }
      appAlert(
        'Obrigado!',
        kind === 'confirm'
          ? 'Confirmação enviada para a comunidade.'
          : 'Reporte enviado. Um admin vai revisar.',
      );
    } catch (e) {
      appAlert('Sugestão', apiErrorMessage(e));
    } finally {
      setReviewBusy(false);
    }
  };

  const reportPin = () => {
    appAlert('Reportar erro', 'O que está errado neste pin?', [
      ...PIN_REPORTS.map(item => ({
        label: item.label,
        onPress: () => void submitSuggestion('fix', item.id, item.label),
      })),
      {label: 'Cancelar', style: 'cancel' as const},
    ]);
  };

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <KeyboardSafeSheet visible={!!market && !reviewOpen} onClose={onClose}>
        {shown ? (
          <>
            <View style={styles.hero}>
              <View style={styles.pinBadge}>
                <MapPin size={22} color={colors.navy} />
              </View>
              <View style={{flex: 1}}>
                <Text style={styles.title}>
                  {friendlyMarketTitle(shown, markets)}
                </Text>
                <Text style={styles.addr} numberOfLines={3}>
                  {addressLine || 'Buscando endereço…'}
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
                <Text style={styles.statLabel}>Tendência</Text>
                <View style={styles.ratingRow}>
                  <BandIcon band={band} />
                  <Text style={styles.statValue}>{priceBandLabel(band)}</Text>
                </View>
                <Text style={styles.statHint}>pela comunidade</Text>
              </View>
            </View>
            <Text style={styles.visits}>
              {visitors === 1
                ? '1 pessoa passou neste mercado na semana'
                : `${visitors} pessoas passaram neste mercado na semana`}
            </Text>
            <MarketShelfBlock shelf={shelf} />

            {onUse ? (
              <AppButton
                label="Estou neste mercado"
                onPress={() => onUse(shown)}
              />
            ) : null}
            {userRegisteredReceipt(shown) ? (
              <AppButton
                accent
                icon={<Star size={18} color={colors.navy} fill={colors.navy} />}
                label="Avaliar mercado · +5 pts"
                onPress={() => setReviewOpen(true)}
              />
            ) : null}
            {locationConfirmed ? null : (
              <AppButton
                outlined
                label="Confirmar localização"
                onPress={() => void submitSuggestion('confirm')}
              />
            )}
            <Pressable style={styles.secondary} onPress={onClose}>
              <Text style={styles.secondaryText}>Fechar</Text>
            </Pressable>
            <Pressable
              style={styles.alertBtn}
              onPress={reportPin}
              accessibilityLabel="Reportar erro neste pin">
              <TriangleAlert size={18} color={colors.danger} />
            </Pressable>
          </>
        ) : (
          <View />
        )}
      </KeyboardSafeSheet>

      <MarketReviewSheet
        visible={reviewOpen && !!shown}
        marketName={shown?.name ?? 'Mercado'}
        busy={reviewBusy}
        onClose={() => setReviewOpen(false)}
        onSubmit={submitReview}
      />

      <XpBurst
        visible={!!burst}
        points={burst?.points ?? 0}
        title={burst?.title}
        onDone={() => setBurst(null)}
      />
    </View>
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
  visits: {
    marginTop: 10,
    color: colors.navy,
    fontWeight: '700',
    fontSize: 13,
  },
  stats: {flexDirection: 'row', gap: 8, marginTop: 16, marginBottom: 8},
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
  secondary: {
    marginTop: 4,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryText: {color: colors.navy, fontWeight: '700'},
  alertBtn: {
    alignSelf: 'center',
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FEF2F2',
  },
});

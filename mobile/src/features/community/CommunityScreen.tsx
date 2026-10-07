import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {FlatList, Pressable, StyleSheet, Text, View} from 'react-native';
import {useFocusEffect, useNavigation} from '@react-navigation/native';
import {
  BadgeCheck,
  MapPin,
  Star,
  ThumbsUp,
  UsersRound,
} from 'lucide-react-native';
import {
  Screen,
  VoteButtons,
  XpBurst,
} from '@/ui/components';
import {appAlert} from '@/ui/appDialog';
import {FeatureEmptyGuide} from '@/ui/FeatureEmptyGuide';
import {MarketReviewSheet} from '@/ui/MarketReviewSheet';
import {
  FiscalChip,
  SavePill,
  SoftCard,
  SoftHeader,
} from '@/ui/screenChrome';
import {colors, space, spacing} from '@/ui/theme';
import {requestAutoSync} from '@/data/syncWorker';
import {formatBrl} from '@/domain/money';
import {TrustEngine} from '@/domain/trust';
import {canContribute, prefs, useAppStore} from '@/store/appStore';
import {getState} from '@/data/db';
import {
  haversineKm,
  NEARBY_RADIUS_KM,
} from '@/data/remote/nearbyMarkets';
import type {FiscalLevel, PriceLog, TrustLevel} from '@/data/types';
import {syncApi, type ReputationRemote} from '@/data/remote/syncApi';
import {apiErrorMessage} from '@/data/remote/apiError';

type FeedItem = {
  log: PriceLog;
  productName: string;
  marketName: string;
  avgPct: number | null;
  distanceKm: number | null;
};

type Burst = {points: number; title: string} | null;

/** Limiares alinhados a TrustEngine.levelForPoints (100 Prata, 300 Ouro). */
const FISCAL_THRESHOLDS = {silver: 100, gold: 300} as const;

function fiscalUi(points: number) {
  const level = TrustEngine.levelForPoints(points);
  const prev =
    level === 'gold'
      ? FISCAL_THRESHOLDS.gold
      : level === 'silver'
        ? FISCAL_THRESHOLDS.silver
        : 0;
  const next =
    level === 'bronze'
      ? FISCAL_THRESHOLDS.silver
      : level === 'silver'
        ? FISCAL_THRESHOLDS.gold
        : FISCAL_THRESHOLDS.gold;
  const progress =
    level === 'gold'
      ? 1
      : next > prev
        ? Math.min(1, Math.max(0, (points - prev) / (next - prev)))
        : 1;
  const hint =
    level === 'gold'
      ? 'Continue validando para manter sua reputação.'
      : level === 'bronze'
        ? 'Valide preços para chegar ao nível Prata.'
        : 'Valide preços para chegar ao nível Ouro.';
  return {level, next, progress, hint};
}

function avgPriceForProduct(productId: number, excludeId: number): number | null {
  const prices = getState()
    .price_logs.filter(l => l.productId === productId && l.id !== excludeId)
    .map(l => l.retailPrice);
  if (!prices.length) return null;
  return prices.reduce((a, b) => a + b, 0) / prices.length;
}

function formatDist(km: number | null): string | null {
  if (km == null) return null;
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1)} km`;
}

export function CommunityScreen() {
  const nav = useNavigation<any>();
  const auth = useAppStore(s => s.auth);
  const markets = useAppStore(s => s.markets);
  const products = useAppStore(s => s.products);
  const refresh = useAppStore(s => s.refresh);
  const loc = prefs.getLocationPrefs();
  const [busyId, setBusyId] = useState<number | null>(null);
  const [reviewMarketId, setReviewMarketId] = useState<number | null>(null);
  const [reviewBusy, setReviewBusy] = useState(false);
  const [rep, setRep] = useState<ReputationRemote | null>(null);
  const [burst, setBurst] = useState<Burst>(null);
  const [skipped, setSkipped] = useState<Set<number>>(() => new Set());
  const [origin, setOrigin] = useState(() => prefs.getLastLocation());

  const needAccount = (message: string) => {
    appAlert('Conta necessária', message, [
      {label: 'Agora não', style: 'cancel'},
      {
        label: 'Ir ao Perfil',
        style: 'primary',
        onPress: () => nav.navigate('Profile'),
      },
    ]);
  };

  useFocusEffect(
    useCallback(() => {
      setOrigin(prefs.getLastLocation());
      requestAutoSync('community');
      refresh();
    }, [refresh]),
  );

  useEffect(() => {
    if (!auth?.token) {
      setRep(null);
      return;
    }
    syncApi
      .reputation(auth.token)
      .then(setRep)
      .catch(() => setRep(null));
  }, [auth?.token]);

  const nearbyMarketIds = useMemo(() => {
    if (!origin) return new Set<number>();
    const ids = new Set<number>();
    for (const m of markets) {
      if (m.lat == null || m.lng == null) continue;
      const km = haversineKm(origin, {lat: m.lat, lng: m.lng});
      if (km <= NEARBY_RADIUS_KM) ids.add(m.id);
    }
    return ids;
  }, [markets, origin]);

  const feed = useMemo(() => {
    const logs = getState().price_logs.filter(l => l.trustLevel === 'suspect');
    return logs
      .filter(log => {
        if (skipped.has(log.id)) return false;
        if (log.marketId == null) return false;
        return nearbyMarketIds.has(log.marketId);
      })
      .map(log => {
        const market = markets.find(m => m.id === log.marketId);
        const avg = avgPriceForProduct(log.productId, log.id);
        const avgPct =
          avg != null && avg > 0
            ? ((log.retailPrice - avg) / avg) * 100
            : null;
        const distanceKm =
          origin && market?.lat != null && market?.lng != null
            ? haversineKm(origin, {lat: market.lat, lng: market.lng})
            : null;
        return {
          log,
          productName:
            products.find(p => p.id === log.productId)?.name ?? 'Produto',
          marketName: market?.name ?? 'Mercado',
          avgPct,
          distanceKm,
        };
      })
      .sort((a, b) => {
        const da = a.distanceKm ?? Infinity;
        const db = b.distanceKm ?? Infinity;
        if (da !== db) return da - db;
        return (
          new Date(b.log.capturedAt).getTime() -
          new Date(a.log.capturedAt).getTime()
        );
      })
      .slice(0, 40);
  }, [markets, products, refresh, nearbyMarketIds, skipped, origin]);

  const pending = feed.length;
  const points = rep?.points ?? 0;
  const level =
    (rep?.level as FiscalLevel) ?? TrustEngine.levelForPoints(points);
  const fiscal = fiscalUi(points);

  const celebrate = (pts: number, title: string) => {
    setBurst({points: pts, title});
    if (auth?.token) {
      syncApi
        .reputation(auth.token)
        .then(setRep)
        .catch(() => undefined);
    }
  };

  const vote = useCallback(
    async (item: FeedItem, voteType: 'confirm' | 'reject') => {
      if (!canContribute(auth)) {
        needAccount(
          'Verifique seu e-mail ou telefone no Perfil para validar preços.',
        );
        return;
      }
      const remoteId = item.log.remoteId;
      if (!remoteId || !auth?.token) {
        appAlert(
          'Aguarde a sincronização',
          'Os preços ainda estão só no aparelho. Com rede, a sync roda sozinha.',
        );
        requestAutoSync('vote');
        return;
      }
      setBusyId(item.log.id);
      const pts = TrustEngine.pointsForVote(voteType, false);
      try {
        const weight = TrustEngine.weightFor(level);
        await syncApi.castVote(auth.token, {
          priceLogId: remoteId,
          vote: voteType,
          withPhoto: false,
          weight,
        });
        const st = getState();
        const log = st.price_logs.find(l => l.id === item.log.id);
        if (log) {
          if (voteType === 'confirm') {
            log.confirmScore += weight;
            log.lastConfirmedAt = new Date().toISOString();
          } else {
            log.rejectScore += weight;
          }
          log.trustLevel = TrustEngine.compute({
            confirmScore: log.confirmScore,
            rejectScore: log.rejectScore,
            lastConfirmedAt: log.lastConfirmedAt,
          }) as TrustLevel;
          log.synced = 0;
        }
        refresh();
        celebrate(
          pts,
          voteType === 'confirm' ? 'Preço confirmado!' : 'Preço rejeitado!',
        );
      } catch (e) {
        appAlert('Voto', apiErrorMessage(e));
      } finally {
        setBusyId(null);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [auth, refresh, level, nav],
  );

  const reviewMarket = markets.find(m => m.id === reviewMarketId);

  const submitReview = async (stars: number) => {
    if (!canContribute(auth) || !auth?.token) {
      needAccount('Verifique a conta no Perfil para avaliar mercados.');
      return;
    }
    const rid = reviewMarket?.remoteId;
    if (!rid) {
      appAlert(
        'Mercado ainda local',
        'Aguarde a sincronização automática para enviar a avaliação.',
      );
      requestAutoSync('review');
      return;
    }
    setReviewBusy(true);
    try {
      await syncApi.submitMarketReview(auth.token, rid, stars);
      setReviewMarketId(null);
      celebrate(5, `${stars}★ no ${reviewMarket?.name ?? 'mercado'}`);
    } catch (e) {
      appAlert('Avaliação', apiErrorMessage(e));
    } finally {
      setReviewBusy(false);
    }
  };

  const region =
    [loc.neighborhood, loc.city].filter(Boolean).join(', ') ||
    'Sua região';

  const priceBadge = (pct: number | null) => {
    if (pct == null) return null;
    const below = pct <= -1;
    const label = below
      ? `${Math.abs(Math.round(pct))}%↓`
      : `${Math.round(Math.abs(pct))}%↑`;
    return (
      <SavePill label={label} tone={below ? 'green' : 'orange'} />
    );
  };

  return (
    <Screen>
      <SoftHeader
        title="Comunidade"
        location={region}
        trailing={
          <FiscalChip
            level={fiscal.level}
            points={points}
            accessibilityLabel={fiscal.hint}
          />
        }
      />

      <FlatList
        data={feed}
        keyExtractor={i => String(i.log.id)}
        contentContainerStyle={[
          styles.list,
          feed.length === 0 && styles.listEmpty,
        ]}
        ListHeaderComponent={
          <View style={styles.sectionHead}>
            <Text style={styles.listHeading}>Perto de você</Text>
            {pending > 0 ? (
              <SavePill
                label={`${pending} pendentes`}
                tone="orange"
              />
            ) : null}
          </View>
        }
        ListEmptyComponent={
          <FeatureEmptyGuide
            HeroIcon={UsersRound}
            title={
              origin
                ? 'Nada para validar por perto'
                : 'Ative a localização'
            }
            subtitle={
              origin
                ? `Só listamos preços de mercados a até ${NEARBY_RADIUS_KM} km. Quando houver pendências na região, elas aparecem aqui.`
                : 'Precisamos da sua localização para mostrar preços de mercados próximos.'
            }
            stepsLabel="O que você faz nesta tela"
            steps={[
              {
                n: '1',
                title: 'Fila local',
                text: 'Só entram preços suspeitos de mercados perto de você.',
                Icon: MapPin,
              },
              {
                n: '2',
                title: 'Vote ou pule',
                text: 'Confere, Não sei ou Errado — sem pressão.',
                Icon: ThumbsUp,
              },
              {
                n: '3',
                title: 'Suba de Fiscal',
                text: 'Cada voto rende pontos — Bronze, Prata e Ouro.',
                Icon: BadgeCheck,
              },
            ]}
            PrimaryIcon={MapPin}
            primaryLabel="Ver mercados no mapa"
            onPrimary={() => nav.navigate('Map')}
          />
        }
        renderItem={({item}) => {
          const dist = formatDist(item.distanceKm);
          return (
            <SoftCard style={styles.validateCard}>
              <View style={styles.cardTop}>
                <View style={styles.cardMain}>
                  <Text style={styles.name} numberOfLines={1}>
                    {item.productName}
                  </Text>
                  <Text style={styles.meta} numberOfLines={1}>
                    {item.marketName}
                    {dist ? ` · ${dist}` : ''}
                  </Text>
                </View>
                <View style={styles.cardSide}>
                  <Text style={styles.price}>
                    {formatBrl(item.log.retailPrice)}
                  </Text>
                  {priceBadge(item.avgPct)}
                </View>
              </View>

              <VoteButtons
                busy={busyId === item.log.id}
                onConfirm={() => vote(item, 'confirm')}
                onReject={() => vote(item, 'reject')}
                onSkip={() =>
                  setSkipped(prev => new Set(prev).add(item.log.id))
                }
              />

              {item.log.marketId != null ? (
                <Pressable
                  style={styles.reviewBtn}
                  onPress={() => setReviewMarketId(item.log.marketId)}>
                  <Star size={14} color={colors.navy} fill={colors.navy} />
                  <Text style={styles.reviewBtnText}>Avaliar mercado</Text>
                </Pressable>
              ) : null}
            </SoftCard>
          );
        }}
      />

      <MarketReviewSheet
        visible={reviewMarketId != null}
        marketName={reviewMarket?.name ?? 'Mercado'}
        busy={reviewBusy}
        onClose={() => setReviewMarketId(null)}
        onSubmit={submitReview}
      />

      <XpBurst
        visible={!!burst}
        points={burst?.points ?? 0}
        title={burst?.title}
        onDone={() => setBurst(null)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: space.sm,
    gap: 8,
  },
  listHeading: {fontWeight: '900', fontSize: 18, color: colors.navy, flex: 1},
  list: {padding: space.md, paddingBottom: 120},
  listEmpty: {
    flexGrow: 1,
    paddingBottom: spacing.bottomNavClearance,
  },
  validateCard: {marginBottom: space.sm, gap: space.xs, paddingVertical: 12},
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  cardMain: {flex: 1, minWidth: 0, gap: 2},
  cardSide: {alignItems: 'flex-end', gap: 4},
  name: {fontWeight: '900', color: colors.navy, fontSize: 15},
  meta: {color: colors.muted, fontWeight: '600', fontSize: 12},
  price: {fontWeight: '900', color: colors.navy, fontSize: 18},
  reviewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingTop: 4,
  },
  reviewBtnText: {fontWeight: '700', color: colors.muted, fontSize: 11},
});

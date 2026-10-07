import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {FlatList, Pressable, StyleSheet, Text, View} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {
  BadgeCheck,
  RefreshCw,
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
  SavePill,
  SoftCard,
  SoftHeader,
} from '@/ui/screenChrome';
import {colors, radii, space, spacing} from '@/ui/theme';
import {runFullSync} from '@/data/syncWorker';
import {formatBrl} from '@/domain/money';
import {TrustEngine} from '@/domain/trust';
import {canContribute, prefs, useAppStore} from '@/store/appStore';
import {getState} from '@/data/db';
import type {FiscalLevel, PriceLog, TrustLevel} from '@/data/types';
import {syncApi, type ReputationRemote} from '@/data/remote/syncApi';
import {apiErrorMessage} from '@/data/remote/apiError';

type FeedItem = {
  log: PriceLog;
  productName: string;
  marketName: string;
  avgPct: number | null;
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

  const feed = useMemo(() => {
    const logs = getState().price_logs.filter(l => l.trustLevel === 'suspect');
    return logs
      .map(log => {
        const avg = avgPriceForProduct(log.productId, log.id);
        const avgPct =
          avg != null && avg > 0
            ? ((log.retailPrice - avg) / avg) * 100
            : null;
        return {
          log,
          productName:
            products.find(p => p.id === log.productId)?.name ?? 'Produto',
          marketName:
            markets.find(m => m.id === log.marketId)?.name ?? 'Mercado',
          avgPct,
        };
      })
      .sort(
        (a, b) =>
          new Date(b.log.capturedAt).getTime() -
          new Date(a.log.capturedAt).getTime(),
      )
      .slice(0, 40);
  }, [markets, products, refresh]);

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
          'Verifique seu e-mail no Perfil para validar preços da comunidade.',
        );
        return;
      }
      const remoteId = item.log.remoteId;
      if (!remoteId || !auth?.token) {
        appAlert(
          'Sincronize seus dados',
          'Abra o Perfil e sincronize para votar em preços da nuvem.',
          [
            {label: 'Agora não', style: 'cancel'},
            {
              label: 'Ir ao Perfil',
              style: 'primary',
              onPress: () => nav.navigate('Profile'),
            },
          ],
        );
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
      needAccount('Verifique o e-mail no Perfil para avaliar mercados.');
      return;
    }
    const rid = reviewMarket?.remoteId;
    if (!rid) {
      appAlert(
        'Mercado ainda local',
        'Sincronize no Perfil para enviar a avaliação deste mercado.',
        [
          {label: 'Ok', style: 'cancel'},
          {
            label: 'Ir ao Perfil',
            style: 'primary',
            onPress: () => nav.navigate('Profile'),
          },
        ],
      );
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
      ? `${Math.abs(Math.round(pct))}% abaixo da média`
      : `${Math.round(Math.abs(pct))}% acima`;
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
          <View style={styles.fiscalInline} accessibilityLabel={fiscal.hint}>
            <Text style={styles.fiscalInlineLevel}>
              {TrustEngine.fiscalLabel(fiscal.level)}
            </Text>
            <Text style={styles.fiscalInlinePts}>{points} pts</Text>
          </View>
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
            <Text style={styles.listHeading}>Preços para validar</Text>
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
            title="Fila de validação vazia"
            subtitle="Quando houver preços pendentes na sua região, eles aparecem aqui para você confirmar ou corrigir."
            stepsLabel="O que você faz nesta tela"
            steps={[
              {
                n: '1',
                title: 'Receba a fila',
                text: 'Preços suspeitos da região entram como missões de validação.',
                Icon: UsersRound,
              },
              {
                n: '2',
                title: 'Vote Confere ou Errado',
                text: 'Ajude a comunidade a limpar preços duvidosos.',
                Icon: ThumbsUp,
              },
              {
                n: '3',
                title: 'Suba de Fiscal',
                text: 'Cada voto rende pontos — Bronze, Prata e Ouro.',
                Icon: BadgeCheck,
              },
            ]}
            PrimaryIcon={RefreshCw}
            primaryLabel="Sincronizar comunidade"
            onPrimary={async () => {
              const r = await runFullSync();
              refresh();
              appAlert(r.ok ? 'Sync' : 'Falha', r.message);
            }}
            secondaryLabel="Ver mercados no mapa"
            onSecondary={() => nav.navigate('Map')}
          />
        }
        renderItem={({item}) => (
          <SoftCard style={styles.validateCard}>
            <View style={styles.cardHead}>
              <View style={{flex: 1, minWidth: 0}}>
                <Text style={styles.name} numberOfLines={2}>
                  {item.productName}
                </Text>
                <Text style={styles.meta} numberOfLines={1}>
                  {item.marketName}
                </Text>
              </View>
              {priceBadge(item.avgPct)}
            </View>

            <Text style={styles.price}>{formatBrl(item.log.retailPrice)}</Text>

            <VoteButtons
              busy={busyId === item.log.id}
              confirmPts={TrustEngine.pointsForVote('confirm', false)}
              rejectPts={TrustEngine.pointsForVote('reject', false)}
              onConfirm={() => vote(item, 'confirm')}
              onReject={() => vote(item, 'reject')}
            />

            {item.log.marketId != null ? (
              <Pressable
                style={styles.reviewBtn}
                onPress={() => setReviewMarketId(item.log.marketId)}>
                <Star size={16} color={colors.navy} fill={colors.navy} />
                <Text style={styles.reviewBtnText}>Avaliar · +5 pts</Text>
              </Pressable>
            ) : null}
          </SoftCard>
        )}
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
  fiscalInline: {
    alignItems: 'flex-end',
    backgroundColor: colors.yellow,
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 6,
    minWidth: 64,
  },
  fiscalInlineLevel: {
    fontWeight: '900',
    color: colors.navy,
    fontSize: 12,
    lineHeight: 14,
  },
  fiscalInlinePts: {
    fontWeight: '700',
    color: colors.navy,
    fontSize: 11,
    opacity: 0.8,
    marginTop: 1,
  },
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
  validateCard: {marginBottom: space.sm, gap: space.sm},
  cardHead: {flexDirection: 'row', alignItems: 'flex-start', gap: 8},
  name: {fontWeight: '900', color: colors.navy, fontSize: 16},
  meta: {color: colors.muted, fontWeight: '600', fontSize: 13, marginTop: 2},
  price: {fontWeight: '900', color: colors.navy, fontSize: 28},
  reviewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginTop: 4,
  },
  reviewBtnText: {fontWeight: '800', color: colors.navy, fontSize: 12},
});

import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {FlatList, Pressable, StyleSheet, Text, View} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {Star} from 'lucide-react-native';
import {AppScreenHeader} from '@/ui/chrome';
import {
  EmptyState,
  PriceTrustBadge,
  ScoreMeter,
  Screen,
  VoteButtons,
  XpBurst,
} from '@/ui/components';
import {appAlert} from '@/ui/appDialog';
import {MarketReviewSheet} from '@/ui/MarketReviewSheet';
import {colors, radii, space} from '@/ui/theme';
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
};

type Burst = {points: number; title: string} | null;

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
    const logs = getState().price_logs.filter(
      l => l.trustLevel === 'suspect' || l.trustLevel === 'verified',
    );
    return logs
      .map(log => ({
        log,
        productName:
          products.find(p => p.id === log.productId)?.name ?? 'Produto',
        marketName:
          markets.find(m => m.id === log.marketId)?.name ?? 'Mercado',
      }))
      .sort(
        (a, b) =>
          new Date(b.log.capturedAt).getTime() -
          new Date(a.log.capturedAt).getTime(),
      )
      .slice(0, 40);
  }, [markets, products, refresh]);

  const pending = feed.filter(f => f.log.trustLevel === 'suspect').length;
  const level =
    (rep?.level as FiscalLevel) ??
    TrustEngine.levelForPoints(rep?.points ?? 0);

  const celebrate = (points: number, title: string) => {
    setBurst({points, title});
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

  const missionCta = canContribute(auth)
    ? pending > 0
      ? 'Confirme ou rejeite para ganhar XP'
      : 'Capture preços para gerar missões'
    : 'Verifique o e-mail no Perfil';

  return (
    <Screen>
      <AppScreenHeader
        showLogo={false}
        stacked
        title="Comunidade"
        subtitle={region}
      />

      <View style={styles.missionStrip}>
        <View style={styles.stripLeft}>
          <Text style={styles.stripCount}>{pending}</Text>
          <Text style={styles.stripLabel}>pendentes</Text>
        </View>
        <View style={styles.levelPill}>
          <Text style={styles.levelPillText}>
            {TrustEngine.fiscalLabel(level)} · {rep?.points ?? 0} pts
          </Text>
        </View>
        <Text style={styles.stripCta} numberOfLines={1}>
          {missionCta}
        </Text>
      </View>

      <FlatList
        data={feed}
        keyExtractor={i => String(i.log.id)}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <Text style={styles.listHeading}>Preços para validar</Text>
        }
        ListEmptyComponent={
          <EmptyState
            title="Tudo certo por aqui"
            message="Quando surgir um preço suspeito na região, a missão aparece nesta lista."
          />
        }
        renderItem={({item}) => {
          const suspect = item.log.trustLevel === 'suspect';
          return (
            <View style={[styles.card, suspect && styles.cardQuest]}>
              <View style={styles.cardHead}>
                <View style={{flex: 1, minWidth: 0}}>
                  <Text style={styles.name} numberOfLines={2}>
                    {item.productName}
                  </Text>
                  <Text style={styles.meta} numberOfLines={1}>
                    {item.marketName}
                  </Text>
                </View>
                {suspect ? (
                  <View style={styles.questTag}>
                    <Text style={styles.questTagText}>Missão</Text>
                  </View>
                ) : (
                  <PriceTrustBadge level={item.log.trustLevel} />
                )}
              </View>

              <Text style={styles.price}>
                {formatBrl(item.log.retailPrice)}
              </Text>

              {suspect ? (
                <>
                  <ScoreMeter
                    confirm={item.log.confirmScore}
                    reject={item.log.rejectScore}
                  />
                  <VoteButtons
                    busy={busyId === item.log.id}
                    confirmPts={TrustEngine.pointsForVote('confirm', false)}
                    rejectPts={TrustEngine.pointsForVote('reject', false)}
                    onConfirm={() => vote(item, 'confirm')}
                    onReject={() => vote(item, 'reject')}
                  />
                </>
              ) : null}

              {item.log.marketId != null ? (
                <Pressable
                  style={styles.reviewBtn}
                  onPress={() => setReviewMarketId(item.log.marketId)}>
                  <Star size={16} color={colors.navy} fill={colors.navy} />
                  <Text style={styles.reviewBtnText}>Avaliar · +5 pts</Text>
                </Pressable>
              ) : null}
            </View>
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
  missionStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: space.md,
    marginBottom: space.sm,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: colors.navy,
    borderRadius: radii.md,
  },
  stripLeft: {alignItems: 'center', minWidth: 44},
  stripCount: {
    fontSize: 20,
    fontWeight: '900',
    color: colors.yellow,
    lineHeight: 22,
  },
  stripLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: colors.cyan,
    textTransform: 'uppercase',
  },
  levelPill: {
    backgroundColor: colors.yellow,
    borderRadius: radii.pill,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  levelPillText: {color: colors.navy, fontWeight: '800', fontSize: 10},
  stripCta: {
    flex: 1,
    color: colors.white,
    fontWeight: '700',
    fontSize: 11,
  },
  listHeading: {
    fontWeight: '800',
    fontSize: 15,
    color: colors.navy,
    marginBottom: space.sm,
  },
  list: {padding: space.md, paddingBottom: 120},
  card: {
    backgroundColor: colors.white,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.sm,
    marginBottom: space.sm,
    gap: 6,
  },
  cardQuest: {
    borderColor: colors.navy,
    backgroundColor: '#FFFEF5',
  },
  cardHead: {flexDirection: 'row', alignItems: 'flex-start', gap: 8},
  questTag: {
    backgroundColor: colors.yellow,
    borderRadius: radii.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  questTagText: {fontSize: 9, fontWeight: '900', color: colors.navy},
  name: {fontWeight: '800', color: colors.navy, fontSize: 14},
  meta: {color: colors.muted, fontWeight: '600', fontSize: 11},
  price: {fontWeight: '900', color: colors.ink, fontSize: 24},
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

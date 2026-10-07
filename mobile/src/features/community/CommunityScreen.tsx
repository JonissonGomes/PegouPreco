import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {Star} from 'lucide-react-native';
import {AppScreenHeader, AppScreenNavyBar} from '@/ui/chrome';
import {
  EmptyState,
  FiscalBadge,
  MissionHero,
  PriceTrustBadge,
  ScoreMeter,
  Screen,
  SectionHeader,
  VoteButtons,
  XpBurst,
} from '@/ui/components';
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
        Alert.alert(
          'Conta necessária',
          'Verifique seu e-mail no Perfil para validar preços da comunidade.',
        );
        return;
      }
      const remoteId = item.log.remoteId;
      if (!remoteId || !auth?.token) {
        Alert.alert(
          'Sync',
          'Sincronize seus dados (Perfil) para votar em preços da nuvem.',
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
        Alert.alert('Voto', apiErrorMessage(e));
      } finally {
        setBusyId(null);
      }
    },
    [auth, refresh, level],
  );

  const reviewMarket = markets.find(m => m.id === reviewMarketId);

  const submitReview = async (stars: number) => {
    if (!canContribute(auth) || !auth?.token) {
      Alert.alert('Conta necessária', 'Verifique o e-mail para avaliar mercados.');
      return;
    }
    const rid = reviewMarket?.remoteId;
    if (!rid) {
      Alert.alert('Mercado', 'Sincronize o mercado antes de avaliar.');
      return;
    }
    setReviewBusy(true);
    try {
      await syncApi.submitMarketReview(auth.token, rid, stars);
      setReviewMarketId(null);
      celebrate(5, `${stars}★ no ${reviewMarket?.name ?? 'mercado'}`);
    } catch (e) {
      Alert.alert('Avaliação', apiErrorMessage(e));
    } finally {
      setReviewBusy(false);
    }
  };

  const region =
    [loc.neighborhood, loc.city].filter(Boolean).join(', ') ||
    'Valide preços da região';

  return (
    <Screen>
      <AppScreenHeader
        stacked
        title="Missões da comunidade"
        subtitle={region}
      />
      <AppScreenNavyBar
        value={String(pending)}
        label="preços na fila"
        trailing={
          <View style={styles.pill}>
            <Text style={styles.pillText}>
              Fiscal {TrustEngine.fiscalLabel(level)} · {rep?.points ?? 0} pts
            </Text>
          </View>
        }
      />

      <MissionHero
        badge={<FiscalBadge level={level} points={rep?.points ?? 0} />}
        title={
          pending > 0
            ? `${pending} missões esperando você`
            : 'Fila limpa — bom trabalho!'
        }
        subtitle="Confirme ou rejeite preços suspeitos e ganhe pontos de Fiscal. Avalie mercados para subir de nível."
        footer={
          canContribute(auth)
            ? 'Conta verificada · votos valem XP'
            : 'Verifique o e-mail no Perfil para liberar missões'
        }
      />

      <SectionHeader title="Preços para validar" />
      <FlatList
        data={feed}
        keyExtractor={i => String(i.log.id)}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <EmptyState
            title="Nada na fila"
            message="Quando alguém capturar um preço suspeito na sua região, a missão aparece aqui."
          />
        }
        renderItem={({item}) => {
          const suspect = item.log.trustLevel === 'suspect';
          return (
            <View style={[styles.card, suspect && styles.cardQuest]}>
              <View style={styles.cardTop}>
                <View style={{flex: 1, minWidth: 0}}>
                  {suspect ? (
                    <View style={styles.questTag}>
                      <Text style={styles.questTagText}>Missão</Text>
                    </View>
                  ) : null}
                  <Text style={styles.name} numberOfLines={2}>
                    {item.productName}
                  </Text>
                  <Text style={styles.meta} numberOfLines={1}>
                    {item.marketName}
                  </Text>
                </View>
                <PriceTrustBadge level={item.log.trustLevel} />
              </View>

              <Text style={styles.price}>
                {formatBrl(item.log.retailPrice)}
              </Text>
              <ScoreMeter
                confirm={item.log.confirmScore}
                reject={item.log.rejectScore}
              />
              <Text style={styles.source}>
                fonte {item.log.source} · peso comunitário
              </Text>

              {suspect ? (
                <VoteButtons
                  busy={busyId === item.log.id}
                  confirmPts={TrustEngine.pointsForVote('confirm', false)}
                  rejectPts={TrustEngine.pointsForVote('reject', false)}
                  onConfirm={() => vote(item, 'confirm')}
                  onReject={() => vote(item, 'reject')}
                />
              ) : null}

              {item.log.marketId != null ? (
                <Pressable
                  onPress={() => setReviewMarketId(item.log.marketId)}
                  style={styles.reviewBtn}>
                  <Star
                    size={14}
                    color={colors.navy}
                    fill={colors.yellowBright}
                  />
                  <Text style={styles.reviewBtnText}>
                    Avaliar {item.marketName}
                  </Text>
                  <View style={styles.miniPts}>
                    <Text style={styles.miniPtsText}>+5</Text>
                  </View>
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
  pill: {
    backgroundColor: colors.yellowBright,
    borderRadius: radii.pill,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  pillText: {color: colors.navy, fontWeight: '800', fontSize: 11},
  list: {padding: space.md, paddingBottom: 120},
  card: {
    backgroundColor: '#fff',
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.md,
    marginBottom: space.sm,
    gap: 4,
  },
  cardQuest: {
    borderColor: colors.navy,
    borderWidth: 1.5,
    backgroundColor: '#FFFEF5',
  },
  cardTop: {flexDirection: 'row', alignItems: 'flex-start', gap: 8},
  questTag: {
    alignSelf: 'flex-start',
    backgroundColor: colors.yellowBright,
    borderRadius: radii.pill,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginBottom: 4,
  },
  questTagText: {fontSize: 10, fontWeight: '900', color: colors.navy},
  name: {fontWeight: '800', color: colors.navy, fontSize: 15},
  meta: {color: colors.muted, fontWeight: '600', fontSize: 12, marginTop: 2},
  price: {fontWeight: '900', color: colors.ink, fontSize: 22, marginTop: 6},
  source: {color: colors.muted, fontWeight: '600', fontSize: 11, marginTop: 2},
  reviewBtn: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    backgroundColor: '#EEF2FF',
    borderRadius: radii.pill,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  reviewBtnText: {color: colors.navy, fontWeight: '800', fontSize: 12},
  miniPts: {
    backgroundColor: colors.yellowBright,
    borderRadius: radii.pill,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  miniPtsText: {fontSize: 10, fontWeight: '900', color: colors.navy},
});

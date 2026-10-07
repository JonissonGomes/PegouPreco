import React, {useCallback, useMemo, useState} from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {AppButton, AppScreenHeader} from '@/ui/chrome';
import {
  EmptyState,
  PriceTrustBadge,
  Screen,
  SectionHeader,
  StarsRow,
} from '@/ui/components';
import {colors, space} from '@/ui/theme';
import {formatBrl} from '@/domain/money';
import {TrustEngine} from '@/domain/trust';
import {canContribute, prefs, useAppStore} from '@/store/appStore';
import {getState} from '@/data/db';
import type {PriceLog, TrustLevel} from '@/data/types';
import {syncApi} from '@/data/remote/syncApi';
import {apiErrorMessage} from '@/data/remote/apiError';

type FeedItem = {
  log: PriceLog;
  productName: string;
  marketName: string;
};

export function CommunityScreen() {
  const auth = useAppStore(s => s.auth);
  const markets = useAppStore(s => s.markets);
  const products = useAppStore(s => s.products);
  const refresh = useAppStore(s => s.refresh);
  const loc = prefs.getLocationPrefs();
  const [busyId, setBusyId] = useState<number | null>(null);
  const [reviewMarketId, setReviewMarketId] = useState<number | null>(null);

  const feed = useMemo(() => {
    const logs = getState().price_logs.filter(
      l => l.trustLevel === 'suspect' || l.trustLevel === 'verified',
    );
    const items: FeedItem[] = logs
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
    return items;
  }, [markets, products, refresh]);

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
      try {
        const weight = TrustEngine.weightFor('bronze');
        await syncApi.castVote(auth.token, {
          priceLogId: remoteId,
          vote: voteType,
          withPhoto: false,
          weight,
        });
        // Atualização otimista local
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
        Alert.alert('Obrigado', 'Seu voto foi registrado.');
      } catch (e) {
        Alert.alert('Voto', apiErrorMessage(e));
      } finally {
        setBusyId(null);
      }
    },
    [auth, refresh],
  );

  const submitReview = async (marketId: number, stars: number) => {
    if (!canContribute(auth) || !auth?.token) {
      Alert.alert('Conta necessária', 'Verifique o e-mail para avaliar mercados.');
      return;
    }
    const m = markets.find(x => x.id === marketId);
    const rid = m?.remoteId;
    if (!rid) {
      Alert.alert('Mercado', 'Sincronize o mercado antes de avaliar.');
      return;
    }
    try {
      await syncApi.submitMarketReview(auth.token, rid, stars);
      Alert.alert('Avaliação', 'Obrigado pela nota!');
      setReviewMarketId(null);
    } catch (e) {
      Alert.alert('Avaliação', apiErrorMessage(e));
    }
  };

  return (
    <Screen>
      <AppScreenHeader
        title="Comunidade"
        subtitle={
          [loc.neighborhood, loc.city].filter(Boolean).join(', ') ||
          'Valide preços da região'
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
            message="Quando alguém capturar um preço suspeito na sua região, ele aparece aqui."
          />
        }
        renderItem={({item}) => (
          <View style={styles.card}>
            <View style={styles.cardTop}>
              <View style={{flex: 1}}>
                <Text style={styles.name}>{item.productName}</Text>
                <Text style={styles.meta}>{item.marketName}</Text>
              </View>
              <PriceTrustBadge level={item.log.trustLevel} />
            </View>
            <Text style={styles.price}>{formatBrl(item.log.retailPrice)}</Text>
            <Text style={styles.meta}>
              fonte {item.log.source} · conf {item.log.confirmScore.toFixed(0)} / rej{' '}
              {item.log.rejectScore.toFixed(0)}
            </Text>
            {item.log.trustLevel === 'suspect' ? (
              <View style={styles.actions}>
                <AppButton
                  label={busyId === item.log.id ? '…' : 'Confirmar'}
                  onPress={() => vote(item, 'confirm')}
                  disabled={busyId === item.log.id}
                />
                <AppButton
                  label="Rejeitar"
                  outlined
                  onPress={() => vote(item, 'reject')}
                  disabled={busyId === item.log.id}
                />
              </View>
            ) : null}
            {item.log.marketId != null ? (
              <Pressable
                onPress={() => setReviewMarketId(item.log.marketId)}
                style={styles.reviewLink}>
                <Text style={styles.reviewLinkText}>Avaliar mercado</Text>
              </Pressable>
            ) : null}
            {reviewMarketId === item.log.marketId ? (
              <View style={styles.reviewBox}>
                <Text style={styles.meta}>Toque na nota</Text>
                <View style={styles.starRow}>
                  {[1, 2, 3, 4, 5].map(s => (
                    <Pressable key={s} onPress={() => submitReview(item.log.marketId!, s)}>
                      <StarsRow stars={s} />
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : null}
          </View>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: {padding: space.md, paddingBottom: 120},
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.md,
    marginBottom: space.sm,
    gap: 6,
  },
  cardTop: {flexDirection: 'row', alignItems: 'flex-start', gap: 8},
  name: {fontWeight: '800', color: colors.navy, fontSize: 15},
  meta: {color: colors.muted, fontWeight: '600', fontSize: 12},
  price: {fontWeight: '800', color: colors.ink, fontSize: 20, marginTop: 4},
  actions: {marginTop: 8, gap: 8},
  reviewLink: {marginTop: 6},
  reviewLinkText: {color: colors.navy, fontWeight: '800', fontSize: 12},
  reviewBox: {marginTop: 8, gap: 6},
  starRow: {gap: 6},
});

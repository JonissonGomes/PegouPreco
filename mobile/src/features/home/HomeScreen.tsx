import React, {useEffect, useMemo, useState} from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {Map as MapIcon} from 'lucide-react-native';
import {AppButton, AppScreenHeader} from '@/ui/chrome';
import {
  EmptyState,
  FiscalBadge,
  MarketRankRow,
  Screen,
  SectionHeader,
} from '@/ui/components';
import {colors, space} from '@/ui/theme';
import {
  cartToBasket,
  rankMarketsForBasket,
  type MarketBasketRank,
} from '@/domain/compare';
import {formatBrl} from '@/domain/money';
import {TrustEngine} from '@/domain/trust';
import {prefs, useAppStore, useMarketName} from '@/store/appStore';
import {syncApi, type ReputationRemote} from '@/data/remote/syncApi';
import {getState} from '@/data/db';
import type {FiscalLevel} from '@/data/types';

export function HomeScreen() {
  const nav = useNavigation<any>();
  const cart = useAppStore(s => s.cart);
  const markets = useAppStore(s => s.markets);
  const activeListName = useAppStore(s => s.activeListName);
  const activeMarketId = useAppStore(s => s.activeMarketId);
  const auth = useAppStore(s => s.auth);
  const marketName = useMarketName(activeMarketId);
  const loc = prefs.getLocationPrefs();
  const [refreshing, setRefreshing] = useState(false);
  const [remoteRanks, setRemoteRanks] = useState<MarketBasketRank[] | null>(
    null,
  );
  const [rep, setRep] = useState<ReputationRemote | null>(null);

  const localRanks = useMemo(() => {
    const basket = cartToBasket(cart);
    if (!basket.length) return [];
    const logs = getState().price_logs;
    return rankMarketsForBasket(basket, markets, logs, {
      favoriteIds: loc.favoriteMarketIds,
      minCoverage: 0.2,
    });
  }, [cart, markets, loc.favoriteMarketIds]);

  const ranks = remoteRanks ?? localRanks;
  const best = ranks[0];
  const worst = ranks.length > 1 ? ranks[ranks.length - 1] : null;
  const saveEst =
    best && worst && worst.total > best.total ? worst.total - best.total : 0;

  const regionLabel = [loc.neighborhood, loc.city].filter(Boolean).join(', ');

  const loadRemote = async () => {
    if (!auth?.token || !cart.length) {
      setRemoteRanks(null);
      return;
    }
    try {
      const data = await syncApi.compareBasket(auth.token, {
        city: loc.city,
        neighborhood: loc.neighborhood,
        favoriteMarketIds: loc.favoriteMarketIds
          .map(id => markets.find(m => m.id === id)?.remoteId)
          .filter(Boolean) as string[],
        items: cart.map(c => ({
          productName: c.productName,
          quantity: c.quantity,
        })),
      });
      const mapped: MarketBasketRank[] = (data.markets ?? []).map(
        (m: Record<string, unknown>) => {
          const local = markets.find(
            x =>
              x.remoteId === m.marketId ||
              x.name.toLowerCase() === String(m.marketName ?? '').toLowerCase(),
          );
          return {
            marketId: local?.id ?? -1,
            marketName: String(m.marketName ?? local?.name ?? 'Mercado'),
            total: Number(m.total ?? 0),
            coveredItems: Number(m.coveredItems ?? 0),
            totalItems: Number(m.totalItems ?? cart.length),
            coverage: Number(m.coverage ?? 0),
            missingNames: (m.missingNames as string[]) ?? [],
          };
        },
      );
      if (mapped.length) setRemoteRanks(mapped);
    } catch {
      setRemoteRanks(null);
    }
  };

  useEffect(() => {
    if (!auth?.token) return;
    syncApi
      .reputation(auth.token)
      .then(setRep)
      .catch(() => setRep(null));
    void loadRemote();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth?.token, cart.length]);

  return (
    <Screen>
      <AppScreenHeader
        stacked
        title="Onde comprar"
        subtitle={regionLabel || marketName || 'Defina sua região no perfil'}
        actions={
          <Pressable
            onPress={() => nav.navigate('Map')}
            style={styles.iconBtn}
            accessibilityLabel="Abrir mapa">
            <MapIcon color={colors.navy} size={22} />
          </Pressable>
        }
      />
      <ScrollView
        contentContainerStyle={styles.body}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await loadRemote();
              setRefreshing(false);
            }}
            tintColor={colors.navy}
          />
        }>
        <View style={styles.heroCard}>
          <FiscalBadge
            level={
              (rep?.level as FiscalLevel) ??
              TrustEngine.levelForPoints(rep?.points ?? 0)
            }
            points={rep?.points ?? 0}
          />
          <Text style={styles.heroTitle}>
            {activeListName
              ? `Lista: ${activeListName}`
              : 'Nenhuma lista ativa'}
          </Text>
          <Text style={styles.heroSub}>
            Comparação comunitária com preços verificados na sua região
          </Text>
          {best && cart.length ? (
            <Text style={styles.heroSave}>
              {saveEst > 0
                ? `Economia estimada até ${formatBrl(saveEst)} vs opção mais cara`
                : `${best.marketName} está entre as melhores opções`}
            </Text>
          ) : null}
        </View>

        <SectionHeader
          title="Ranking da lista"
          actionLabel="Listas"
          onAction={() => nav.navigate('Lists')}
        />

        {!cart.length ? (
          <EmptyState
            title="Monte sua lista"
            message="Adicione itens na aba Listas ou capture etiquetas para comparar mercados da comunidade."
            actionLabel="Ir para Listas"
            onAction={() => nav.navigate('Lists')}
          />
        ) : ranks.length === 0 ? (
          <EmptyState
            title="Poucos dados na região"
            message="Ainda não há preços verificados o bastante. Capture etiquetas ou valide preços na Comunidade."
            actionLabel="Capturar"
            onAction={() => nav.navigate('Capture')}
          />
        ) : (
          <View style={styles.listPad}>
            {ranks.slice(0, 8).map((r, i) => (
              <MarketRankRow
                key={`${r.marketId}-${r.marketName}`}
                rank={r}
                place={i + 1}
                highlight={i === 0}
              />
            ))}
          </View>
        )}

        {!loc.city ? (
          <View style={styles.ctaBox}>
            <Text style={styles.ctaTitle}>Defina cidade e bairro</Text>
            <Text style={styles.ctaMsg}>
              O ranking usa sua região e mercados favoritos.
            </Text>
            <AppButton
              label="Configurar região"
              onPress={() => nav.navigate('Profile')}
            />
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: {paddingBottom: 120},
  iconBtn: {padding: 8},
  heroCard: {
    margin: space.md,
    padding: space.md,
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 8,
  },
  heroTitle: {fontSize: 18, fontWeight: '800', color: colors.navy},
  heroSub: {color: colors.muted, fontWeight: '600', fontSize: 13},
  heroSave: {fontWeight: '800', color: colors.trustGreen, fontSize: 13},
  listPad: {paddingHorizontal: space.md},
  ctaBox: {
    margin: space.md,
    padding: space.md,
    backgroundColor: colors.yellowBright,
    borderRadius: 16,
    gap: 8,
  },
  ctaTitle: {fontWeight: '800', color: colors.navy, fontSize: 16},
  ctaMsg: {color: colors.navy, fontWeight: '600', fontSize: 13},
});

import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {useFocusEffect, useNavigation} from '@react-navigation/native';
import Geolocation from 'react-native-geolocation-service';
import {Map as MapIcon, Sparkles} from 'lucide-react-native';
import {AppButton, AppScreenHeader} from '@/ui/chrome';
import {
  EmptyState,
  FiscalBadge,
  MarketRankRow,
  Screen,
  SectionHeader,
} from '@/ui/components';
import {colors, radii, space} from '@/ui/theme';
import {
  cartToBasket,
  rankMarketsForBasket,
  type MarketBasketRank,
} from '@/domain/compare';
import {
  categorySpendFromCart,
  categorySavingsPotential,
  lifetimeSavings,
} from '@/domain/homeInsights';
import {formatBrl} from '@/domain/money';
import {TrustEngine} from '@/domain/trust';
import {prefs, useAppStore, useMarketName} from '@/store/appStore';
import {syncApi, type ReputationRemote} from '@/data/remote/syncApi';
import {reverseGeocode} from '@/data/remote/reverseGeocode';
import {getState} from '@/data/db';
import type {FiscalLevel} from '@/data/types';
import {MAPBOX_ACCESS_TOKEN} from '@/config/env';
import {HomeMarketBars} from './HomeMarketBars';

export function HomeScreen() {
  const nav = useNavigation<any>();
  const cart = useAppStore(s => s.cart);
  const markets = useAppStore(s => s.markets);
  const lists = useAppStore(s => s.lists);
  const products = useAppStore(s => s.products);
  const refresh = useAppStore(s => s.refresh);
  const activeListName = useAppStore(s => s.activeListName);
  const activeMarketId = useAppStore(s => s.activeMarketId);
  const auth = useAppStore(s => s.auth);
  const permissions = useAppStore(s => s.permissions);
  const marketName = useMarketName(activeMarketId);
  const [locSnapshot, setLocSnapshot] = useState(() => prefs.getLocationPrefs());
  const [geoAttempted, setGeoAttempted] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const geoOnce = useRef(false);
  const [refreshing, setRefreshing] = useState(false);
  const [remoteRanks, setRemoteRanks] = useState<MarketBasketRank[] | null>(
    null,
  );
  const [rep, setRep] = useState<ReputationRemote | null>(null);

  const loc = locSnapshot;
  const logsKey = lists.length + cart.length + markets.length;

  const localRanks = useMemo(() => {
    const basket = cartToBasket(cart);
    if (!basket.length) return [];
    const logs = getState().price_logs;
    return rankMarketsForBasket(basket, markets, logs, {
      favoriteIds: loc.favoriteMarketIds,
      minCoverage: 0.2,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart, markets, loc.favoriteMarketIds, logsKey]);

  const ranks = remoteRanks ?? localRanks;
  const best = ranks[0];
  const worst = ranks.length > 1 ? ranks[ranks.length - 1] : null;
  const saveEst =
    best && worst && worst.total > best.total ? worst.total - best.total : 0;
  const histSave = useMemo(() => lifetimeSavings(lists), [lists]);
  const byCategory = useMemo(
    () => categorySpendFromCart(cart, products),
    [cart, products],
  );
  const saveByCat = useMemo(() => {
    const logs = getState().price_logs;
    return categorySavingsPotential(cart, products, logs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart, products, logsKey]);

  const regionLabel = [loc.neighborhood, loc.city].filter(Boolean).join(', ');
  const headerTitle = auth?.displayName
    ? `Olá, ${auth.displayName.split(/\s+/)[0]}`
    : 'Onde comprar';
  const headerSubtitle = detecting
    ? 'Detectando região…'
    : regionLabel || marketName || 'Defina sua região no perfil';

  const tryAutoRegion = useCallback(async () => {
    const current = prefs.getLocationPrefs();
    if (current.city?.trim()) {
      setLocSnapshot(current);
      setGeoAttempted(true);
      return;
    }
    if (!permissions.location) {
      setGeoAttempted(true);
      return;
    }
    setDetecting(true);
    try {
      await new Promise<void>((resolve, reject) => {
        Geolocation.getCurrentPosition(
          async pos => {
            try {
              const hit = await reverseGeocode(
                pos.coords.latitude,
                pos.coords.longitude,
                MAPBOX_ACCESS_TOKEN,
              );
              if (hit?.city) {
                prefs.setLocationPrefs({
                  city: hit.city,
                  neighborhood: hit.neighborhood,
                  favoriteMarketIds: current.favoriteMarketIds,
                });
                setLocSnapshot(prefs.getLocationPrefs());
              }
              resolve();
            } catch (e) {
              reject(e);
            }
          },
          () => resolve(),
          {enableHighAccuracy: false, timeout: 12000, maximumAge: 60000},
        );
      });
    } finally {
      setDetecting(false);
      setGeoAttempted(true);
    }
  }, [permissions.location]);

  useFocusEffect(
    useCallback(() => {
      refresh();
      setLocSnapshot(prefs.getLocationPrefs());
      if (!geoOnce.current) {
        geoOnce.current = true;
        void tryAutoRegion();
      } else if (!prefs.getLocationPrefs().city?.trim()) {
        void tryAutoRegion();
      }
    }, [tryAutoRegion, refresh]),
  );

  const loadRemote = async () => {
    const freshLoc = prefs.getLocationPrefs();
    setLocSnapshot(freshLoc);
    if (!auth?.token || !cart.length) {
      setRemoteRanks(null);
      return;
    }
    try {
      const data = await syncApi.compareBasket(auth.token, {
        city: freshLoc.city,
        neighborhood: freshLoc.neighborhood,
        favoriteMarketIds: freshLoc.favoriteMarketIds
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
  }, [auth?.token, cart.length, loc.city, loc.neighborhood]);

  const fiscalLevel =
    (rep?.level as FiscalLevel) ??
    TrustEngine.levelForPoints(rep?.points ?? 0);

  const hasDashboard = cart.length > 0 && ranks.length > 0;

  return (
    <Screen>
      <AppScreenHeader
        showLogo={false}
        stacked
        title={headerTitle}
        subtitle={headerSubtitle}
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
              refresh();
              await loadRemote();
              setRefreshing(false);
            }}
            tintColor={colors.navy}
          />
        }>
        <View style={styles.heroBand}>
          <View style={styles.heroTop}>
            <FiscalBadge level={fiscalLevel} points={rep?.points ?? 0} />
          </View>
          <Text style={styles.heroList}>
            {activeListName
              ? `Lista ativa: ${activeListName}`
              : 'Nenhuma lista ativa'}
          </Text>
          {hasDashboard ? (
            <Text style={styles.heroBig}>
              {saveEst > 0
                ? formatBrl(saveEst)
                : formatBrl(best?.total ?? 0)}
            </Text>
          ) : null}
          <Text style={styles.heroCaption}>
            {hasDashboard
              ? saveEst > 0
                ? 'Economia estimada vs. mercado mais caro'
                : `${best?.marketName} lidera entre os favoritos`
              : 'Compare mercados com preços verificados na região'}
          </Text>
        </View>

        {hasDashboard ? (
          <>
            <View style={styles.statRow}>
              <View style={styles.statTile}>
                <Text style={styles.statVal}>{formatBrl(histSave)}</Text>
                <Text style={styles.statLbl}>Economia histórica</Text>
              </View>
              <View style={[styles.statTile, styles.statTileHi]}>
                <Text style={styles.statVal}>{formatBrl(saveEst)}</Text>
                <Text style={styles.statLbl}>Nesta lista</Text>
              </View>
              <View style={styles.statTile}>
                <Text style={styles.statVal}>{cart.length}</Text>
                <Text style={styles.statLbl}>Itens na lista</Text>
              </View>
            </View>

            <SectionHeader title="Comparativo visual" />
            <HomeMarketBars ranks={ranks} />

            {byCategory.length ? (
              <>
                <SectionHeader title="Por categoria" />
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.chipRow}>
                  {byCategory.map(c => {
                    const pot = saveByCat.find(s => s.category === c.category);
                    return (
                      <View key={c.category} style={styles.chip}>
                        <Text style={styles.chipCat}>{c.category}</Text>
                        <Text style={styles.chipVal}>
                          {formatBrl(c.total)}
                        </Text>
                        <Text style={styles.chipMeta}>
                          {c.itemCount} {c.itemCount === 1 ? 'item' : 'itens'}
                          {pot && pot.saveEst > 0
                            ? ` · −${formatBrl(pot.saveEst)}`
                            : ''}
                        </Text>
                      </View>
                    );
                  })}
                </ScrollView>
              </>
            ) : null}

            <SectionHeader
              title="Ranking da lista"
              actionLabel="Listas"
              onAction={() => nav.navigate('Lists')}
            />
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

            <View style={styles.ctaRow}>
              <Pressable
                style={styles.ctaCard}
                onPress={() => nav.navigate('Insights')}>
                <Sparkles color={colors.navy} size={20} />
                <Text style={styles.ctaCardTitle}>Ver insights</Text>
                <Text style={styles.ctaCardSub}>
                  Alertas e menores preços por item
                </Text>
              </Pressable>
              <Pressable
                style={styles.ctaCard}
                onPress={() => nav.navigate('Map')}>
                <MapIcon color={colors.navy} size={20} />
                <Text style={styles.ctaCardTitle}>Mapa</Text>
                <Text style={styles.ctaCardSub}>Mercados perto de você</Text>
              </Pressable>
            </View>
          </>
        ) : !cart.length ? (
          <EmptyState
            title="Monte sua lista"
            message="Adicione itens na aba Listas ou capture etiquetas para comparar mercados da comunidade."
            actionLabel="Ir para Listas"
            onAction={() => nav.navigate('Lists')}
          />
        ) : (
          <EmptyState
            title="Poucos dados na região"
            message="Ainda não há preços verificados o bastante. Capture etiquetas ou valide preços na Comunidade."
            actionLabel="Capturar"
            onAction={() => nav.navigate('Capture')}
          />
        )}

        {geoAttempted && !loc.city?.trim() ? (
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
  heroBand: {
    backgroundColor: colors.yellow,
    paddingHorizontal: space.md,
    paddingVertical: space.lg,
    gap: 6,
    borderBottomWidth: 3,
    borderBottomColor: colors.navy,
  },
  heroTop: {alignSelf: 'flex-start'},
  heroList: {fontSize: 15, fontWeight: '800', color: colors.navy},
  heroBig: {fontSize: 36, fontWeight: '900', color: colors.navy},
  heroCaption: {
    color: colors.navy,
    fontWeight: '600',
    fontSize: 13,
    opacity: 0.9,
  },
  statRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
  },
  statTile: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 10,
    gap: 4,
  },
  statTileHi: {
    backgroundColor: colors.yellowBright,
    borderColor: colors.navy,
  },
  statVal: {fontSize: 14, fontWeight: '900', color: colors.navy},
  statLbl: {fontSize: 10, fontWeight: '700', color: colors.muted},
  chipRow: {
    paddingHorizontal: space.md,
    gap: 8,
    paddingBottom: space.sm,
  },
  chip: {
    backgroundColor: colors.white,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minWidth: 120,
    gap: 2,
  },
  chipCat: {fontWeight: '800', color: colors.navy, fontSize: 12},
  chipVal: {fontWeight: '900', color: colors.navy, fontSize: 15},
  chipMeta: {fontSize: 10, fontWeight: '600', color: colors.muted},
  listPad: {paddingHorizontal: space.md, paddingTop: space.xs},
  ctaRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: space.md,
    marginTop: space.sm,
    marginBottom: space.md,
  },
  ctaCard: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    gap: 4,
  },
  ctaCardTitle: {fontWeight: '800', color: colors.navy, fontSize: 14},
  ctaCardSub: {fontWeight: '600', color: colors.muted, fontSize: 11},
  ctaBox: {
    margin: space.md,
    padding: space.md,
    backgroundColor: colors.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 8,
  },
  ctaTitle: {fontWeight: '800', color: colors.navy, fontSize: 16},
  ctaMsg: {color: colors.muted, fontWeight: '600', fontSize: 13},
});

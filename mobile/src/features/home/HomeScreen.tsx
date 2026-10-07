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
import {AppButton} from '@/ui/chrome';
import {
  EmptyState,
  MarketRankRow,
  Screen,
  SectionHeader,
} from '@/ui/components';
import {MiniMapPreview} from '@/ui/MiniMapPreview';
import {SavePill, ScreenScrollPad, SoftHeader} from '@/ui/screenChrome';
import {colors, radii, space} from '@/ui/theme';
import {
  cartToBasket,
  rankMarketsForBasket,
  type MarketBasketRank,
} from '@/domain/compare';
import {formatBrl} from '@/domain/money';
import {prefs, useAppStore} from '@/store/appStore';
import {syncApi} from '@/data/remote/syncApi';
import {reverseGeocode} from '@/data/remote/reverseGeocode';
import {getState} from '@/data/db';
import {MAPBOX_ACCESS_TOKEN} from '@/config/env';
import {
  filterMarketsInRadius,
  NEARBY_RADIUS_KM,
} from '@/data/remote/nearbyMarkets';
import {ensureNearbyMarketsDiscovered} from '@/data/remote/ensureNearbyMarkets';
import {HomeWelcome} from '@/features/home/HomeWelcome';
import {lifetimeSavings} from '@/domain/homeInsights';

const RECIFE = {lat: -8.0476, lng: -34.8813};

export function HomeScreen() {
  const nav = useNavigation<any>();
  const cart = useAppStore(s => s.cart);
  const markets = useAppStore(s => s.markets);
  const lists = useAppStore(s => s.lists);
  const refresh = useAppStore(s => s.refresh);
  const activeListName = useAppStore(s => s.activeListName);
  const auth = useAppStore(s => s.auth);
  const permissions = useAppStore(s => s.permissions);
  const [locSnapshot, setLocSnapshot] = useState(() => prefs.getLocationPrefs());
  const [geoAttempted, setGeoAttempted] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const geoOnce = useRef(false);
  const [refreshing, setRefreshing] = useState(false);
  const [remoteRanks, setRemoteRanks] = useState<MarketBasketRank[] | null>(
    null,
  );
  const [mapOrigin, setMapOrigin] = useState(() => {
    const last = prefs.getLastLocation();
    return last ?? RECIFE;
  });

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

  const regionLabel = [loc.neighborhood, loc.city].filter(Boolean).join(', ');
  const openListLabel = activeListName
    ? `Abrir ${activeListName}`
    : 'Abrir listas';

  const nearbyMarkets = useMemo(
    () => filterMarketsInRadius(markets, mapOrigin, NEARBY_RADIUS_KM, 20),
    [markets, mapOrigin],
  );
  const mapMarkers = useMemo(
    () =>
      nearbyMarkets
        .filter(m => m.lat != null && m.lng != null)
        .map(m => ({
          id: String(m.id),
          name: m.name,
          lat: m.lat!,
          lng: m.lng!,
        })),
    [nearbyMarkets],
  );

  const hasGeoMarkets = mapMarkers.length > 0;
  const hasHistory = lists.length > 0;
  const hasDashboard = cart.length > 0 && ranks.length > 0;
  /** Usuário com dados locais — mapa reduzido em vez do empty "Monte sua lista". */
  const isReturning = hasGeoMarkets || hasHistory || hasDashboard;
  const savedTotal = useMemo(() => lifetimeSavings(lists), [lists]);

  const discoverNearHome = useCallback(async (origin: {
    lat: number;
    lng: number;
  }) => {
    try {
      const {marketIds} = await ensureNearbyMarketsDiscovered(
        origin.lat,
        origin.lng,
        {mapboxToken: MAPBOX_ACCESS_TOKEN},
      );
      // Só refresh se algo novo entrou — evita piscar o WebView do mini-mapa
      if (marketIds.length > 0) refresh();
    } catch {
      // offline / Overpass ok
    }
  }, [refresh]);

  const tryAutoRegion = useCallback(async () => {
    const current = prefs.getLocationPrefs();
    if (current.city?.trim()) {
      setLocSnapshot(current);
      setGeoAttempted(true);
    }
    if (!permissions.location) {
      setGeoAttempted(true);
      const last = prefs.getLastLocation() ?? RECIFE;
      setMapOrigin(prev =>
        prev.lat === last.lat && prev.lng === last.lng ? prev : last,
      );
      void discoverNearHome(last);
      return;
    }
    setDetecting(true);
    try {
      await new Promise<void>(resolve => {
        Geolocation.getCurrentPosition(
          async pos => {
            const next = {
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
            };
            prefs.setLastLocation(next.lat, next.lng);
            setMapOrigin(prev =>
              Math.abs(prev.lat - next.lat) < 1e-5 &&
              Math.abs(prev.lng - next.lng) < 1e-5
                ? prev
                : next,
            );
            try {
              if (!current.city?.trim()) {
                const hit = await reverseGeocode(
                  next.lat,
                  next.lng,
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
              }
            } catch {
              // reverse geocode opcional
            }
            await discoverNearHome(next);
            resolve();
          },
          () => {
            const last = prefs.getLastLocation() ?? RECIFE;
            setMapOrigin(prev =>
              prev.lat === last.lat && prev.lng === last.lng ? prev : last,
            );
            void discoverNearHome(last);
            resolve();
          },
          {enableHighAccuracy: false, timeout: 12000, maximumAge: 60000},
        );
      });
    } finally {
      setDetecting(false);
      setGeoAttempted(true);
    }
  }, [permissions.location, discoverNearHome]);

  useFocusEffect(
    useCallback(() => {
      refresh();
      setLocSnapshot(prefs.getLocationPrefs());
      // Discovery uma vez por sessão — evita loop refresh → re-render → piscar
      if (!geoOnce.current) {
        geoOnce.current = true;
        void tryAutoRegion();
      }
      // tryAutoRegion propositalmente fora das deps do foco contínuo
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [refresh]),
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
    void loadRemote();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth?.token, cart.length, loc.city, loc.neighborhood]);

  const bestTotal = best?.total ?? 0;
  const goMap = useCallback(() => nav.navigate('Map'), [nav]);
  const goLists = useCallback(() => nav.navigate('Lists'), [nav]);

  const headerTitle = hasDashboard
    ? 'Onde comprar hoje'
    : isReturning
      ? 'Mercados perto de você'
      : 'PegouPreço';

  return (
    <Screen>
      <SoftHeader
        location={
          detecting
            ? 'Detectando região…'
            : regionLabel || 'Defina sua região no perfil'
        }
        title={headerTitle}
      />
      <ScrollView
        contentContainerStyle={styles.body}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              refresh();
              await discoverNearHome(mapOrigin);
              await loadRemote();
              setRefreshing(false);
            }}
            tintColor={colors.navy}
          />
        }>
        <ScreenScrollPad>
          {hasDashboard && best ? (
            <>
              <Pressable style={styles.heroCard} onPress={goLists}>
                <Text style={styles.heroKicker}>
                  MELHOR OPÇÃO PARA SUA LISTA
                </Text>
                <Text style={styles.heroMarket} numberOfLines={2}>
                  {best.marketName}
                </Text>
                <View style={styles.heroMetaRow}>
                  <Text style={styles.heroMeta}>
                    {formatBrl(best.total)} · {best.coveredItems} de{' '}
                    {best.totalItems} itens
                  </Text>
                  {saveEst > 0 ? (
                    <SavePill label={`Economize ${formatBrl(saveEst)}`} />
                  ) : null}
                </View>
                <Text style={styles.heroCta}>{openListLabel}</Text>
              </Pressable>

              <SectionHeader
                title="Perto de você"
                actionLabel="Mapa completo"
                onAction={goMap}
              />
              <MiniMapPreview
                center={mapOrigin}
                markers={mapMarkers}
                onPress={goMap}
                caption={
                  mapMarkers.length
                    ? `${mapMarkers.length} mercados · ${NEARBY_RADIUS_KM} km`
                    : 'Abrir mapa'
                }
              />

              <SectionHeader
                title="Ranking"
                actionLabel="Ver listas"
                onAction={goLists}
              />
              <View style={styles.listPad}>
                {ranks.slice(0, 8).map((r, i) => (
                  <MarketRankRow
                    key={`${r.marketId}-${r.marketName}`}
                    rank={r}
                    place={i + 1}
                    highlight={i === 0}
                    bestTotal={bestTotal}
                  />
                ))}
              </View>

              <View style={styles.ctaRow}>
                <Pressable
                  style={styles.ctaCard}
                  onPress={() => nav.navigate('Insights')}>
                  <Text style={styles.ctaCardTitle}>Insights</Text>
                  <Text style={styles.ctaCardSub}>
                    Alertas e menores preços
                  </Text>
                </Pressable>
                <Pressable style={styles.ctaCard} onPress={goLists}>
                  <Text style={styles.ctaCardTitle}>Listas</Text>
                  <Text style={styles.ctaCardSub}>
                    {activeListName || 'Montar ou reabrir'}
                  </Text>
                </Pressable>
              </View>
            </>
          ) : isReturning ? (
            <>
              <MiniMapPreview
                center={mapOrigin}
                markers={mapMarkers}
                height={200}
                onPress={goMap}
                caption={
                  mapMarkers.length
                    ? `${mapMarkers.length} mercados por perto`
                    : 'Explorar mapa'
                }
              />
              <View style={styles.returnBlock}>
                <Text style={styles.returnTitle}>
                  {hasHistory
                    ? 'Pronto para a próxima compra'
                    : 'Mercados descobertos na sua área'}
                </Text>
                <Text style={styles.returnMsg}>
                  {hasHistory
                    ? savedTotal > 0
                      ? `Você já economizou ${formatBrl(savedTotal)} em listas finalizadas. Abra o mapa ou comece uma nova lista.`
                      : 'Toque no mapa para ver pinos ou inicie uma lista para comparar preços.'
                    : 'Toque no mapa para explorar ou comece uma lista para comparar preços da comunidade.'}
                </Text>
                <AppButton label="Abrir mapa" onPress={goMap} />
                <AppButton
                  outlined
                  label={
                    activeListName
                      ? `Continuar ${activeListName}`
                      : 'Nova lista de compras'
                  }
                  onPress={goLists}
                />
              </View>
            </>
          ) : (
            <HomeWelcome
              regionLabel={regionLabel || undefined}
              onExploreMap={goMap}
              onStartList={goLists}
              onCapture={() => nav.navigate('Capture')}
            />
          )}

          {cart.length > 0 && !hasDashboard ? (
            <EmptyState
              title="Poucos dados na região"
              message="Ainda não há preços verificados o bastante. Capture etiquetas ou valide preços na Comunidade."
              actionLabel="Capturar"
              onAction={() => nav.navigate('Capture')}
            />
          ) : null}

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
        </ScreenScrollPad>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: {paddingBottom: 8},
  heroCard: {
    marginHorizontal: space.md,
    marginTop: space.xs,
    marginBottom: space.md,
    backgroundColor: colors.navy,
    borderRadius: radii.xl,
    padding: space.lg,
    gap: 8,
  },
  heroKicker: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.6,
    color: colors.yellow,
  },
  heroMarket: {
    fontSize: 22,
    fontWeight: '900',
    color: colors.white,
    lineHeight: 28,
  },
  heroMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
  },
  heroMeta: {
    color: 'rgba(255,255,255,0.92)',
    fontWeight: '700',
    fontSize: 14,
  },
  heroCta: {
    marginTop: space.sm,
    textAlign: 'center',
    color: colors.white,
    fontWeight: '900',
    fontSize: 16,
  },
  listPad: {paddingHorizontal: space.md, marginTop: space.sm},
  ctaRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: space.md,
    marginTop: space.md,
    marginBottom: space.md,
  },
  ctaCard: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: radii.xl,
    padding: space.md,
    gap: 4,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: {width: 0, height: 2},
    elevation: 2,
  },
  ctaCardTitle: {fontWeight: '900', color: colors.navy, fontSize: 16},
  ctaCardSub: {fontWeight: '600', color: colors.muted, fontSize: 12},
  returnBlock: {
    marginHorizontal: space.md,
    marginTop: space.md,
    gap: 8,
  },
  returnTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: colors.navy,
    letterSpacing: -0.3,
  },
  returnMsg: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.muted,
    lineHeight: 19,
    marginBottom: 4,
  },
  ctaBox: {
    margin: space.md,
    padding: space.md,
    backgroundColor: colors.white,
    borderRadius: radii.xl,
    gap: 8,
  },
  ctaTitle: {fontWeight: '800', color: colors.navy, fontSize: 16},
  ctaMsg: {color: colors.muted, fontWeight: '600', fontSize: 13},
});

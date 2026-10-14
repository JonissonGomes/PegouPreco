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
  collapseMarketPins,
  filterMarketsInRadius,
  isInBrazil,
  NEARBY_RADIUS_KM,
} from '@/data/remote/nearbyMarkets';
import {ensureNearbyMarketsDiscovered} from '@/data/remote/ensureNearbyMarkets';
import {HomeHowItWorks} from '@/features/home/HomeHowItWorks';
import {HomeHub, homeShortcutIcons} from '@/features/home/HomeHub';
import {buildHomeDash, type HomePeriodDays} from '@/domain/homeDashboard';
import {HomeDashboard} from '@/features/home/HomeDashboard';

export function HomeScreen() {
  const nav = useNavigation<any>();
  const cart = useAppStore(s => s.cart);
  const markets = useAppStore(s => s.markets);
  const lists = useAppStore(s => s.lists);
  const products = useAppStore(s => s.products);
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
  const [mapOrigin, setMapOrigin] = useState<{lat: number; lng: number} | null>(
    () => {
      const last = prefs.getLastLocation();
      if (!last || !isInBrazil(last.lat, last.lng)) return null;
      return last;
    },
  );
  const [period, setPeriod] = useState<HomePeriodDays>(30);
  const [dashMarket, setDashMarket] = useState<number | null>(null);
  const [dashCategory, setDashCategory] = useState<string | null>(null);

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

  const regionLabel = [loc.neighborhood, loc.city]
    .filter((part, i, all) => part && all.indexOf(part) === i)
    .join(', ');
  const openListLabel = activeListName
    ? `Abrir ${activeListName}`
    : 'Iniciar compra';

  const nearbyMarkets = useMemo(
    () =>
      mapOrigin
        ? collapseMarketPins(
            filterMarketsInRadius(markets, mapOrigin, NEARBY_RADIUS_KM, 20),
          )
        : [],
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
  const hasLists = lists.length > 0;
  const hasBasket = cart.length > 0 && ranks.length > 0;
  const dash = useMemo(
    () => buildHomeDash(lists, products, period, dashMarket, dashCategory),
    [lists, products, period, dashMarket, dashCategory],
  );

  const discoverNearHome = useCallback(async (
    origin: {lat: number; lng: number},
    force = false,
  ) => {
    try {
      const found = await ensureNearbyMarketsDiscovered(
        origin.lat,
        origin.lng,
        {mapboxToken: MAPBOX_ACCESS_TOKEN, force},
      );
      if (found.added > 0) refresh();
    } catch {
      // offline / Overpass ok
    }
  }, [refresh]);

  const tryAutoRegion = useCallback(async () => {
    const stored = prefs.getLastLocation();
    if (stored && !isInBrazil(stored.lat, stored.lng)) {
      const currentPrefs = prefs.getLocationPrefs();
      prefs.setLocationPrefs({
        city: '',
        neighborhood: '',
        favoriteMarketIds: currentPrefs.favoriteMarketIds,
      });
      setLocSnapshot(prefs.getLocationPrefs());
      setMapOrigin(null);
    }
    const current = prefs.getLocationPrefs();
    if (current.city?.trim()) {
      setLocSnapshot(current);
      setGeoAttempted(true);
    }
    if (!permissions.location) {
      setGeoAttempted(true);
      const last = prefs.getLastLocation();
      if (!last || !isInBrazil(last.lat, last.lng)) return;
      setMapOrigin(prev =>
        prev && prev.lat === last.lat && prev.lng === last.lng ? prev : last,
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
            if (!isInBrazil(next.lat, next.lng)) {
              resolve();
              return;
            }
            prefs.setLastLocation(next.lat, next.lng);
            setMapOrigin(prev =>
              prev &&
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
            const last = prefs.getLastLocation();
            if (last && isInBrazil(last.lat, last.lng)) {
              setMapOrigin(prev =>
                prev && prev.lat === last.lat && prev.lng === last.lng
                  ? prev
                  : last,
              );
              void discoverNearHome(last);
            }
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
  const goCapture = useCallback(() => nav.navigate('Capture'), [nav]);

  const headerTitle = hasLists
    ? 'Suas compras'
    : hasGeoMarkets
      ? 'Mercados perto de você'
      : 'PegouPreço';

  const howItWorks = (
    <HomeHowItWorks
      onExploreMap={goMap}
      onStartList={goLists}
      onCapture={goCapture}
    />
  );

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
              if (mapOrigin) await discoverNearHome(mapOrigin, true);
              await loadRemote();
              setRefreshing(false);
            }}
            tintColor={colors.navy}
          />
        }>
        <ScreenScrollPad>
          <HomeHub
            savedValue={formatBrl(dash.savings)}
            savedLabel={
              dash.purchaseCount > 0
                ? 'economizados nas compras salvas'
                : 'Cadastre uma nota para ver a economia'
            }
            spentLabel={formatBrl(dash.spent)}
            purchaseCount={dash.purchaseCount}
            onOpenInsights={() => nav.navigate('Insights')}
            onOpenMarket={goMap}
            markets={mapMarkers.map(m => ({
              id: m.id,
              name: m.name,
              detail: `${NEARBY_RADIUS_KM} km`,
            }))}
            shortcuts={[
              {label: 'Mapa', Icon: homeShortcutIcons.map, onPress: goMap},
              {label: 'Compras', Icon: homeShortcutIcons.lists, onPress: goLists},
              {
                label: 'Nota',
                Icon: homeShortcutIcons.note,
                onPress: () => nav.navigate('ImportPurchase'),
              },
              {
                label: 'Insights',
                Icon: homeShortcutIcons.insights,
                onPress: () => nav.navigate('Insights'),
              },
              {
                label: 'Histórico',
                Icon: homeShortcutIcons.history,
                onPress: () => nav.navigate('History'),
              },
              {
                label: 'Comunidade',
                Icon: homeShortcutIcons.community,
                onPress: () => nav.navigate('Community'),
              },
            ]}
          />
          {hasLists ? (
            <HomeDashboard
              dash={dash}
              period={period}
              marketId={dashMarket}
              category={dashCategory}
              onPeriod={setPeriod}
              onMarket={setDashMarket}
              onCategory={setDashCategory}
              onOpenHistory={() => nav.navigate('History')}
              onOpenList={() => nav.navigate('History')}
            />
          ) : null}

          {hasBasket && best ? (
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

              {mapOrigin ? (
                <>
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
                </>
              ) : null}
              <SectionHeader
                title="Ranking"
                actionLabel="Ver compras"
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
                  <Text style={styles.ctaCardTitle}>Compras</Text>
                  <Text style={styles.ctaCardSub}>
                    {activeListName || 'Iniciar ou continuar'}
                  </Text>
                </Pressable>
              </View>
            </>
          ) : hasGeoMarkets && mapOrigin ? (
            <>
              <MiniMapPreview
                center={mapOrigin}
                markers={mapMarkers}
                height={180}
                onPress={goMap}
                caption={
                  mapMarkers.length
                    ? `${mapMarkers.length} mercados por perto`
                    : 'Explorar mapa'
                }
              />
              <View style={styles.returnBlock}>
                <Text style={styles.returnTitle}>
                  Mercados descobertos na sua área
                </Text>
                <Text style={styles.returnMsg}>
                  Toque no mapa para explorar ou inicie uma compra para comparar preços.
                </Text>
                <AppButton label="Abrir mapa" onPress={goMap} />
                <AppButton
                  outlined
                  label={
                    activeListName
                      ? `Continuar ${activeListName}`
                      : 'Iniciar compra'
                  }
                  onPress={goLists}
                />
              </View>
            </>
          ) : !hasLists ? (
            howItWorks
          ) : null}

          {cart.length > 0 && !hasBasket ? (
            <EmptyState
              title="Poucos dados na região"
              message="Ainda não há preços verificados o bastante. Capture etiquetas ou valide preços na Comunidade."
              actionLabel="Capturar"
              onAction={goCapture}
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

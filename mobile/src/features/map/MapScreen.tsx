import React, {useEffect, useMemo, useRef, useState} from 'react';
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {WebView, type WebViewMessageEvent} from 'react-native-webview';
import {useNavigation, useRoute} from '@react-navigation/native';
import Geolocation from 'react-native-geolocation-service';
import {LocateFixed, Plus, RefreshCw, Search, X} from 'lucide-react-native';
import {MAPBOX_ACCESS_TOKEN} from '@/config/env';
import {refreshPermissionFlags} from '@/app/permissions';
import {AppButton, AppField, AppScreenHeader, AppScreenNavyBar} from '@/ui/chrome';
import {appAlert} from '@/ui/appDialog';
import {apiErrorMessage} from '@/data/remote/apiError';
import {KeyboardSafeSheet} from '@/ui/keyboardSheet';
import {MarketPinSheet} from '@/ui/MarketPinSheet';
import {colors, space, spacing} from '@/ui/theme';
import {useClearOnBlur} from '@/ui/useClearOnBlur';
import {formatDistanceKm, preferAddress} from '@/domain/marketUi';
import {friendlyMarketTitle} from '@/domain/marketBrand';
import {
  canContribute,
  marketRepo,
  prefs,
  useAppStore,
} from '@/store/appStore';
import {syncApi} from '@/data/remote/syncApi';
import {ensureNearbyMarketsDiscovered} from '@/data/remote/ensureNearbyMarkets';
import {
  collapseMarketPins,
  filterMarketsInRadius,
  haversineKm,
  NEARBY_RADIUS_KM,
} from '@/data/remote/nearbyMarkets';
import type {Market} from '@/data/types';

type GeoPoint = {latitude: number; longitude: number};

function initialCenter(): GeoPoint | null {
  const last = prefs.getLastLocation();
  if (!last) return null;
  return {latitude: last.lat, longitude: last.lng};
}

function tileLayerJs(token: string) {
  if (token) {
    // Tiles 512 do Mapbox exigem zoomOffset -1 no Leaflet — senão o basemap
    // fica deslocado e os pins parecem "no lugar errado".
    const url = `https://api.mapbox.com/styles/v1/mapbox/light-v11/tiles/{z}/{x}/{y}?access_token=${token}`;
    return `L.tileLayer(${JSON.stringify(url)}, {
      tileSize: 512,
      zoomOffset: -1,
      maxZoom: 19,
      attribution: ${JSON.stringify('© Mapbox © OpenStreetMap')}
    })`;
  }
  const url =
    'https://cartodb-basemaps-a.global.ssl.fastly.net/light_all/{z}/{x}/{y}.png';
  return `L.tileLayer(${JSON.stringify(url)}, {
    maxZoom: 19,
    attribution: ${JSON.stringify('© CARTO © OpenStreetMap')}
  })`;
}

function buildMapHtml(
  center: GeoPoint,
  markets: Array<{
    id: string;
    name: string;
    lat: number;
    lng: number;
    rating: number;
  }>,
  token: string,
) {
  const markersJson = JSON.stringify(markets);

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    html, body, #map { height: 100%; margin: 0; padding: 0; background: #f0f2f5; }
    .leaflet-control-attribution {
      font-size: 9px !important;
      background: rgba(255,255,255,0.55) !important;
      color: #9ca3af !important;
      box-shadow: none !important;
      margin: 0 !important;
      padding: 2px 6px !important;
    }
    .leaflet-control-attribution a { color: #9ca3af !important; }
    .leaflet-control-zoom { border: none !important; box-shadow: 0 1px 4px rgba(0,0,0,0.12) !important; }
    .leaflet-control-zoom a {
      color: #0B2A6B !important;
      width: 32px !important;
      height: 32px !important;
      line-height: 32px !important;
      font-size: 16px !important;
    }
    .mkt-pin, .user-dot {
      background: transparent !important;
      border: none !important;
      overflow: visible !important;
    }
    .mkt-pin svg {
      display: block;
      width: 28px;
      height: 36px;
      filter: drop-shadow(0 2px 3px rgba(0,0,0,0.28));
    }
    .pin-label {
      display: none;
      position: absolute;
      left: 14px;
      bottom: 40px;
      transform: translateX(-50%);
      max-width: 148px;
      padding: 3px 8px;
      border-radius: 8px;
      background: #fff;
      color: #0B2A6B;
      font: 800 11px/1.2 sans-serif;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      box-shadow: 0 1px 4px rgba(11,42,107,0.18);
      pointer-events: none;
    }
    .map-named .pin-label { display: block; }
    .dot-user {
      width: 14px; height: 14px; border-radius: 50%;
      background: #00C2FF; border: 2px solid #fff;
      box-shadow: 0 0 0 4px rgba(0,194,255,0.25);
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    const center = [${center.latitude}, ${center.longitude}];
    const markets = ${markersJson};
    const brandRe = /atacad|atacarejo|assa[ií]|carrefour|extra|bompre|sam|arco/i;
    const map = L.map('map', {
      zoomControl: false,
      attributionControl: true,
    }).setView(center, 13);

    ${tileLayerJs(token)}.addTo(map);
    L.control.zoom({ position: 'bottomright' }).addTo(map);

    function makeUserIcon() {
      return L.divIcon({
        className: 'user-dot',
        html: '<div class="dot-user"></div>',
        iconSize: [14, 14],
        iconAnchor: [7, 7],
      });
    }

    function escapeHtml(value) {
      return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }

    function makeMarketIcon(name, featured) {
      const brand = !!featured || brandRe.test(name || '');
      const fill = brand ? '#FFD400' : '#0B2A6B';
      const stroke = brand ? '#0B2A6B' : '#ffffff';
      const ring = featured
        ? '<circle cx="14" cy="13" r="8" fill="none" stroke="#0B2A6B" stroke-width="1.6"/>'
        : '';
      const svg = '<svg viewBox="0 0 28 36" xmlns="http://www.w3.org/2000/svg">'
        + '<path d="M14 1C7.4 1 2 6.4 2 13c0 8.4 12 21 12 21s12-12.6 12-21C26 6.4 20.6 1 14 1z" fill="' + fill + '" stroke="' + stroke + '" stroke-width="2"/>'
        + ring
        + '<circle cx="14" cy="13" r="4.5" fill="' + (brand ? '#0B2A6B' : '#fff') + '"/>'
        + '</svg>';
      const label = '<div class="pin-label">' + escapeHtml(name) + '</div>';
      // Sem margin CSS: o iconAnchor já posiciona a ponta do pin na lat/lng.
      return L.divIcon({
        className: 'mkt-pin',
        html: label + svg,
        iconSize: [28, 36],
        iconAnchor: [14, 36],
        popupAnchor: [0, -36],
      });
    }

    function syncPinLabels() {
      const named = map.getZoom() >= 15;
      map.getContainer().classList.toggle('map-named', named);
    }

    const user = L.marker(center, { icon: makeUserIcon(), interactive: false }).addTo(map);
    const layer = L.layerGroup().addTo(map);
    let userMoved = false;
    let fitted = false;
    map.on('zoomend', syncPinLabels);
    syncPinLabels();
    map.on('zoomstart', function (e) {
      if (e && e.originalEvent) userMoved = true;
    });
    map.on('dragstart', function (e) {
      if (e && e.originalEvent) userMoved = true;
    });
    function postHold(lat, lng) {
      window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'hold',
        lat: lat,
        lng: lng,
      }));
    }
    map.on('contextmenu', function (e) {
      if (e.originalEvent && e.originalEvent.preventDefault) {
        e.originalEvent.preventDefault();
      }
      postHold(e.latlng.lat, e.latlng.lng);
    });
    const box = map.getContainer();
    let holdTimer = null;
    box.addEventListener('touchstart', function (ev) {
      const t = ev.touches && ev.touches[0];
      if (!t) return;
      const at = map.mouseEventToLatLng(t);
      clearTimeout(holdTimer);
      holdTimer = setTimeout(function () { postHold(at.lat, at.lng); }, 650);
    }, {passive: true});
    box.addEventListener('touchend', function () { clearTimeout(holdTimer); });
    box.addEventListener('touchmove', function () { clearTimeout(holdTimer); });

    function renderMarkets(list) {
      layer.clearLayers();
      const pts = [[center[0], center[1]]];
      (list || []).forEach((m) => {
        pts.push([m.lat, m.lng]);
        const marker = L.marker([m.lat, m.lng], { icon: makeMarketIcon(m.name, m.featured) }).addTo(layer);
        marker.on('click', () => {
          window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'market',
            id: String(m.id),
          }));
        });
      });
      if (!userMoved && !fitted && pts.length > 1) {
        fitted = true;
      }
    }

    renderMarkets(markets);
    setTimeout(function () {
      if (!userMoved && map.flyTo) {
        map.flyTo(center, 16, { animate: true, duration: 1.2 });
      }
    }, 400);

    window.setCenter = function(lat, lng) {
      const next = [lat, lng];
      user.setLatLng(next);
      center[0] = lat;
      center[1] = lng;
      if (!userMoved) map.panTo(next, { animate: true });
    };

    window.flyToMarket = function(lat, lng, zoom) {
      const z = zoom || 16;
      if (map.flyTo) {
        map.flyTo([lat, lng], z, { animate: true, duration: 1.1 });
      } else {
        map.setView([lat, lng], z, { animate: true });
      }
    };

    window.setMarkets = function(list) {
      renderMarkets(list || []);
    };
  </script>
</body>
</html>`;
}

export function MapScreen() {
  const nav = useNavigation<any>();
  const route = useRoute<any>();
  const markets = useAppStore(s => s.markets);
  const refresh = useAppStore(s => s.refresh);
  const locationGranted = useAppStore(s => s.permissions.location);
  const webRef = useRef<WebView>(null);
  const [center, setCenter] = useState<GeoPoint | null>(initialCenter);
  const [html, setHtml] = useState<string | null>(null);
  const htmlLocked = useRef(false);
  const [loading, setLoading] = useState(true);
  const [discovering, setDiscovering] = useState(false);
  const [blocked, setBlocked] = useState(!locationGranted);
  const [mapReady, setMapReady] = useState(false);
  const [status, setStatus] = useState('Buscando mercados próximos…');
  const [selected, setSelected] = useState<Market | null>(null);
  /** IDs no raio: mercados locais já ligados à API + descoberta OSM/Mapbox. */
  const [pinIds, setPinIds] = useState<number[] | null>(null);
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  useClearOnBlur(() => {
    setQuery('');
    setSearchOpen(false);
  });
  const [addOpen, setAddOpen] = useState(false);
  const [addName, setAddName] = useState('');
  const [addPoint, setAddPoint] = useState<{lat: number; lng: number} | null>(
    null,
  );
  const [addBusy, setAddBusy] = useState(false);
  const auth = useAppStore(s => s.auth);

  const nearby = useMemo(() => {
    if (pinIds && pinIds.length > 0) {
      const set = new Set(pinIds);
      return markets.filter(
        m => set.has(m.id) && m.lat != null && m.lng != null,
      );
    }
    if (!center) return [];
    return collapseMarketPins(
      filterMarketsInRadius(
        markets,
        {lat: center.latitude, lng: center.longitude},
        NEARBY_RADIUS_KM,
      ),
    );
  }, [markets, center, pinIds]);
  const rated = nearby.filter(m => (m.avgRating ?? 0) > 0).length;

  const markerData = useMemo(
    () =>
      nearby.map(m => ({
        id: String(m.id),
        name: friendlyMarketTitle(m, markets),
        lat: m.lat!,
        lng: m.lng!,
        rating: m.avgRating ?? 0,
        featured: !!m.featured,
      })),
    [nearby],
  );

  const selectedDistance =
    center && selected?.lat != null && selected?.lng != null
      ? haversineKm(
          {lat: center.latitude, lng: center.longitude},
          {lat: selected.lat, lng: selected.lng},
        )
      : null;

  const searchHits = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || !center) return [];
    return nearby
      .filter(
        m =>
          m.name.toLowerCase().includes(q) ||
          (m.address ?? '').toLowerCase().includes(q),
      )
      .slice(0, 8)
      .map(m => ({
        market: m,
        distanceKm: haversineKm(
          {lat: center.latitude, lng: center.longitude},
          {lat: m.lat!, lng: m.lng!},
        ),
      }));
  }, [nearby, query, center]);

  const flyToMarket = (m: Market) => {
    if (m.lat == null || m.lng == null) return;
    Keyboard.dismiss();
    webRef.current?.injectJavaScript(
      `window.flyToMarket && window.flyToMarket(${m.lat}, ${m.lng}, 16); true;`,
    );
    setSelected(m);
    setSearchOpen(false);
    setQuery('');
  };

  const lastFocus = useRef('');
  const focusRemoteId = route.params?.focusRemoteId as string | undefined;
  const focusLat = Number(route.params?.focusLat);
  const focusLng = Number(route.params?.focusLng);
  useEffect(() => {
    if (!mapReady || !focusRemoteId) return;
    if (!Number.isFinite(focusLat) || !Number.isFinite(focusLng)) return;
    const token = `${focusRemoteId}:${focusLat}:${focusLng}`;
    if (lastFocus.current === token) return;
    lastFocus.current = token;
    const local = markets.find(item => item.remoteId === focusRemoteId);
    const target: Market = local ?? {
      id: -1,
      name: String(route.params?.focusName ?? 'Mercado'),
      cnpj: null,
      uf: null,
      lat: focusLat,
      lng: focusLng,
      address: (route.params?.focusAddress as string | null) ?? null,
      avgRating: null,
      ratingsCount: 0,
      priceLevel: null,
      remoteId: focusRemoteId,
      updatedAt: new Date().toISOString(),
      synced: 1,
    };
    flyToMarket(target);
  }, [mapReady, focusRemoteId, focusLat, focusLng, markets]);

  useEffect(() => {
    if (!center || htmlLocked.current) return;
    htmlLocked.current = true;
    setHtml(buildMapHtml(center, [], MAPBOX_ACCESS_TOKEN));
  }, [center]);

  const pushMarkersToWeb = (list = markerData) => {
    webRef.current?.injectJavaScript(
      `window.setMarkets && window.setMarkets(${JSON.stringify(list)}); true;`,
    );
  };

  const discoverAround = async (point: GeoPoint, force = false) => {
    setDiscovering(true);
    setStatus('Buscando mercados próximos…');
    // Mostra pins locais imediatamente enquanto OSM/Mapbox respondem.
    const local = filterMarketsInRadius(
      markets,
      {lat: point.latitude, lng: point.longitude},
      NEARBY_RADIUS_KM,
    );
    if (local.length) {
      setPinIds(local.map(m => m.id));
      setStatus(`${local.length} salvos · buscando mais…`);
    }
    try {
      const found = await ensureNearbyMarketsDiscovered(
        point.latitude,
        point.longitude,
        {
          radiusKm: NEARBY_RADIUS_KM,
          mapboxToken: MAPBOX_ACCESS_TOKEN,
          force,
        },
      );
      if (found.fromCache) {
        const ids = [
          ...new Set([...local.map(m => m.id), ...found.marketIds]),
        ];
        setPinIds(ids.length ? ids : null);
        setStatus(
          ids.length
            ? `${ids.length} mercados nesta localidade`
            : 'Nenhum mercado próximo encontrado',
        );
        return;
      }
      const ids = [
        ...new Set([...local.map(m => m.id), ...found.marketIds]),
      ];
      setPinIds(ids.length ? ids : null);
      if (found.added > 0) refresh();
      setStatus(
        ids.length
          ? `${ids.length} mercados nesta localidade`
          : 'Nenhum mercado próximo encontrado',
      );
      void loadRemote(point, ids);
    } catch {
      setStatus(
        local.length
          ? `${local.length} mercados salvos próximos`
          : 'Falha ao buscar mercados próximos',
      );
    } finally {
      setDiscovering(false);
    }
  };

  const locate = async () => {
    const flags = await refreshPermissionFlags();
    useAppStore.setState({permissions: flags});
    if (!flags.location) {
      setBlocked(true);
      setStatus(
        center
          ? 'Localização desativada · usando última posição'
          : 'Ative a localização para ver mercados perto de você',
      );
      if (center) await discoverAround(center);
      return;
    }
    setStatus('Buscando mercados próximos…');
    Geolocation.getCurrentPosition(
      async pos => {
        const next = {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        };
        prefs.setLastLocation(next.latitude, next.longitude);
        setCenter(next);
        setBlocked(false);
        webRef.current?.injectJavaScript(
          `window.setCenter && window.setCenter(${next.latitude}, ${next.longitude}); true;`,
        );
        await discoverAround(next);
      },
      async () => {
        setBlocked(true);
        setStatus(
          center
            ? 'GPS indisponível · usando última posição'
            : 'GPS indisponível',
        );
        if (center) await discoverAround(center);
      },
      {enableHighAccuracy: true, timeout: 15000, maximumAge: 5000},
    );
  };

  const loadRemote = async (
    origin: GeoPoint,
    discoveredIds?: number[],
  ) => {
    try {
      const raw = prefs.getAuthJson();
      const token = raw ? (JSON.parse(raw) as {token: string}).token : null;
      const originPt = {lat: origin.latitude, lng: origin.longitude};
      const remote = await syncApi.marketsMap(token, {
        lat: originPt.lat,
        lng: originPt.lng,
        radiusKm: NEARBY_RADIUS_KM,
      });
      const pinSet = new Set(discoveredIds ?? []);
      for (const r of remote) {
        const name = String(r.name ?? '');
        if (!name) continue;
        const lat = r.lat != null ? Number(r.lat) : null;
        const lng = r.lng != null ? Number(r.lng) : null;
        if (lat == null || lng == null) continue;
        if (haversineKm(originPt, {lat, lng}) > NEARBY_RADIUS_KM) continue;
        const m = marketRepo.resolveOrCreateNear(
          name,
          lat,
          lng,
          (r.cnpj as string) ?? null,
        );
        marketRepo.upsertGeo(m.id, {
          lat: m.lat ?? lat,
          lng: m.lng ?? lng,
          address: preferAddress(m.address, (r.address as string) ?? null),
          avgRating: r.avgRating != null ? Number(r.avgRating) : m.avgRating,
          ratingsCount:
            r.ratingsCount != null ? Number(r.ratingsCount) : m.ratingsCount,
          priceLevel: (r.priceLevel as string) ?? m.priceLevel,
          weeklyVisitors:
            r.weeklyVisitors != null
              ? Number(r.weeklyVisitors)
              : m.weeklyVisitors,
          featured: r.featured === true,
          remoteId: (r.id as string) ?? m.remoteId,
          synced: 1,
        });
        // Mercados curados na API entram como pins mesmo sem discovery local
        pinSet.add(m.id);
      }
      if (pinSet.size) setPinIds([...pinSet]);
      refresh();
    } catch {
      // offline ok
    }
  };

  useEffect(() => {
    (async () => {
      await locate();
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (mapReady) pushMarkersToWeb(markerData);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markerData, mapReady]);

  const onMessage = (e: WebViewMessageEvent) => {
    try {
      const msg = JSON.parse(e.nativeEvent.data) as {
        type?: string;
        id?: string;
        lat?: number;
        lng?: number;
      };
      if (msg.type === 'hold' && msg.lat != null && msg.lng != null) {
        setAddPoint({lat: msg.lat, lng: msg.lng});
        setAddName('');
        setAddOpen(true);
        return;
      }
      if (msg.type === 'market' && msg.id) {
        const m = markets.find(x => String(x.id) === String(msg.id));
        if (m) {
          setSearchOpen(false);
          setQuery('');
          setSelected(m);
          if (m.lat != null && m.lng != null) {
            webRef.current?.injectJavaScript(
              `window.flyToMarket && window.flyToMarket(${m.lat}, ${m.lng}, 15); true;`,
            );
          }
        }
      }
    } catch {
      // ignore
    }
  };

  return (
    <View style={[styles.root, {paddingBottom: spacing.bottomNavClearance}]}>
      <AppScreenHeader
        title="Mapa"
        subtitle={
          blocked
            ? 'Localização desativada · usando área salva'
            : discovering
              ? 'Buscando mercados próximos…'
              : status
        }
        actions={
          <View style={{flexDirection: 'row'}}>
            <Pressable onPress={locate} style={styles.iconBtn}>
              <LocateFixed color={colors.navy} size={20} />
            </Pressable>
            <Pressable
              onPress={() => {
                if (center) void discoverAround(center, true);
              }}
              style={styles.iconBtn}>
              <RefreshCw color={colors.navy} size={20} />
            </Pressable>
          </View>
        }
      />
      <AppScreenNavyBar
        value={String(nearby.length)}
        label={`próximos · ${NEARBY_RADIUS_KM} km`}
        trailing={
          <View style={styles.pill}>
            <Text style={styles.pillText}>
              {discovering ? 'buscando…' : `${rated} com nota`}
            </Text>
          </View>
        }
      />
      <View style={styles.searchBar}>
        <Search size={16} color={colors.muted} />
        <TextInput
          style={styles.searchInput}
          placeholder="Buscar mercado no mapa…"
          placeholderTextColor={colors.muted}
          value={query}
          onChangeText={t => {
            setQuery(t);
            setSearchOpen(true);
          }}
          onFocus={() => setSearchOpen(true)}
        />
        {query.length > 0 ? (
          <Pressable
            onPress={() => {
              setQuery('');
              setSearchOpen(false);
            }}
            hitSlop={8}>
            <X size={16} color={colors.muted} />
          </Pressable>
        ) : null}
      </View>
      <View style={{flex: 1}}>
        {loading ? (
          <ActivityIndicator style={{marginTop: 40}} color={colors.navy} />
        ) : !html ? (
          <Text style={[styles.overlayText, styles.locateHint]}>
            Ative a localização para ver os mercados perto de você.
          </Text>
        ) : (
          <WebView
            ref={webRef}
            originWhitelist={['*']}
            source={{html}}
            style={StyleSheet.absoluteFill}
            onLoadEnd={() => setMapReady(true)}
            onMessage={onMessage}
            javaScriptEnabled
            domStorageEnabled
            setSupportMultipleWindows={false}
            mixedContentMode="always"
            allowFileAccess
          />
        )}
        {searchOpen && query.trim().length > 0 ? (
          <View style={styles.searchPanel}>
            {searchHits.length === 0 ? (
              <Text style={styles.searchEmpty}>Nenhum mercado encontrado</Text>
            ) : (
              <FlatList
                keyboardShouldPersistTaps="handled"
                data={searchHits}
                keyExtractor={x => String(x.market.id)}
                renderItem={({item}) => (
                  <Pressable
                    style={styles.searchRow}
                    onPress={() => flyToMarket(item.market)}>
                    <View style={{flex: 1}}>
                      <Text style={styles.searchName} numberOfLines={1}>
                        {item.market.name}
                      </Text>
                      <Text style={styles.searchMeta} numberOfLines={1}>
                        {formatDistanceKm(item.distanceKm)}
                        {item.market.address
                          ? ` · ${item.market.address}`
                          : ''}
                      </Text>
                    </View>
                  </Pressable>
                )}
              />
            )}
          </View>
        ) : null}
        {(!mapReady && !loading) || discovering ? (
          <View style={styles.overlayLoader} pointerEvents="none">
            <ActivityIndicator color={colors.navy} />
            {discovering ? (
              <Text style={styles.overlayText}>Buscando mercados próximos…</Text>
            ) : null}
          </View>
        ) : null}
      </View>

      <Pressable
        style={styles.addFab}
        onPress={() => {
          setAddName('');
          setAddPoint(null);
          setAddOpen(true);
        }}
        accessibilityLabel="Adicionar mercado aqui">
        <Plus size={20} color={colors.navy} />
        <Text style={styles.addFabText}>Adicionar mercado onde estou</Text>
      </Pressable>

      <MarketPinSheet
        market={selected}
        distanceKm={selectedDistance}
        onClose={() => setSelected(null)}
        onUse={m => {
          setSelected(null);
          nav.navigate('Lists', {askMarket: true, marketId: m.id});
        }}
      />

      <KeyboardSafeSheet visible={addOpen} onClose={() => setAddOpen(false)}>
        <Text style={styles.addTitle}>Adicionar supermercado</Text>
        <Text style={styles.addHint}>
          {addPoint
            ? 'Ponto escolhido ao segurar o mapa. O mercado entra como pin neste local.'
            : 'Usa sua posição atual. Você também pode segurar um ponto do mapa para escolher o local.'}
        </Text>
        <AppField
          label="Nome do mercado"
          placeholder="Ex.: Mix Mateus Imbiribeira"
          value={addName}
          onChangeText={setAddName}
          compact
        />
        <AppButton
          disabled={addBusy}
          label={addBusy ? 'Enviando…' : 'Salvar e sugerir'}
          onPress={async () => {
            const name = addName.trim();
            if (!name) {
              appAlert('Nome', 'Informe o nome do mercado.');
              return;
            }
            setAddBusy(true);
            try {
              const point = addPoint ?? (center
                ? {lat: center.latitude, lng: center.longitude}
                : null);
              if (!point) {
                appAlert('Localização', 'Ative o GPS ou segure um ponto no mapa.');
                return;
              }
              const m = marketRepo.resolveOrCreateNear(
                name,
                point.lat,
                point.lng,
              );
              marketRepo.upsertGeo(m.id, {
                lat: point.lat,
                lng: point.lng,
              });
              setPinIds(prev =>
                prev ? Array.from(new Set([...prev, m.id])) : [m.id],
              );
              refresh();
              if (canContribute(auth) && auth?.token) {
                await syncApi.submitMarketSuggestion(auth.token, {
                  name,
                  lat: point.lat,
                  lng: point.lng,
                  kind: 'add',
                  note: 'Sugestão pelo mapa',
                });
                appAlert(
                  'Mercado adicionado',
                  'Salvo no seu aparelho e enviado para revisão da comunidade.',
                );
              } else {
                appAlert(
                  'Mercado adicionado',
                  'Salvo localmente. Com conta verificada, a sugestão sobe para a comunidade.',
                );
              }
              setAddOpen(false);
              setSelected(m);
            } catch (e) {
              appAlert('Erro', apiErrorMessage(e));
            } finally {
              setAddBusy(false);
            }
          }}
        />
        <AppButton
          outlined
          label="Cancelar"
          onPress={() => setAddOpen(false)}
        />
      </KeyboardSafeSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: colors.bg},
  iconBtn: {padding: 8},
  pill: {
    backgroundColor: colors.yellowBright,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  pillText: {color: colors.navy, fontWeight: '800', fontSize: 11},
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: space.md,
    marginVertical: 8,
    paddingHorizontal: 12,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchInput: {flex: 1, color: colors.ink, fontWeight: '600', fontSize: 14},
  searchPanel: {
    position: 'absolute',
    top: 8,
    left: space.md,
    right: space.md,
    maxHeight: 240,
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    zIndex: 20,
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: {width: 0, height: 4},
    overflow: 'hidden',
  },
  searchRow: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  searchName: {fontWeight: '800', color: colors.navy, fontSize: 14},
  searchMeta: {marginTop: 2, color: colors.muted, fontWeight: '600', fontSize: 12},
  searchEmpty: {
    padding: 16,
    color: colors.muted,
    fontWeight: '600',
    textAlign: 'center',
  },
  overlayLoader: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  addFab: {
    position: 'absolute',
    right: space.md,
    bottom: spacing.bottomNavClearance + 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.yellowBright,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: {width: 0, height: 2},
    zIndex: 15,
  },
  addFabText: {fontWeight: '800', color: colors.navy, fontSize: 13},
  addTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.navy,
    marginBottom: 4,
  },
  addHint: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.muted,
    marginBottom: 10,
  },
  locateHint: {
    margin: 24,
    textAlign: 'center',
    overflow: 'hidden',
  },
  overlayText: {
    marginTop: 8,
    fontWeight: '700',
    color: colors.navy,
    backgroundColor: 'rgba(255,255,255,0.9)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    overflow: 'hidden',
  },
});

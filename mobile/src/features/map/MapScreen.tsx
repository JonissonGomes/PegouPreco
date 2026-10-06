import React, {useEffect, useMemo, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {WebView, type WebViewMessageEvent} from 'react-native-webview';
import Geolocation from 'react-native-geolocation-service';
import {LocateFixed, RefreshCw} from 'lucide-react-native';
import {MAPBOX_ACCESS_TOKEN} from '@/config/env';
import {refreshPermissionFlags} from '@/app/permissions';
import {AppScreenHeader, AppScreenNavyBar} from '@/ui/chrome';
import {MarketPinSheet} from '@/ui/MarketPinSheet';
import {colors} from '@/ui/theme';
import {marketRepo, prefs, useAppStore} from '@/store/appStore';
import {syncApi} from '@/data/remote/syncApi';
import {
  discoverNearbyMarkets,
  filterMarketsInRadius,
  haversineKm,
  NEARBY_RADIUS_KM,
} from '@/data/remote/nearbyMarkets';
import type {Market} from '@/data/types';

type GeoPoint = {latitude: number; longitude: number};

const RECIFE: GeoPoint = {latitude: -8.0476, longitude: -34.8813};

function initialCenter(): GeoPoint {
  const last = prefs.getLastLocation();
  if (last) return {latitude: last.lat, longitude: last.lng};
  return RECIFE;
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
    }
    .mkt-pin svg {
      display: block;
      width: 28px;
      height: 36px;
      filter: drop-shadow(0 2px 3px rgba(0,0,0,0.28));
    }
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
    const brandRe = /atacad|atacarejo|assa[ií]|carrefour|extra|bompre|sam/i;
    const map = L.map('map', {
      zoomControl: false,
      attributionControl: true,
    }).setView(center, 12);

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

    function makeMarketIcon(name) {
      const brand = brandRe.test(name || '');
      const fill = brand ? '#FFD400' : '#0B2A6B';
      const stroke = brand ? '#0B2A6B' : '#ffffff';
      const svg = '<svg viewBox="0 0 28 36" xmlns="http://www.w3.org/2000/svg">'
        + '<path d="M14 1C7.4 1 2 6.4 2 13c0 8.4 12 21 12 21s12-12.6 12-21C26 6.4 20.6 1 14 1z" fill="' + fill + '" stroke="' + stroke + '" stroke-width="2"/>'
        + '<circle cx="14" cy="13" r="4.5" fill="' + (brand ? '#0B2A6B' : '#fff') + '"/>'
        + '</svg>';
      // Sem margin CSS: o iconAnchor já posiciona a ponta do pin na lat/lng.
      return L.divIcon({
        className: 'mkt-pin',
        html: svg,
        iconSize: [28, 36],
        iconAnchor: [14, 36],
        popupAnchor: [0, -36],
      });
    }

    const user = L.marker(center, { icon: makeUserIcon(), interactive: false }).addTo(map);
    const layer = L.layerGroup().addTo(map);

    function renderMarkets(list) {
      layer.clearLayers();
      const pts = [[center[0], center[1]]];
      (list || []).forEach((m) => {
        pts.push([m.lat, m.lng]);
        const marker = L.marker([m.lat, m.lng], { icon: makeMarketIcon(m.name) }).addTo(layer);
        marker.on('click', () => {
          window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'market',
            id: String(m.id),
          }));
        });
      });
      if (pts.length > 1) {
        map.fitBounds(pts, { padding: [48, 48], maxZoom: 14 });
      }
    }

    renderMarkets(markets);

    window.setCenter = function(lat, lng, zoom) {
      const next = [lat, lng];
      map.setView(next, zoom || map.getZoom(), { animate: true });
      user.setLatLng(next);
      center[0] = lat;
      center[1] = lng;
    };

    window.setMarkets = function(list) {
      renderMarkets(list || []);
    };
  </script>
</body>
</html>`;
}

function ingestHits(
  hits: Array<{
    name: string;
    lat: number;
    lng: number;
    address?: string | null;
  }>,
) {
  for (const h of hits) {
    const m = marketRepo.resolveOrCreateNear(h.name, h.lat, h.lng);
    marketRepo.upsertGeo(m.id, {
      lat: h.lat,
      lng: h.lng,
      address: h.address ?? m.address,
    });
  }
}

export function MapScreen() {
  const markets = useAppStore(s => s.markets);
  const refresh = useAppStore(s => s.refresh);
  const locationGranted = useAppStore(s => s.permissions.location);
  const webRef = useRef<WebView>(null);
  const [center, setCenter] = useState<GeoPoint>(initialCenter);
  const [loading, setLoading] = useState(true);
  const [discovering, setDiscovering] = useState(false);
  const [blocked, setBlocked] = useState(!locationGranted);
  const [mapReady, setMapReady] = useState(false);
  const [status, setStatus] = useState('Buscando mercados próximos…');
  const [selected, setSelected] = useState<Market | null>(null);

  const nearby = useMemo(
    () =>
      filterMarketsInRadius(
        markets,
        {lat: center.latitude, lng: center.longitude},
        NEARBY_RADIUS_KM,
      ),
    [markets, center.latitude, center.longitude],
  );
  const rated = nearby.filter(m => (m.avgRating ?? 0) > 0).length;

  const markerData = useMemo(
    () =>
      nearby.map(m => ({
        id: String(m.id),
        name: m.name,
        lat: m.lat!,
        lng: m.lng!,
        rating: m.avgRating ?? 0,
      })),
    [nearby],
  );

  const selectedDistance =
    selected?.lat != null && selected?.lng != null
      ? haversineKm(
          {lat: center.latitude, lng: center.longitude},
          {lat: selected.lat, lng: selected.lng},
        )
      : null;

  const html = useMemo(
    () => buildMapHtml(center, markerData, MAPBOX_ACCESS_TOKEN),
    // center só no primeiro paint; depois usamos inject
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [markerData, MAPBOX_ACCESS_TOKEN],
  );

  const pushMarkersToWeb = (list = markerData) => {
    webRef.current?.injectJavaScript(
      `window.setMarkets && window.setMarkets(${JSON.stringify(list)}); true;`,
    );
  };

  const discoverAround = async (point: GeoPoint) => {
    setDiscovering(true);
    setStatus('Buscando mercados próximos…');
    try {
      await loadRemote(point);
      const hits = await discoverNearbyMarkets(
        point.latitude,
        point.longitude,
        NEARBY_RADIUS_KM,
        MAPBOX_ACCESS_TOKEN,
      );
      ingestHits(hits);
      refresh();
      setStatus(
        hits.length
          ? `${hits.length} mercados próximos`
          : 'Nenhum mercado próximo encontrado',
      );
    } catch {
      setStatus('Falha ao buscar mercados próximos');
    } finally {
      setDiscovering(false);
    }
  };

  const locate = async () => {
    const flags = await refreshPermissionFlags();
    useAppStore.setState({permissions: flags});
    if (!flags.location) {
      setBlocked(true);
      setStatus('Localização desativada');
      await discoverAround(center);
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
          `window.setCenter && window.setCenter(${next.latitude}, ${next.longitude}, 14); true;`,
        );
        await discoverAround(next);
      },
      async () => {
        setBlocked(true);
        setStatus('GPS indisponível · usando última posição');
        await discoverAround(center);
      },
      {enableHighAccuracy: true, timeout: 15000, maximumAge: 5000},
    );
  };

  const loadRemote = async (origin: GeoPoint = center) => {
    try {
      const raw = prefs.getAuthJson();
      const token = raw ? (JSON.parse(raw) as {token: string}).token : null;
      const remote = await syncApi.marketsMap(token);
      const originPt = {lat: origin.latitude, lng: origin.longitude};
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
          lat,
          lng,
          address: (r.address as string) ?? null,
          avgRating: r.avgRating != null ? Number(r.avgRating) : null,
          ratingsCount: r.ratingsCount != null ? Number(r.ratingsCount) : 0,
          priceLevel: (r.priceLevel as string) ?? null,
          remoteId: (r.id as string) ?? null,
        });
      }
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
      const msg = JSON.parse(e.nativeEvent.data) as {type?: string; id?: string};
      if (msg.type === 'market' && msg.id) {
        const m = markets.find(x => String(x.id) === String(msg.id));
        if (m) setSelected(m);
      }
    } catch {
      // ignore
    }
  };

  return (
    <View style={styles.root}>
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
              onPress={async () => {
                await loadRemote(center);
                await discoverAround(center);
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
      <View style={{flex: 1}}>
        {loading ? (
          <ActivityIndicator style={{marginTop: 40}} color={colors.navy} />
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
        {(!mapReady && !loading) || discovering ? (
          <View style={styles.overlayLoader} pointerEvents="none">
            <ActivityIndicator color={colors.navy} />
            {discovering ? (
              <Text style={styles.overlayText}>Buscando mercados próximos…</Text>
            ) : null}
          </View>
        ) : null}
      </View>

      <MarketPinSheet
        market={selected}
        distanceKm={selectedDistance}
        onClose={() => setSelected(null)}
        onUse={m => {
          prefs.setCurrentMarketId(m.id);
          setSelected(null);
        }}
      />
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
  overlayLoader: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
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

import React, {useEffect, useMemo, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {WebView, type WebViewMessageEvent} from 'react-native-webview';
import Geolocation from 'react-native-geolocation-service';
import {LocateFixed, RefreshCw} from 'lucide-react-native';
import {MAPBOX_ACCESS_TOKEN} from '@/config/env';
import {AppScreenHeader, AppScreenNavyBar} from '@/ui/chrome';
import {colors} from '@/ui/theme';
import {marketRepo, prefs, useAppStore} from '@/store/appStore';
import {syncApi} from '@/data/remote/syncApi';
import type {Market} from '@/data/types';

type GeoPoint = {latitude: number; longitude: number};

/** Estilo claro/minimalista do Mapbox; OSM Carto Positron como fallback. */
function tileUrl(token: string) {
  if (token) {
    return `https://api.mapbox.com/styles/v1/mapbox/light-v11/tiles/256/{z}/{x}/{y}@2x?access_token=${token}`;
  }
  return 'https://cartodb-basemaps-a.global.ssl.fastly.net/light_all/{z}/{x}/{y}.png';
}

function buildMapHtml(
  center: GeoPoint,
  markets: Array<{id: string; name: string; lat: number; lng: number; rating: number}>,
  token: string,
) {
  const attribution = token
    ? '© Mapbox © OpenStreetMap'
    : '© CARTO © OpenStreetMap';
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
    .dot {
      width: 12px; height: 12px; border-radius: 50%;
      background: #0B2A6B; border: 2px solid #fff;
      box-shadow: 0 1px 3px rgba(0,0,0,0.25);
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
    const map = L.map('map', {
      zoomControl: false,
      attributionControl: true,
    }).setView(center, 13);

    L.tileLayer(${JSON.stringify(tileUrl(token))}, {
      maxZoom: 19,
      attribution: ${JSON.stringify(attribution)},
    }).addTo(map);
    L.control.zoom({ position: 'bottomright' }).addTo(map);

    function makeIcon(cls) {
      return L.divIcon({
        className: '',
        html: '<div class="' + cls + '"></div>',
        iconSize: [14, 14],
        iconAnchor: [7, 7],
      });
    }

    const user = L.marker(center, { icon: makeIcon('dot-user'), interactive: false }).addTo(map);

    markets.forEach((m) => {
      const marker = L.marker([m.lat, m.lng], { icon: makeIcon('dot') }).addTo(map);
      marker.on('click', () => {
        window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'market',
          id: m.id,
        }));
      });
    });

    window.setCenter = function(lat, lng, zoom) {
      const next = [lat, lng];
      map.setView(next, zoom || map.getZoom(), { animate: true });
      user.setLatLng(next);
    };
  </script>
</body>
</html>`;
}

export function MapScreen() {
  const markets = useAppStore(s => s.markets);
  const refresh = useAppStore(s => s.refresh);
  const webRef = useRef<WebView>(null);
  const [center, setCenter] = useState<GeoPoint>({
    latitude: -8.0476,
    longitude: -34.8813,
  });
  const [loading, setLoading] = useState(true);
  const [blocked, setBlocked] = useState(false);
  const [mapReady, setMapReady] = useState(false);

  const withGeo = markets.filter(m => m.lat != null && m.lng != null);
  const rated = withGeo.filter(m => (m.avgRating ?? 0) > 0).length;

  const markerData = useMemo(
    () =>
      withGeo.map(m => ({
        id: m.id,
        name: m.name,
        lat: m.lat!,
        lng: m.lng!,
        rating: m.avgRating ?? 0,
      })),
    // ids+coords estáveis
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [markets],
  );

  const html = useMemo(
    () => buildMapHtml(center, markerData, MAPBOX_ACCESS_TOKEN),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [markerData, MAPBOX_ACCESS_TOKEN],
  );

  const locate = () => {
    Geolocation.getCurrentPosition(
      pos => {
        const next = {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        };
        setCenter(next);
        setBlocked(false);
        webRef.current?.injectJavaScript(
          `window.setCenter && window.setCenter(${next.latitude}, ${next.longitude}, 14); true;`,
        );
      },
      () => setBlocked(true),
      {enableHighAccuracy: true, timeout: 15000, maximumAge: 5000},
    );
  };

  const loadRemote = async () => {
    try {
      const raw = prefs.getAuthJson();
      const token = raw ? (JSON.parse(raw) as {token: string}).token : null;
      const remote = await syncApi.marketsMap(token);
      for (const r of remote) {
        const name = String(r.name ?? '');
        if (!name) continue;
        const m = marketRepo.resolveOrCreate(name, (r.cnpj as string) ?? null);
        marketRepo.upsertGeo(m.id, {
          lat: r.lat != null ? Number(r.lat) : null,
          lng: r.lng != null ? Number(r.lng) : null,
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
      await loadRemote();
      locate();
      setLoading(false);
    })();
  }, []);

  const openMarket = (m: Market) => {
    Alert.alert(
      m.name,
      `Nota ${(m.avgRating ?? 0).toFixed(1)} (${m.ratingsCount} avaliações)\n${m.address ?? ''}`,
    );
  };

  const onMessage = (e: WebViewMessageEvent) => {
    try {
      const msg = JSON.parse(e.nativeEvent.data) as {type?: string; id?: string};
      if (msg.type === 'market' && msg.id) {
        const m = markets.find(x => x.id === msg.id);
        if (m) openMarket(m);
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
            ? 'Localização desativada'
            : MAPBOX_ACCESS_TOKEN
              ? 'Perto de você'
              : 'Mapa básico · configure o token'
        }
        actions={
          <View style={{flexDirection: 'row'}}>
            <Pressable onPress={locate} style={styles.iconBtn}>
              <LocateFixed color={colors.navy} size={20} />
            </Pressable>
            <Pressable onPress={() => loadRemote()} style={styles.iconBtn}>
              <RefreshCw color={colors.navy} size={20} />
            </Pressable>
          </View>
        }
      />
      <AppScreenNavyBar
        value={String(withGeo.length)}
        label="mercados"
        trailing={
          <View style={styles.pill}>
            <Text style={styles.pillText}>{rated} com nota</Text>
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
        {!mapReady && !loading ? (
          <View style={styles.overlayLoader} pointerEvents="none">
            <ActivityIndicator color={colors.navy} />
          </View>
        ) : null}
      </View>
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
  },
});

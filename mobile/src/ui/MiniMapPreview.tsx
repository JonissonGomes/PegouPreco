import React, {memo, useMemo, useRef} from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {WebView} from 'react-native-webview';
import {MapPin} from 'lucide-react-native';
import {MAPBOX_ACCESS_TOKEN} from '@/config/env';
import {colors, radii, space} from '@/ui/theme';

export type MiniMapMarker = {
  id: string;
  name: string;
  lat: number;
  lng: number;
};

type Props = {
  center: {lat: number; lng: number};
  markers: MiniMapMarker[];
  height?: number;
  onPress?: () => void;
  caption?: string;
};

function markersFingerprint(
  center: {lat: number; lng: number},
  markers: MiniMapMarker[],
) {
  const head = `${center.lat.toFixed(4)},${center.lng.toFixed(4)}`;
  const body = markers
    .slice(0, 24)
    .map(
      m =>
        `${m.id}:${m.lat.toFixed(4)},${m.lng.toFixed(4)}:${m.name.length}`,
    )
    .join('|');
  return `${head}#${body}`;
}

function tileLayerJs(token: string) {
  if (token) {
    const url = `https://api.mapbox.com/styles/v1/mapbox/light-v11/tiles/{z}/{x}/{y}?access_token=${token}`;
    return `L.tileLayer(${JSON.stringify(url)}, {
      tileSize: 512, zoomOffset: -1, maxZoom: 18,
      attribution: ''
    })`;
  }
  const url =
    'https://cartodb-basemaps-a.global.ssl.fastly.net/light_all/{z}/{x}/{y}.png';
  return `L.tileLayer(${JSON.stringify(url)}, { maxZoom: 18, attribution: '' })`;
}

function buildMiniHtml(
  center: {lat: number; lng: number},
  markers: MiniMapMarker[],
  token: string,
) {
  return `<!DOCTYPE html>
<html><head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no"/>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>
  html,body,#map{height:100%;margin:0;padding:0;background:#e8edf5}
  .leaflet-control-attribution,.leaflet-control-zoom{display:none!important}
  .pin{background:transparent!important;border:none!important}
</style>
</head><body>
<div id="map"></div>
<script>
  const c=[${center.lat},${center.lng}];
  const markets=${JSON.stringify(markers)};
  const brandRe=/atacad|atacarejo|assa[ií]|carrefour|extra|bompre|sam|mix\\s*mate/i;
  const map=L.map('map',{zoomControl:false,attributionControl:false,dragging:false,scrollWheelZoom:false,doubleClickZoom:false,boxZoom:false,keyboard:false,tap:false}).setView(c,13);
  ${tileLayerJs(token)}.addTo(map);
  function icon(name){
    const brand=brandRe.test(name||'');
    const fill=brand?'#FFD400':'#0B2A6B';
    const stroke=brand?'#0B2A6B':'#fff';
    const svg='<svg viewBox="0 0 28 36" xmlns="http://www.w3.org/2000/svg"><path d="M14 1C7.4 1 2 6.4 2 13c0 8.4 12 21 12 21s12-12.6 12-21C26 6.4 20.6 1 14 1z" fill="'+fill+'" stroke="'+stroke+'" stroke-width="2"/><circle cx="14" cy="13" r="4.5" fill="'+(brand?'#0B2A6B':'#fff')+'"/></svg>';
    return L.divIcon({className:'pin',html:svg,iconSize:[24,30],iconAnchor:[12,30]});
  }
  const pts=[c];
  markets.forEach(m=>{
    pts.push([m.lat,m.lng]);
    L.marker([m.lat,m.lng],{icon:icon(m.name),interactive:false}).addTo(map);
  });
  L.circleMarker(c,{radius:6,color:'#fff',weight:2,fillColor:'#00C2FF',fillOpacity:1,interactive:false}).addTo(map);
  if(pts.length>1) map.fitBounds(pts,{padding:[28,28],maxZoom:14});
</script>
</body></html>`;
}

function MiniMapPreviewInner({
  center,
  markers,
  height = 168,
  onPress,
  caption,
}: Props) {
  const fingerprint = markersFingerprint(center, markers);
  const cached = useRef<{key: string; html: string} | null>(null);
  if (!cached.current || cached.current.key !== fingerprint) {
    cached.current = {
      key: fingerprint,
      html: buildMiniHtml(center, markers.slice(0, 24), MAPBOX_ACCESS_TOKEN),
    };
  }
  const source = useMemo(
    () => ({html: cached.current!.html}),
    [fingerprint],
  );

  return (
    <Pressable
      onPress={onPress}
      style={[styles.wrap, {height}]}
      accessibilityRole="button"
      accessibilityLabel={caption || 'Abrir mapa de mercados'}>
      <WebView
        originWhitelist={['*']}
        source={source}
        // Altura explícita — no Android flex:1 dentro de ScrollView estoura e cobre o conteúdo abaixo
        style={[styles.web, {height}]}
        scrollEnabled={false}
        nestedScrollEnabled={false}
        pointerEvents="none"
        javaScriptEnabled
        domStorageEnabled
        setSupportMultipleWindows={false}
        mixedContentMode="always"
        startInLoadingState={false}
        androidLayerType="hardware"
      />
      <View style={styles.overlay} pointerEvents="none">
        <View style={styles.chip}>
          <MapPin size={14} color={colors.navy} />
          <Text style={styles.chipText}>
            {caption ||
              (markers.length
                ? `${markers.length} mercados por perto`
                : 'Explorar mapa')}
          </Text>
        </View>
        <View style={styles.tapHint}>
          <Text style={styles.tapHintText}>Toque para abrir</Text>
        </View>
      </View>
    </Pressable>
  );
}

function propsEqual(a: Props, b: Props) {
  if (a.height !== b.height || a.caption !== b.caption) return false;
  // onPress costuma ser inline — não invalidar o WebView por isso
  return (
    markersFingerprint(a.center, a.markers) ===
    markersFingerprint(b.center, b.markers)
  );
}

export const MiniMapPreview = memo(MiniMapPreviewInner, propsEqual);

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: space.md,
    borderRadius: radii.xl,
    overflow: 'hidden',
    backgroundColor: '#e8edf5',
    borderWidth: 1,
    borderColor: colors.border,
  },
  web: {
    width: '100%',
    backgroundColor: 'transparent',
    // Android: evita WebView “infinito” no ScrollView
    opacity: 0.99,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
    padding: space.sm,
  },
  chip: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.94)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radii.pill,
  },
  chipText: {fontWeight: '800', color: colors.navy, fontSize: 12},
  tapHint: {
    alignSelf: 'flex-end',
    backgroundColor: colors.navy,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radii.pill,
  },
  tapHintText: {
    color: colors.white,
    fontWeight: '800',
    fontSize: 11,
  },
});

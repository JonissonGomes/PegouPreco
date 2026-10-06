import React, {useEffect, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import MapView, {Marker, UrlTile, PROVIDER_DEFAULT} from 'react-native-maps';
import Geolocation from 'react-native-geolocation-service';
import {LocateFixed, RefreshCw} from 'lucide-react-native';
import {MAPBOX_ACCESS_TOKEN} from '@/config/env';
import {AppScreenHeader, AppScreenNavyBar} from '@/ui/chrome';
import {colors} from '@/ui/theme';
import {marketRepo, prefs, useAppStore} from '@/store/appStore';
import {syncApi} from '@/data/remote/syncApi';
import type {Market} from '@/data/types';

/** Tiles: Mapbox (mesmo token do ResenhaFC) ou OSM gratuito. */
function tileUrl() {
  if (MAPBOX_ACCESS_TOKEN) {
    return `https://api.mapbox.com/styles/v1/mapbox/streets-v12/tiles/256/{z}/{x}/{y}@2x?access_token=${MAPBOX_ACCESS_TOKEN}`;
  }
  return 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
}

export function MapScreen() {
  const markets = useAppStore(s => s.markets);
  const refresh = useAppStore(s => s.refresh);
  const mapRef = useRef<MapView>(null);
  const [region, setRegion] = useState({
    latitude: -8.0476,
    longitude: -34.8813,
    latitudeDelta: 0.08,
    longitudeDelta: 0.08,
  });
  const [loading, setLoading] = useState(true);
  const [blocked, setBlocked] = useState(false);

  const withGeo = markets.filter(m => m.lat != null && m.lng != null);
  const rated = withGeo.filter(m => (m.avgRating ?? 0) > 0).length;

  const locate = () => {
    Geolocation.getCurrentPosition(
      pos => {
        const next = {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          latitudeDelta: 0.03,
          longitudeDelta: 0.03,
        };
        setRegion(next);
        setBlocked(false);
        mapRef.current?.animateToRegion(next, 600);
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

  return (
    <View style={styles.root}>
      <AppScreenHeader
        title="Mapa"
        subtitle={
          blocked
            ? 'Localização desativada'
            : MAPBOX_ACCESS_TOKEN
              ? 'Mapbox · perto de você'
              : 'OSM · perto de você'
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
          <MapView
            ref={mapRef}
            style={StyleSheet.absoluteFill}
            provider={PROVIDER_DEFAULT}
            initialRegion={region}
            showsUserLocation={!blocked}
            showsMyLocationButton={false}>
            <UrlTile urlTemplate={tileUrl()} maximumZ={19} flipY={false} />
            {withGeo.map(m => (
              <Marker
                key={m.id}
                coordinate={{latitude: m.lat!, longitude: m.lng!}}
                title={m.name}
                description={`★ ${(m.avgRating ?? 0).toFixed(1)}`}
                onCalloutPress={() => openMarket(m)}
              />
            ))}
          </MapView>
        )}
        {!MAPBOX_ACCESS_TOKEN ? (
          <View style={styles.banner}>
            <Text style={styles.bannerText}>
              Dica: copie REACT_APP_MAPBOX_ACCESS_TOKEN do ResenhaFC para
              MAPBOX_ACCESS_TOKEN no .env
            </Text>
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
  banner: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 90,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  bannerText: {fontSize: 12, fontWeight: '600', color: colors.navy},
});

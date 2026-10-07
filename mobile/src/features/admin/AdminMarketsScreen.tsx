import React, {useCallback, useState} from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {useFocusEffect, useNavigation} from '@react-navigation/native';
import Geolocation from 'react-native-geolocation-service';
import {ArrowLeft, MapPin, Trash2} from 'lucide-react-native';
import {AppButton, AppField, AppScreenHeader} from '@/ui/chrome';
import {colors, radii, space} from '@/ui/theme';
import {marketRepo, useAppStore} from '@/store/appStore';
import {syncApi} from '@/data/remote/syncApi';
import {apiErrorMessage} from '@/data/remote/apiError';
import {refreshPermissionFlags} from '@/app/permissions';

export function AdminMarketsScreen() {
  const nav = useNavigation<any>();
  const auth = useAppStore(s => s.auth);
  const markets = useAppStore(s => s.markets);
  const refresh = useAppStore(s => s.refresh);
  const [editLocalId, setEditLocalId] = useState<number | null>(null);
  const [remoteId, setRemoteId] = useState<string | undefined>();
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [cnpj, setCnpj] = useState('');
  const [busy, setBusy] = useState(false);
  const [suggestions, setSuggestions] = useState<
    Array<Record<string, unknown>>
  >([]);

  const loadSuggestions = useCallback(async () => {
    if (!auth?.token) return;
    try {
      const list = await syncApi.adminListMarketSuggestions(
        auth.token,
        'pending',
      );
      setSuggestions(list);
    } catch {
      setSuggestions([]);
    }
  }, [auth?.token]);

  useFocusEffect(
    useCallback(() => {
      void loadSuggestions();
    }, [loadSuggestions]),
  );

  function resetForm() {
    setEditLocalId(null);
    setRemoteId(undefined);
    setName('');
    setAddress('');
    setLat('');
    setLng('');
    setCnpj('');
  }

  function loadMarket(m: (typeof markets)[0]) {
    setEditLocalId(m.id);
    setRemoteId(m.remoteId ?? undefined);
    setName(m.name);
    setAddress(m.address ?? '');
    setLat(m.lat != null ? String(m.lat) : '');
    setLng(m.lng != null ? String(m.lng) : '');
    setCnpj(m.cnpj ?? '');
  }

  const useGps = async () => {
    const flags = await refreshPermissionFlags();
    useAppStore.setState({permissions: flags});
    if (!flags.location) {
      Alert.alert('Localização', 'Permita o GPS para preencher coordenadas.');
      return;
    }
    Geolocation.getCurrentPosition(
      pos => {
        setLat(String(pos.coords.latitude));
        setLng(String(pos.coords.longitude));
      },
      () => Alert.alert('GPS', 'Não foi possível obter a posição.'),
      {enableHighAccuracy: true, timeout: 15000, maximumAge: 5000},
    );
  };

  const save = async () => {
    if (!auth?.token) {
      Alert.alert('Sessão', 'Faça login como admin.');
      return;
    }
    const latN = Number(lat.replace(',', '.'));
    const lngN = Number(lng.replace(',', '.'));
    if (!name.trim() || !Number.isFinite(latN) || !Number.isFinite(lngN)) {
      Alert.alert('Formulário', 'Informe nome, latitude e longitude.');
      return;
    }
    setBusy(true);
    try {
      const body = {
        id: remoteId,
        name: name.trim(),
        lat: latN,
        lng: lngN,
        address: address.trim() || null,
        cnpj: cnpj.trim() || null,
      };
      const remote = await syncApi.adminUpsertMarket(auth.token, body);
      const m = marketRepo.resolveOrCreateNear(
        remote.name ?? body.name,
        latN,
        lngN,
        body.cnpj,
      );
      marketRepo.upsertGeo(m.id, {
        lat: latN,
        lng: lngN,
        address: body.address ?? m.address,
        remoteId: remote.id ?? remoteId ?? m.remoteId,
      });
      refresh();
      Alert.alert('Salvo', 'Mercado sincronizado com a nuvem.');
      resetForm();
    } catch (e) {
      Alert.alert('Erro', apiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!auth?.token || !remoteId) {
      Alert.alert('Remover', 'Só mercados já na nuvem podem ser excluídos.');
      return;
    }
    Alert.alert('Excluir mercado', 'Remover da nuvem e manter cópia local?', [
      {text: 'Cancelar', style: 'cancel'},
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            await syncApi.adminDeleteMarket(auth.token!, remoteId);
            if (editLocalId != null) {
              const m = marketRepo.getById(editLocalId);
              if (m) {
                marketRepo.upsertGeo(m.id, {remoteId: null});
              }
            }
            refresh();
            resetForm();
            Alert.alert('Removido', 'Mercado excluído na nuvem.');
          } catch (e) {
            Alert.alert('Erro', apiErrorMessage(e));
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  };

  return (
    <View style={styles.root}>
      <AppScreenHeader
        showLogo={false}
        title="Admin · Mercados"
        subtitle="Cadastro na nuvem"
        leading={
          <Pressable onPress={() => nav.goBack()} style={styles.back}>
            <ArrowLeft color={colors.navy} size={22} />
          </Pressable>
        }
      />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.body}>
        <Text style={styles.section}>Novo / editar</Text>
        <AppField label="Nome" value={name} onChangeText={setName} compact />
        <AppField
          label="Endereço (opcional)"
          value={address}
          onChangeText={setAddress}
          compact
        />
        <View style={styles.coordRow}>
          <View style={{flex: 1}}>
            <AppField label="Lat" value={lat} onChangeText={setLat} compact />
          </View>
          <View style={{flex: 1}}>
            <AppField label="Lng" value={lng} onChangeText={setLng} compact />
          </View>
        </View>
        <AppButton
          label="Usar GPS"
          outlined
          icon={<MapPin size={18} color={colors.navy} />}
          onPress={() => void useGps()}
        />
        <AppField
          label="CNPJ (opcional)"
          value={cnpj}
          onChangeText={setCnpj}
          compact
        />
        <AppButton
          disabled={busy}
          label={busy ? 'Salvando…' : 'Salvar mercado'}
          onPress={() => void save()}
        />
        {remoteId ? (
          <AppButton
            disabled={busy}
            label="Excluir na nuvem"
            outlined
            icon={<Trash2 size={18} color={colors.danger} />}
            onPress={() => void remove()}
          />
        ) : null}
        {editLocalId != null ? (
          <Pressable onPress={resetForm}>
            <Text style={styles.clearForm}>Limpar formulário</Text>
          </Pressable>
        ) : null}

        <Text style={[styles.section, {marginTop: space.lg}]}>
          Sugestões pendentes ({suggestions.length})
        </Text>
        {suggestions.length === 0 ? (
          <Text style={styles.emptySug}>Nenhuma sugestão pendente.</Text>
        ) : (
          suggestions.map(s => (
            <View key={String(s.id)} style={styles.sugCard}>
              <Text style={styles.rowName} numberOfLines={2}>
                {String(s.name ?? '')}
              </Text>
              <Text style={styles.rowMeta} numberOfLines={2}>
                {String(s.kind ?? 'add')} · {Number(s.lat).toFixed(4)},{' '}
                {Number(s.lng).toFixed(4)}
                {s.note ? ` · ${String(s.note)}` : ''}
              </Text>
              <View style={styles.sugActions}>
                <AppButton
                  disabled={busy}
                  label="Aprovar"
                  onPress={async () => {
                    if (!auth?.token) return;
                    setBusy(true);
                    try {
                      await syncApi.adminResolveMarketSuggestion(
                        auth.token,
                        String(s.id),
                        true,
                      );
                      await loadSuggestions();
                      Alert.alert('Aprovado', 'Mercado publicado no mapa.');
                    } catch (e) {
                      Alert.alert('Erro', apiErrorMessage(e));
                    } finally {
                      setBusy(false);
                    }
                  }}
                />
                <AppButton
                  disabled={busy}
                  outlined
                  label="Rejeitar"
                  onPress={async () => {
                    if (!auth?.token) return;
                    setBusy(true);
                    try {
                      await syncApi.adminResolveMarketSuggestion(
                        auth.token,
                        String(s.id),
                        false,
                      );
                      await loadSuggestions();
                    } catch (e) {
                      Alert.alert('Erro', apiErrorMessage(e));
                    } finally {
                      setBusy(false);
                    }
                  }}
                />
              </View>
            </View>
          ))
        )}

        <Text style={[styles.section, {marginTop: space.lg}]}>
          Mercados locais ({markets.length})
        </Text>
      </ScrollView>
      <FlatList
        data={markets}
        keyExtractor={m => String(m.id)}
        style={styles.list}
        contentContainerStyle={styles.listPad}
        renderItem={({item}) => (
          <Pressable
            style={[
              styles.row,
              editLocalId === item.id && styles.rowActive,
            ]}
            onPress={() => loadMarket(item)}>
            <View style={{flex: 1}}>
              <Text style={styles.rowName} numberOfLines={1}>
                {item.name}
              </Text>
              <Text style={styles.rowMeta} numberOfLines={1}>
                {item.lat != null && item.lng != null
                  ? `${item.lat.toFixed(4)}, ${item.lng.toFixed(4)}`
                  : 'Sem coordenadas'}
                {item.remoteId ? ' · nuvem' : ''}
              </Text>
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: colors.bg},
  back: {padding: 8},
  body: {padding: space.md, paddingBottom: space.sm, gap: 8},
  section: {fontWeight: '800', fontSize: 16, color: colors.navy},
  coordRow: {flexDirection: 'row', gap: 8},
  clearForm: {
    textAlign: 'center',
    color: colors.muted,
    fontWeight: '700',
    paddingVertical: 8,
  },
  list: {flex: 1},
  listPad: {paddingHorizontal: space.md, paddingBottom: 40},
  row: {
    backgroundColor: colors.white,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.sm,
    marginBottom: 6,
  },
  rowActive: {borderColor: colors.navy, borderWidth: 2},
  rowName: {fontWeight: '800', color: colors.navy, fontSize: 14},
  rowMeta: {color: colors.muted, fontWeight: '600', fontSize: 11, marginTop: 2},
  emptySug: {
    color: colors.muted,
    fontWeight: '600',
    fontSize: 12,
    marginBottom: 8,
  },
  sugCard: {
    backgroundColor: colors.white,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.sm,
    marginBottom: 8,
    gap: 6,
  },
  sugActions: {flexDirection: 'row', gap: 8},
});

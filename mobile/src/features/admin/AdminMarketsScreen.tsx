import React, {useCallback, useMemo, useState} from 'react';
import {
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
import {appAlert} from '@/ui/appDialog';
import {colors, radii, space} from '@/ui/theme';
import {marketRepo, useAppStore} from '@/store/appStore';
import {syncApi, type AdminMarketRemote} from '@/data/remote/syncApi';
import {apiErrorMessage} from '@/data/remote/apiError';
import {refreshPermissionFlags} from '@/app/permissions';
import {PIN_REPORTS, pinReportLabel} from '@/domain/pinReports';

type Tab = 'markets' | 'support' | 'form';

const FILTERS = [
  {id: 'all', label: 'Todos'},
  ...PIN_REPORTS.map(item => ({id: item.id, label: item.label})),
  {id: 'confirm', label: 'Confirmação'},
];

export function AdminMarketsScreen() {
  const nav = useNavigation<any>();
  const auth = useAppStore(s => s.auth);
  const refresh = useAppStore(s => s.refresh);
  const [tab, setTab] = useState<Tab>('markets');
  const [cloud, setCloud] = useState<AdminMarketRemote[]>([]);
  const [suggestions, setSuggestions] = useState<Array<Record<string, unknown>>>(
    [],
  );
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [editLocalId, setEditLocalId] = useState<number | null>(null);
  const [remoteId, setRemoteId] = useState<string | undefined>();
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [cnpj, setCnpj] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!auth?.token) return;
    try {
      setCloud(await syncApi.adminListMarkets(auth.token));
    } catch {
      setCloud([]);
    }
    try {
      setSuggestions(
        await syncApi.adminListMarketSuggestions(auth.token, 'pending'),
      );
    } catch {
      setSuggestions([]);
    }
  }, [auth?.token]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const visibleSuggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    return suggestions.filter(item => {
      const type = String(item.reportType ?? '');
      const kind = String(item.kind ?? '');
      if (filter === 'confirm' && kind !== 'confirm') return false;
      if (filter !== 'all' && filter !== 'confirm' && type !== filter) {
        return false;
      }
      if (!q) return true;
      return String(item.name ?? '').toLowerCase().includes(q);
    });
  }, [suggestions, filter, query]);

  function resetForm() {
    setEditLocalId(null);
    setRemoteId(undefined);
    setName('');
    setAddress('');
    setLat('');
    setLng('');
    setCnpj('');
  }

  function fillForm(source: {
    id?: string;
    name?: string;
    address?: string | null;
    lat?: number;
    lng?: number;
    cnpj?: string | null;
  }) {
    const local = marketRepo
      .all()
      .find(m => m.remoteId && m.remoteId === source.id);
    setEditLocalId(local?.id ?? null);
    setRemoteId(source.id);
    setName(source.name ?? '');
    setAddress(source.address ?? '');
    setLat(source.lat != null ? String(source.lat) : '');
    setLng(source.lng != null ? String(source.lng) : '');
    setCnpj(source.cnpj ?? '');
    setTab('form');
  }

  function askEdit(source: Parameters<typeof fillForm>[0]) {
    appAlert('Editar mercado', `Alterar ${source.name ?? 'este mercado'}?`, [
      {label: 'Cancelar', style: 'cancel'},
      {label: 'Editar', style: 'primary', onPress: () => fillForm(source)},
    ]);
  }

  const useGps = async () => {
    const flags = await refreshPermissionFlags();
    useAppStore.setState({permissions: flags});
    if (!flags.location) {
      appAlert('Localização', 'Permita o GPS para preencher coordenadas.');
      return;
    }
    Geolocation.getCurrentPosition(
      pos => {
        setLat(String(pos.coords.latitude));
        setLng(String(pos.coords.longitude));
      },
      () => appAlert('GPS', 'Não foi possível obter a posição.'),
      {enableHighAccuracy: true, timeout: 15000, maximumAge: 5000},
    );
  };

  const save = async () => {
    if (!auth?.token) {
      appAlert('Sessão', 'Faça login como admin.');
      return;
    }
    const latN = Number(lat.replace(',', '.'));
    const lngN = Number(lng.replace(',', '.'));
    if (!name.trim() || !Number.isFinite(latN) || !Number.isFinite(lngN)) {
      appAlert('Formulário', 'Informe nome, latitude e longitude.');
      return;
    }
    appAlert(
      remoteId ? 'Salvar edição' : 'Publicar mercado',
      `${name.trim()} vai para a nuvem com esses dados.`,
      [
        {label: 'Cancelar', style: 'cancel'},
        {
          label: 'Confirmar',
          style: 'primary',
          onPress: () => void persist(latN, lngN),
        },
      ],
    );
  };

  const persist = async (latN: number, lngN: number) => {
    if (!auth?.token) return;
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
      resetForm();
      await load();
      setTab('markets');
      appAlert('Salvo', 'Mercado sincronizado com a nuvem.', undefined, 'success');
    } catch (e) {
      appAlert('Erro', apiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const removeCloud = (market: AdminMarketRemote) => {
    if (!auth?.token) return;
    appAlert('Excluir mercado', `Remover ${market.name} da nuvem?`, [
      {label: 'Cancelar', style: 'cancel'},
      {
        label: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            await syncApi.adminDeleteMarket(auth.token!, market.id);
            const local = marketRepo
              .all()
              .find(m => m.remoteId === market.id);
            if (local) marketRepo.upsertGeo(local.id, {remoteId: null});
            refresh();
            if (remoteId === market.id) resetForm();
            await load();
            appAlert('Removido', 'Mercado excluído na nuvem.', undefined, 'success');
          } catch (e) {
            appAlert('Erro', apiErrorMessage(e));
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  };

  const resolveSuggestion = (id: string, approve: boolean) => {
    if (!auth?.token) return;
    appAlert(
      approve ? 'Aprovar reporte' : 'Rejeitar reporte',
      approve
        ? 'Publicar ou aplicar esta sugestão?'
        : 'Descartar esta sugestão?',
      [
        {label: 'Cancelar', style: 'cancel'},
        {
          label: approve ? 'Aprovar' : 'Rejeitar',
          style: approve ? 'primary' : 'destructive',
          onPress: async () => {
            setBusy(true);
            try {
              await syncApi.adminResolveMarketSuggestion(
                auth.token!,
                id,
                approve,
              );
              await load();
              if (approve) {
                appAlert('Aprovado', 'Sugestão aplicada.', undefined, 'success');
              }
            } catch (e) {
              appAlert('Erro', apiErrorMessage(e));
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );
  };

  return (
    <View style={styles.root}>
      <AppScreenHeader
        showLogo={false}
        title="Admin · Mercados"
        subtitle={
          tab === 'markets'
            ? 'Cadastrados'
            : tab === 'support'
              ? 'Suporte'
              : 'Cadastro'
        }
        leading={
          <Pressable onPress={() => nav.goBack()} style={styles.back}>
            <ArrowLeft color={colors.navy} size={22} />
          </Pressable>
        }
      />
      <View style={styles.tabs}>
        {(
          [
            ['markets', 'Mercados'],
            ['support', 'Suporte'],
            ['form', 'Cadastro'],
          ] as const
        ).map(([id, label]) => (
          <Pressable
            key={id}
            style={[styles.tab, tab === id && styles.tabOn]}
            onPress={() => setTab(id)}>
            <Text style={[styles.tabText, tab === id && styles.tabTextOn]}>
              {label}
            </Text>
          </Pressable>
        ))}
      </View>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.body}>
        {tab === 'markets' ? (
          cloud.length === 0 ? (
            <Text style={styles.empty}>Nenhum mercado na nuvem ainda.</Text>
          ) : (
            cloud.map(item => (
              <View key={item.id} style={styles.card}>
                <Text style={styles.rowName}>{item.name}</Text>
                <Text style={styles.rowMeta}>
                  {item.address || 'Endereço não informado'}
                  {item.city ? ` · ${item.city}` : ''}
                </Text>
                <View style={styles.actions}>
                  <View style={styles.action}>
                    <AppButton
                      outlined
                      label="Editar"
                      onPress={() => askEdit(item)}
                    />
                  </View>
                  <View style={styles.action}>
                    <AppButton
                      outlined
                      label="Remover"
                      icon={<Trash2 size={16} color={colors.danger} />}
                      onPress={() => removeCloud(item)}
                    />
                  </View>
                </View>
              </View>
            ))
          )
        ) : null}

        {tab === 'support' ? (
          <>
            <AppField
              label="Filtrar por mercado"
              value={query}
              onChangeText={setQuery}
              compact
            />
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.chips}>
                {FILTERS.map(item => (
                  <Pressable
                    key={item.id}
                    style={[styles.chip, filter === item.id && styles.chipOn]}
                    onPress={() => setFilter(item.id)}>
                    <Text
                      style={[
                        styles.chipText,
                        filter === item.id && styles.chipTextOn,
                      ]}>
                      {item.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>
            {visibleSuggestions.length === 0 ? (
              <Text style={styles.empty}>Nada pendente nesse filtro.</Text>
            ) : (
              visibleSuggestions.map(item => (
                <View key={String(item.id)} style={styles.card}>
                  <Text style={styles.rowName}>{String(item.name ?? '')}</Text>
                  <Text style={styles.rowMeta}>
                    {item.reportType
                      ? pinReportLabel(String(item.reportType))
                      : item.kind === 'confirm'
                        ? 'Confirmação'
                        : String(item.kind ?? 'sugestão')}
                    {item.note ? ` · ${String(item.note)}` : ''}
                  </Text>
                  <View style={styles.actions}>
                    <View style={styles.action}>
                      <AppButton
                        outlined
                        label="Editar"
                        disabled={busy}
                        onPress={() =>
                          askEdit({
                            id: item.targetMarketId
                              ? String(item.targetMarketId)
                              : undefined,
                            name: String(item.name ?? ''),
                            address: (item.address as string) ?? null,
                            lat: Number(item.lat),
                            lng: Number(item.lng),
                            cnpj: (item.cnpj as string) ?? null,
                          })
                        }
                      />
                    </View>
                    <View style={styles.action}>
                      <AppButton
                        label="Aprovar"
                        disabled={busy}
                        onPress={() =>
                          resolveSuggestion(String(item.id), true)
                        }
                      />
                    </View>
                    <View style={styles.action}>
                      <AppButton
                        outlined
                        label="Rejeitar"
                        disabled={busy}
                        onPress={() =>
                          resolveSuggestion(String(item.id), false)
                        }
                      />
                    </View>
                  </View>
                </View>
              ))
            )}
          </>
        ) : null}

        {tab === 'form' ? (
          <>
            <AppField label="Nome" value={name} onChangeText={setName} compact />
            <AppField
              label="Endereço"
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
              label={busy ? 'Salvando…' : remoteId ? 'Salvar edição' : 'Publicar mercado'}
              onPress={() => void save()}
            />
            {editLocalId != null || remoteId ? (
              <Pressable onPress={resetForm}>
                <Text style={styles.clearForm}>Limpar formulário</Text>
              </Pressable>
            ) : null}
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: colors.bg},
  back: {padding: 8},
  tabs: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: space.md,
    paddingBottom: space.sm,
  },
  tab: {
    flex: 1,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tabOn: {backgroundColor: colors.navy, borderColor: colors.navy},
  tabText: {fontWeight: '800', color: colors.navy, fontSize: 12},
  tabTextOn: {color: '#fff'},
  body: {padding: space.md, paddingBottom: 48, gap: 8},
  card: {
    backgroundColor: colors.white,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.sm,
    gap: 6,
  },
  rowName: {fontWeight: '800', color: colors.navy, fontSize: 15},
  rowMeta: {color: colors.muted, fontWeight: '600', fontSize: 12},
  actions: {flexDirection: 'row', gap: 8, marginTop: 4},
  action: {flex: 1},
  empty: {color: colors.muted, fontWeight: '600'},
  coordRow: {flexDirection: 'row', gap: 8},
  clearForm: {
    textAlign: 'center',
    color: colors.muted,
    fontWeight: '700',
    paddingVertical: 8,
  },
  chips: {flexDirection: 'row', gap: 8, paddingVertical: 4},
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipOn: {backgroundColor: colors.navy, borderColor: colors.navy},
  chipText: {fontWeight: '700', color: colors.navy, fontSize: 12},
  chipTextOn: {color: '#fff'},
});

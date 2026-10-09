import React, {useCallback, useMemo, useState} from 'react';
import {Pressable, ScrollView, Text, View} from 'react-native';
import {useFocusEffect, useNavigation} from '@react-navigation/native';
import Geolocation from 'react-native-geolocation-service';
import {ArrowLeft} from 'lucide-react-native';
import {AppScreenHeader} from '@/ui/chrome';
import {appAlert} from '@/ui/appDialog';
import {colors} from '@/ui/theme';
import {marketRepo, useAppStore} from '@/store/appStore';
import {syncApi, type AdminMarketRemote} from '@/data/remote/syncApi';
import {apiErrorMessage} from '@/data/remote/apiError';
import {refreshPermissionFlags} from '@/app/permissions';
import {AdminMarketForm} from './AdminMarketForm';
import {AdminMarketList} from './AdminMarketList';
import {
  AdminSupportPanel,
  type SuggestionDraft,
} from './AdminSupportPanel';
import {adminStyles as styles} from './adminStyles';

type Tab = 'markets' | 'support' | 'form';

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

  function fillForm(source: SuggestionDraft) {
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

  function askEdit(source: SuggestionDraft) {
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
            const local = marketRepo.all().find(m => m.remoteId === market.id);
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
              await syncApi.adminResolveMarketSuggestion(auth.token!, id, approve);
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
          <AdminMarketList
            markets={cloud}
            onEdit={askEdit}
            onRemove={removeCloud}
          />
        ) : null}
        {tab === 'support' ? (
          <AdminSupportPanel
            query={query}
            filter={filter}
            busy={busy}
            items={visibleSuggestions}
            onQuery={setQuery}
            onFilter={setFilter}
            onEdit={askEdit}
            onResolve={resolveSuggestion}
          />
        ) : null}
        {tab === 'form' ? (
          <AdminMarketForm
            name={name}
            address={address}
            lat={lat}
            lng={lng}
            cnpj={cnpj}
            busy={busy}
            editing={editLocalId != null || !!remoteId}
            onName={setName}
            onAddress={setAddress}
            onLat={setLat}
            onLng={setLng}
            onCnpj={setCnpj}
            onGps={() => void useGps()}
            onSave={() => void save()}
            onClear={resetForm}
          />
        ) : null}
      </ScrollView>
    </View>
  );
}

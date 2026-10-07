import React, {useEffect, useMemo, useState} from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {ClipboardList, Store} from 'lucide-react-native';
import {
  AppButton,
  AppField,
  AppListCard,
  AppScreenHeader,
  AppScreenNavyBar,
} from '@/ui/chrome';
import {FiscalBadge} from '@/ui/components';
import {KeyboardSafeSheet} from '@/ui/keyboardSheet';
import {MarketSuggestRow} from '@/ui/MarketSuggestRow';
import {colors, radii, space} from '@/ui/theme';
import {formatBrl} from '@/domain/money';
import {rankNearestMarkets} from '@/domain/marketUi';
import {TrustEngine} from '@/domain/trust';
import {
  marketRepo,
  prefs,
  priceLogRepo,
  useAppStore,
  useMarketName,
} from '@/store/appStore';
import {syncApi, type ReputationRemote} from '@/data/remote/syncApi';
import type {FiscalLevel} from '@/data/types';

function miniDate(iso: string) {
  const local = new Date(iso);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const day = new Date(local.getFullYear(), local.getMonth(), local.getDate());
  const time = local.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });
  if (day.getTime() === today.getTime()) return `hoje · ${time}`;
  return `${local.toLocaleDateString('pt-BR', {day: '2-digit', month: '2-digit'})} · ${time}`;
}

export function InsightsScreen() {
  const nav = useNavigation<any>();
  const lists = useAppStore(s => s.lists);
  const markets = useAppStore(s => s.markets);
  const auth = useAppStore(s => s.auth);
  const currentMarketId = useAppStore(s => s.currentMarketId);
  const setCurrentMarket = useAppStore(s => s.setCurrentMarket);
  const refresh = useAppStore(s => s.refresh);
  const marketName = useMarketName(currentMarketId);
  const [query, setQuery] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [marketQuery, setMarketQuery] = useState('');
  const [rep, setRep] = useState<ReputationRemote | null>(null);

  useEffect(() => {
    if (!auth?.token) {
      setRep(null);
      return;
    }
    syncApi
      .reputation(auth.token)
      .then(setRep)
      .catch(() => setRep(null));
  }, [auth?.token]);

  const cheap = useMemo(() => priceLogRepo.cheapestNow(40), [lists, markets]);
  const opps = useMemo(() => priceLogRepo.opportunities(), [lists, markets]);
  const today = useMemo(
    () =>
      currentMarketId
        ? priceLogRepo.forMarketToday(currentMarketId)
        : [],
    [currentMarketId, lists],
  );

  const q = query.trim().toLowerCase();
  const match = (t: string) => !q || t.toLowerCase().includes(q);

  const cheapF = cheap.filter(
    r => match(r.product.name) || match(r.marketName ?? ''),
  );
  const cheapByCat = useMemo(() => {
    const map = new Map<string, typeof cheapF>();
    for (const r of cheapF) {
      const cat = r.product.category?.trim() || 'Outros';
      const arr = map.get(cat) ?? [];
      arr.push(r);
      map.set(cat, arr);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], 'pt-BR'));
  }, [cheapF]);
  const oppsF = opps.filter(o => match(o.product.name));
  const listsF = lists.filter(
    l => match(l.name) || match(l.marketName ?? ''),
  );
  const todayF = today.filter(i => match(i.productName));
  const alerts = cheapF.length + oppsF.length;

  const origin = prefs.getLastLocation();
  const suggested = rankNearestMarkets(markets, origin, {
    query: marketQuery,
    limit: 8,
  });
  const canCreate =
    marketQuery.trim().length > 0 &&
    !markets.some(
      m => m.name.toLowerCase() === marketQuery.trim().toLowerCase(),
    );
  const fiscalLevel =
    (rep?.level as FiscalLevel) ??
    TrustEngine.levelForPoints(rep?.points ?? 0);

  const data: Array<{type: string; key: string; payload?: any}> = [];
  if (marketName) {
    data.push({type: 'section', key: 'today-h', payload: {title: 'Hoje neste mercado', trailing: String(todayF.length)}});
    if (!todayF.length) {
      data.push({type: 'empty', key: 'today-e', payload: `Nenhum item catalogado hoje em ${marketName}.`});
    } else {
      todayF.forEach(i => data.push({type: 'today', key: `t-${i.id}`, payload: i}));
    }
  }
  data.push({type: 'section', key: 'cheap-h', payload: {title: 'Preço mais baixo', trailing: `${cheapF.length} itens`}});
  cheapF.forEach(r => data.push({type: 'cheap', key: `c-${r.product.id}`, payload: r}));
  if (cheapByCat.length) {
    data.push({
      type: 'section',
      key: 'bycat-h',
      payload: {title: 'Por categoria', trailing: `${cheapByCat.length} grupos`},
    });
    for (const [cat, items] of cheapByCat) {
      data.push({
        type: 'cat-section',
        key: `bycat-${cat}`,
        payload: {title: cat, trailing: String(items.length)},
      });
      items.forEach(r =>
        data.push({type: 'cheap', key: `bc-${cat}-${r.product.id}`, payload: r}),
      );
    }
  }
  data.push({type: 'section', key: 'opp-h', payload: {title: 'Acima da sua média', trailing: String(oppsF.length)}});
  oppsF.forEach(o => data.push({type: 'opp', key: `o-${o.product.id}`, payload: o}));
  data.push({type: 'section', key: 'list-h', payload: {title: 'Listas passadas', trailing: String(listsF.length)}});
  listsF.forEach(l => data.push({type: 'list', key: `l-${l.id}`, payload: l}));

  return (
    <View style={styles.root}>
      <AppScreenHeader
        showLogo={false}
        title="Insights"
        subtitle={marketName || 'Preços e alertas'}
        actions={
          <View style={{flexDirection: 'row'}}>
            <Pressable
              style={styles.iconBtn}
              onPress={() => nav.navigate('ShoppingLists')}>
              <ClipboardList color={colors.navy} size={20} />
            </Pressable>
            <Pressable
              style={styles.iconBtn}
              onPress={() => setPickerOpen(true)}>
              <Store color={colors.navy} size={20} />
            </Pressable>
          </View>
        }
      />
      <AppScreenNavyBar
        value={String(alerts)}
        label="alertas"
        trailing={
          <FiscalBadge level={fiscalLevel} points={rep?.points ?? 0} />
        }
      />
      <View style={styles.heroHint}>
        <Text style={styles.heroHintText}>
          Alertas e oportunidades · suba de Fiscal validando preços na Comunidade
        </Text>
      </View>
      <TextInput
        style={styles.search}
        placeholder="Buscar item, mercado ou lista…"
        placeholderTextColor={colors.muted}
        value={query}
        onChangeText={setQuery}
      />
      <FlatList
        data={data}
        keyExtractor={i => i.key}
        contentContainerStyle={{padding: 16, paddingBottom: 100}}
        renderItem={({item}) => {
          if (item.type === 'section' || item.type === 'cat-section') {
            const isCat = item.type === 'cat-section';
            return (
              <View style={[styles.sectionRow, isCat && styles.catSectionRow]}>
                <Text style={[styles.section, isCat && styles.catSection]}>
                  {item.payload.title}
                </Text>
                <View style={styles.sectionPill}>
                  <Text style={styles.sectionPillText}>
                    {item.payload.trailing}
                  </Text>
                </View>
              </View>
            );
          }
          if (item.type === 'empty') {
            return <Text style={styles.emptyLine}>{item.payload}</Text>;
          }
          if (item.type === 'today') {
            const i = item.payload;
            return (
              <AppListCard
                onPress={() =>
                  nav.navigate('ProductDetail', {productId: i.productId})
                }>
                <View style={styles.row}>
                  <View style={{flex: 1}}>
                    <Text style={styles.name}>{i.productName}</Text>
                    <Text style={styles.muted}>{miniDate(i.capturedAt)}</Text>
                  </View>
                  <Text style={styles.price}>{formatBrl(i.retailPrice)}</Text>
                </View>
              </AppListCard>
            );
          }
          if (item.type === 'cheap') {
            const r = item.payload;
            return (
              <AppListCard
                onPress={() =>
                  nav.navigate('ProductDetail', {productId: r.product.id})
                }>
                <View style={styles.row}>
                  <View style={{flex: 1}}>
                    <Text style={styles.name}>{r.product.name}</Text>
                    <Text style={styles.muted}>
                      {r.marketName || 'Mercado'} · {miniDate(r.log.capturedAt)}
                    </Text>
                  </View>
                  <Text style={[styles.price, {color: colors.trustGreen}]}>
                    {formatBrl(r.log.retailPrice)}
                  </Text>
                </View>
              </AppListCard>
            );
          }
          if (item.type === 'opp') {
            const o = item.payload;
            return (
              <AppListCard
                onPress={() =>
                  nav.navigate('ProductDetail', {productId: o.product.id})
                }>
                <View style={styles.row}>
                  <View style={{flex: 1}}>
                    <Text style={styles.name}>{o.product.name}</Text>
                    <Text style={styles.muted}>
                      +{o.pctAbove.toFixed(0)}% vs média {formatBrl(o.avgPrice)}
                    </Text>
                  </View>
                  <Text style={styles.price}>{formatBrl(o.lastPrice)}</Text>
                </View>
              </AppListCard>
            );
          }
          const l = item.payload;
          return (
            <AppListCard onPress={() => nav.navigate('ShoppingLists')}>
              <View style={styles.row}>
                <View style={{flex: 1}}>
                  <Text style={styles.name}>{l.name}</Text>
                  <Text style={styles.muted}>
                    {l.marketName} ·{' '}
                    {new Date(l.finishedAt).toLocaleDateString('pt-BR')} ·{' '}
                    {l.itemCount} itens
                  </Text>
                </View>
                <Text style={styles.price}>{formatBrl(l.subtotal)}</Text>
              </View>
            </AppListCard>
          );
        }}
      />

      <KeyboardSafeSheet
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}>
        <Text style={styles.modalTitle}>Mercado atual</Text>
        <Text style={styles.muted}>
          Busque e selecione. Se não existir, será criado.
        </Text>
        <AppField
          label="Mercado"
          placeholder="Ex.: Atacadão…"
          value={marketQuery}
          onChangeText={setMarketQuery}
          compact
        />
        {suggested.map(m => (
          <MarketSuggestRow
            key={m.id}
            market={m}
            highlight={m.id === currentMarketId}
            onPress={() => {
              setCurrentMarket(m.id);
              setPickerOpen(false);
              refresh();
            }}
          />
        ))}
        {canCreate ? (
          <AppButton
            label={`Usar "${marketQuery.trim()}" (novo)`}
            onPress={() => {
              const m = marketRepo.resolveOrCreate(marketQuery.trim());
              setCurrentMarket(m.id);
              setPickerOpen(false);
              refresh();
            }}
          />
        ) : null}
        <AppButton
          label="Fechar"
          outlined
          onPress={() => setPickerOpen(false)}
        />
      </KeyboardSafeSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: colors.bg},
  iconBtn: {padding: 8},
  heroHint: {
    marginHorizontal: space.md,
    marginTop: space.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#EEF2FF',
    borderRadius: radii.md,
  },
  heroHintText: {
    color: colors.navy,
    fontWeight: '700',
    fontSize: 12,
    lineHeight: 16,
  },
  search: {
    margin: 16,
    marginBottom: 0,
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    height: 44,
    color: colors.ink,
    fontWeight: '600',
  },
  sectionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    marginTop: 8,
  },
  section: {fontWeight: '800', color: colors.navy, fontSize: 15},
  catSectionRow: {marginTop: 4, marginLeft: 4},
  catSection: {fontSize: 13, fontWeight: '700', color: colors.muted},
  sectionPill: {
    backgroundColor: colors.yellowBright,
    borderRadius: radii.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  sectionPillText: {fontSize: 11, fontWeight: '800', color: colors.navy},
  muted: {color: colors.muted, fontWeight: '600', fontSize: 12},
  emptyLine: {color: colors.muted, marginBottom: 10, fontWeight: '600'},
  row: {flexDirection: 'row', alignItems: 'center', gap: 8},
  name: {fontWeight: '800', color: colors.navy, fontSize: 14},
  price: {fontWeight: '800', color: colors.navy, fontSize: 15},
  modalTitle: {fontSize: 18, fontWeight: '800', color: colors.navy},
});

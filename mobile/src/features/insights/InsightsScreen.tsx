import React, {useMemo, useState} from 'react';
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
import {KeyboardSafeSheet} from '@/ui/keyboardSheet';
import {colors} from '@/ui/theme';
import {formatBrl} from '@/domain/money';
import {TrustEngine} from '@/domain/trust';
import {
  marketRepo,
  priceLogRepo,
  useAppStore,
  useMarketName,
} from '@/store/appStore';

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
  const currentMarketId = useAppStore(s => s.currentMarketId);
  const setCurrentMarket = useAppStore(s => s.setCurrentMarket);
  const refresh = useAppStore(s => s.refresh);
  const marketName = useMarketName(currentMarketId);
  const [query, setQuery] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [marketQuery, setMarketQuery] = useState('');

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
  const oppsF = opps.filter(o => match(o.product.name));
  const listsF = lists.filter(
    l => match(l.name) || match(l.marketName ?? ''),
  );
  const todayF = today.filter(i => match(i.productName));
  const alerts = cheapF.length + oppsF.length;

  const filteredMarkets = markets.filter(m =>
    m.name.toLowerCase().includes(marketQuery.trim().toLowerCase()),
  );
  const canCreate =
    marketQuery.trim().length > 0 &&
    !markets.some(
      m => m.name.toLowerCase() === marketQuery.trim().toLowerCase(),
    );

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
  data.push({type: 'section', key: 'opp-h', payload: {title: 'Acima da sua média', trailing: String(oppsF.length)}});
  oppsF.forEach(o => data.push({type: 'opp', key: `o-${o.product.id}`, payload: o}));
  data.push({type: 'section', key: 'list-h', payload: {title: 'Listas passadas', trailing: String(listsF.length)}});
  listsF.forEach(l => data.push({type: 'list', key: `l-${l.id}`, payload: l}));

  return (
    <View style={styles.root}>
      <AppScreenHeader
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
          <View style={styles.pill}>
            <Text style={styles.pillText}>
              Fiscal {TrustEngine.fiscalLabel('bronze')} · 0 pts
            </Text>
          </View>
        }
      />
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
          if (item.type === 'section') {
            return (
              <View style={styles.sectionRow}>
                <Text style={styles.section}>{item.payload.title}</Text>
                <Text style={styles.muted}>{item.payload.trailing}</Text>
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
        {filteredMarkets.slice(0, 8).map(m => (
          <Pressable
            key={m.id}
            style={styles.marketRow}
            onPress={() => {
              setCurrentMarket(m.id);
              setPickerOpen(false);
              refresh();
            }}>
            <Text style={styles.name}>{m.name}</Text>
          </Pressable>
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
  pill: {
    backgroundColor: colors.yellowBright,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  pillText: {color: colors.navy, fontWeight: '800', fontSize: 11},
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
  },
  sectionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
    marginTop: 8,
  },
  section: {fontWeight: '800', color: colors.navy},
  muted: {color: colors.muted, fontWeight: '600', fontSize: 12},
  emptyLine: {color: colors.muted, marginBottom: 10},
  row: {flexDirection: 'row', alignItems: 'center', gap: 8},
  name: {fontWeight: '800', color: colors.navy, fontSize: 14},
  price: {fontWeight: '800', color: colors.navy, fontSize: 15},
  modalTitle: {fontSize: 18, fontWeight: '800', color: colors.navy},
  marketRow: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 12,
  },
});

import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {useFocusEffect, useNavigation} from '@react-navigation/native';
import {ClipboardList, ScanLine, Store} from 'lucide-react-native';
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
import {FeatureEmptyGuide} from '@/ui/FeatureEmptyGuide';
import {colors, radii, space, spacing} from '@/ui/theme';
import {formatBrl} from '@/domain/money';
import {rankNearestMarkets} from '@/domain/marketUi';
import {TrustEngine} from '@/domain/trust';
import {
  type InsightPeriod,
  filterListsByMarketScope,
  filterLogsByMarketScope,
  monthsAgo,
  rankCategoryMarketWins,
  rankCheapestMarkets,
  resolveInsightMarketScope,
  savingsSince,
} from '@/domain/homeInsights';
import {
  filterMarketsInRadius,
  NEARBY_RADIUS_KM,
} from '@/data/remote/nearbyMarkets';
import {
  marketRepo,
  prefs,
  priceLogRepo,
  useAppStore,
  useMarketName,
} from '@/store/appStore';
import {syncApi, type ReputationRemote} from '@/data/remote/syncApi';
import type {FiscalLevel, PriceLog, Product} from '@/data/types';

const PERIODS: Array<{id: InsightPeriod; label: string}> = [
  {id: 'week', label: 'Semana'},
  {id: 'month', label: 'Mês'},
  {id: 'all', label: 'Tudo'},
];

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

function periodCaption(period: InsightPeriod): string {
  if (period === 'week') return 'últimos 7 dias';
  if (period === 'month') return 'último mês';
  return 'todo o histórico';
}

export function InsightsScreen() {
  const nav = useNavigation<any>();
  const lists = useAppStore(s => s.lists);
  const markets = useAppStore(s => s.markets);
  const products = useAppStore(s => s.products);
  const auth = useAppStore(s => s.auth);
  const currentMarketId = useAppStore(s => s.currentMarketId);
  const setCurrentMarket = useAppStore(s => s.setCurrentMarket);
  const refresh = useAppStore(s => s.refresh);
  const marketName = useMarketName(currentMarketId);
  const [query, setQuery] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [marketQuery, setMarketQuery] = useState('');
  const [rep, setRep] = useState<ReputationRemote | null>(null);
  const [period, setPeriod] = useState<InsightPeriod>('week');
  const [locTick, setLocTick] = useState(0);

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

  useFocusEffect(
    useCallback(() => {
      setLocTick(t => t + 1);
    }, []),
  );

  const origin = prefs.getLastLocation();
  const locPrefs = prefs.getLocationPrefs();

  const scope = useMemo(() => {
    const nearby = origin
      ? filterMarketsInRadius(markets, origin, NEARBY_RADIUS_KM)
      : [];
    return resolveInsightMarketScope({
      markets,
      favoriteMarketIds: locPrefs.favoriteMarketIds,
      nearbyMarketIds: nearby.map(m => m.id),
      radiusKm: NEARBY_RADIUS_KM,
    });
    // locTick força releitura de prefs/GPS
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markets, locTick, locPrefs.favoriteMarketIds.join(',')]);

  const scopeMarkets = useMemo(
    () => markets.filter(m => scope.marketIds.has(m.id)),
    [markets, scope],
  );

  const logs = useMemo(() => {
    const all = priceLogRepo.all();
    return filterLogsByMarketScope(all, scope.marketIds);
  }, [lists, markets, products, scope]);

  const scopedLists = useMemo(
    () => filterListsByMarketScope(lists, scope.marketIds),
    [lists, scope],
  );

  const marketRanks = useMemo(
    () => rankCheapestMarkets(logs, scopeMarkets, products, period),
    [logs, scopeMarkets, products, period],
  );
  const categoryWins = useMemo(
    () => rankCategoryMarketWins(logs, scopeMarkets, products, period),
    [logs, scopeMarkets, products, period],
  );
  const saved3m = useMemo(
    () => savingsSince(scopedLists, monthsAgo(3)),
    [scopedLists],
  );

  const cheap = useMemo(() => {
    const out: Array<{
      product: Product;
      log: PriceLog;
      marketName: string | null;
    }> = [];
    for (const p of products) {
      const plogs = logs.filter(l => l.productId === p.id);
      if (!plogs.length) continue;
      const best = plogs.reduce((a, b) =>
        a.retailPrice < b.retailPrice ? a : b,
      );
      out.push({
        product: p,
        log: best,
        marketName:
          scopeMarkets.find(m => m.id === best.marketId)?.name ?? null,
      });
    }
    return out
      .sort((a, b) => a.log.retailPrice - b.log.retailPrice)
      .slice(0, 40);
  }, [logs, products, scopeMarkets]);

  const opps = useMemo(() => priceLogRepo.opportunities(), [lists, markets]);
  const today = useMemo(() => {
    // Mercado atual do picker, se estiver no escopo; senão o 1º do escopo.
    const focusId =
      currentMarketId != null && scope.marketIds.has(currentMarketId)
        ? currentMarketId
        : [...scope.marketIds][0];
    return focusId != null ? priceLogRepo.forMarketToday(focusId) : [];
  }, [currentMarketId, lists, scope]);

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
  const listsF = scopedLists.filter(
    l => match(l.name) || match(l.marketName ?? ''),
  );
  const todayF = today.filter(i => match(i.productName));
  const alerts = cheapF.length + oppsF.length;

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
  data.push({type: 'period', key: 'period'});
  if (saved3m > 0) {
    data.push({
      type: 'savings',
      key: 'savings',
      payload: {amount: saved3m},
    });
  }
  const hasInsightBody =
    marketRanks.length > 0 ||
    categoryWins.length > 0 ||
    todayF.length > 0 ||
    cheapF.length > 0 ||
    oppsF.length > 0 ||
    listsF.length > 0;

  if (!hasInsightBody) {
    data.push({type: 'guide', key: 'empty-guide'});
  }

  if (marketRanks.length) {
    data.push({
      type: 'section',
      key: 'rank-h',
      payload: {
        title: 'Mercados mais baratos',
        trailing: periodCaption(period),
      },
    });
    marketRanks.slice(0, 8).forEach((r, i) =>
      data.push({
        type: 'market-rank',
        key: `mr-${r.marketId}`,
        payload: {...r, place: i + 1},
      }),
    );
  }
  if (categoryWins.length) {
    data.push({
      type: 'section',
      key: 'catwin-h',
      payload: {
        title: 'Melhor mercado por categoria',
        trailing: periodCaption(period),
      },
    });
    categoryWins.slice(0, 10).forEach(r =>
      data.push({
        type: 'cat-win',
        key: `cw-${r.category}`,
        payload: r,
      }),
    );
  }

  if (marketName && todayF.length) {
    data.push({
      type: 'section',
      key: 'today-h',
      payload: {title: 'Hoje neste mercado', trailing: String(todayF.length)},
    });
    todayF.forEach(i =>
      data.push({type: 'today', key: `t-${i.id}`, payload: i}),
    );
  }
  if (cheapF.length) {
    data.push({
      type: 'section',
      key: 'cheap-h',
      payload: {title: 'Preço mais baixo', trailing: `${cheapF.length} itens`},
    });
    cheapF.forEach(r =>
      data.push({type: 'cheap', key: `c-${r.product.id}`, payload: r}),
    );
  }
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
        data.push({
          type: 'cheap',
          key: `bc-${cat}-${r.product.id}`,
          payload: r,
        }),
      );
    }
  }
  if (oppsF.length) {
    data.push({
      type: 'section',
      key: 'opp-h',
      payload: {title: 'Acima da sua média', trailing: String(oppsF.length)},
    });
    oppsF.forEach(o =>
      data.push({type: 'opp', key: `o-${o.product.id}`, payload: o}),
    );
  }
  if (listsF.length) {
    data.push({
      type: 'section',
      key: 'list-h',
      payload: {
        title:
          scope.mode === 'favorites'
            ? 'Compras nos mercados marcados'
            : 'Compras no raio',
        trailing: String(listsF.length),
      },
    });
    listsF.forEach(l =>
      data.push({type: 'list', key: `l-${l.id}`, payload: l}),
    );
  }

  return (
    <View style={styles.root}>
      <AppScreenHeader
        showLogo={false}
        title="Insights"
        subtitle={marketName || scope.label}
        actions={
          <View style={{flexDirection: 'row'}}>
            <Pressable
              style={styles.iconBtn}
              onPress={() => nav.navigate('ShoppingLists')}>
              <ClipboardList color={colors.navy} size={20} />
            </Pressable>
            <Pressable
              style={styles.iconBtn}
              onPress={() => {
                setLocTick(t => t + 1);
                setPickerOpen(true);
              }}>
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
          {scope.mode === 'favorites'
            ? `Mostrando só mercados marcados na localização · ${scope.label}`
            : `Mercados a até ${NEARBY_RADIUS_KM} km · ${scope.label}`}
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
        contentContainerStyle={{
          padding: 16,
          paddingBottom: spacing.bottomNavClearance,
        }}
        renderItem={({item}) => {
          if (item.type === 'period') {
            return (
              <View style={styles.periodRow}>
                {PERIODS.map(p => {
                  const on = period === p.id;
                  return (
                    <Pressable
                      key={p.id}
                      style={[styles.periodChip, on && styles.periodChipOn]}
                      onPress={() => setPeriod(p.id)}>
                      <Text
                        style={[
                          styles.periodChipText,
                          on && styles.periodChipTextOn,
                        ]}>
                        {p.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            );
          }
          if (item.type === 'guide') {
            return (
              <FeatureEmptyGuide
                HeroIcon={Store}
                title="Nada para comparar por perto"
                subtitle={`Ainda não há preços validados neste período, num raio de ${NEARBY_RADIUS_KM} km. Quando a comunidade confirmar valores, os rankings aparecem aqui.`}
                stepsLabel="Como encher esta tela"
                steps={[
                  {
                    n: '1',
                    title: 'Capture no mercado',
                    text: 'Etiqueta ou NFC-e entram como preço da sua compra.',
                    Icon: ScanLine,
                  },
                  {
                    n: '2',
                    title: 'Confirme na Comunidade',
                    text: 'Preços suspeitos só entram no ranking depois do voto.',
                    Icon: Store,
                  },
                  {
                    n: '3',
                    title: 'Volte aos Insights',
                    text: 'Mercados mais baratos e categorias surgem com dados reais.',
                    Icon: ClipboardList,
                  },
                ]}
                PrimaryIcon={ScanLine}
                primaryLabel="Capturar preço"
                onPrimary={() => nav.navigate('Capture')}
                secondaryLabel="Ir para a Comunidade"
                onSecondary={() => nav.navigate('Community')}
              />
            );
          }
          if (item.type === 'savings') {
            return (
              <View style={styles.savingsBanner}>
                <Text style={styles.savingsBannerLabel}>
                  Economia nos últimos 3 meses
                </Text>
                <Text style={styles.savingsBannerValue}>
                  {formatBrl(item.payload.amount)}
                </Text>
              </View>
            );
          }
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
          if (item.type === 'market-rank') {
            const r = item.payload;
            return (
              <AppListCard>
                <View style={styles.row}>
                  <View style={styles.placeBadge}>
                    <Text style={styles.placeBadgeText}>{r.place}</Text>
                  </View>
                  <View style={{flex: 1}}>
                    <Text style={styles.name}>{r.marketName}</Text>
                    <Text style={styles.muted}>
                      {r.winCount} produto{r.winCount === 1 ? '' : 's'} mais
                      barato{r.winCount === 1 ? '' : 's'}
                      {r.topCategories?.length
                        ? ` · ${r.topCategories.join(', ')}`
                        : ''}
                    </Text>
                  </View>
                </View>
              </AppListCard>
            );
          }
          if (item.type === 'cat-win') {
            const r = item.payload;
            return (
              <AppListCard>
                <View style={styles.row}>
                  <View style={{flex: 1}}>
                    <Text style={styles.name}>{r.category}</Text>
                    <Text style={styles.muted}>
                      {r.marketName} · {r.winCount} vitória
                      {r.winCount === 1 ? '' : 's'}
                    </Text>
                  </View>
                </View>
              </AppListCard>
            );
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
    textAlign: 'center',
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
  periodRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
    justifyContent: 'center',
  },
  periodChip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    alignItems: 'center',
  },
  periodChipOn: {
    backgroundColor: colors.navy,
    borderColor: colors.navy,
  },
  periodChipText: {fontWeight: '800', fontSize: 13, color: colors.muted},
  periodChipTextOn: {color: colors.white},
  savingsBanner: {
    backgroundColor: '#DCFCE7',
    borderRadius: radii.lg,
    padding: space.md,
    alignItems: 'center',
    marginBottom: 8,
    gap: 2,
  },
  savingsBannerLabel: {
    fontWeight: '700',
    fontSize: 12,
    color: colors.trustGreen,
  },
  savingsBannerValue: {
    fontWeight: '900',
    fontSize: 24,
    color: colors.trustGreen,
  },
  sectionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    marginTop: 8,
  },
  section: {fontWeight: '800', color: colors.navy, fontSize: 15, flex: 1},
  catSectionRow: {marginTop: 4, marginLeft: 4},
  catSection: {fontSize: 13, fontWeight: '700', color: colors.muted},
  sectionPill: {
    backgroundColor: colors.yellowBright,
    borderRadius: radii.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginLeft: 8,
  },
  sectionPillText: {fontSize: 11, fontWeight: '800', color: colors.navy},
  muted: {color: colors.muted, fontWeight: '600', fontSize: 12},
  emptyLine: {
    color: colors.muted,
    marginBottom: 10,
    fontWeight: '600',
    lineHeight: 18,
  },
  row: {flexDirection: 'row', alignItems: 'center', gap: 8},
  placeBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.yellow,
    borderWidth: 1,
    borderColor: colors.navy,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeBadgeText: {fontWeight: '900', fontSize: 12, color: colors.navy},
  name: {fontWeight: '800', color: colors.navy, fontSize: 14},
  price: {fontWeight: '800', color: colors.navy, fontSize: 15},
  modalTitle: {fontSize: 18, fontWeight: '800', color: colors.navy},
});

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
import {ArrowLeft, History, ScanLine, TrendingDown} from 'lucide-react-native';
import {FeatureEmptyGuide} from '@/ui/FeatureEmptyGuide';
import {
  BackCircleButton,
  SavePill,
  SoftCard,
  SoftHeader,
} from '@/ui/screenChrome';
import {colors, radii, space, spacing} from '@/ui/theme';
import {formatBrl} from '@/domain/money';
import {priceLogRepo, useAppStore} from '@/store/appStore';

type Filter = 'all' | 'lowest' | 'above';

function pctAboveMin(last: number, min: number): number {
  if (min <= 0) return 0;
  return ((last - min) / min) * 100;
}

export function HistoryScreen() {
  const nav = useNavigation<any>();
  const products = useAppStore(s => s.products);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  const rows = useMemo(
    () =>
      products.map(p => {
        const stats = priceLogRepo.statsForProduct(p.id);
        const atLowest =
          stats != null && stats.lastPrice <= stats.minPrice * 1.001;
        const pct =
          stats && !atLowest ? pctAboveMin(stats.lastPrice, stats.minPrice) : 0;
        return {product: p, stats, atLowest, pct};
      }),
    [products],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter(r => {
      if (q && !r.product.name.toLowerCase().includes(q)) return false;
      if (filter === 'lowest') return r.atLowest && r.stats;
      if (filter === 'above') return r.stats && !r.atLowest;
      return true;
    });
  }, [rows, query, filter]);

  const chips: {key: Filter; label: string}[] = [
    {key: 'all', label: 'Todos'},
    {key: 'lowest', label: 'No menor preço'},
    {key: 'above', label: 'Acima do menor'},
  ];

  return (
    <View style={styles.root}>
      <SoftHeader
        title="Histórico"
        subtitle={`${products.length} produtos rastreados`}
        leading={
          <BackCircleButton onPress={() => nav.goBack()}>
            <ArrowLeft color={colors.navy} size={22} />
          </BackCircleButton>
        }
      />

      <View style={styles.searchWrap}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Buscar produto"
          placeholderTextColor={colors.muted}
          style={styles.search}
        />
      </View>

      <View style={styles.chips}>
        {chips.map(c => {
          const on = filter === c.key;
          return (
            <Pressable
              key={c.key}
              onPress={() => setFilter(c.key)}
              style={[styles.chip, on && styles.chipOn]}>
              <Text style={[styles.chipText, on && styles.chipTextOn]}>
                {c.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={r => String(r.product.id)}
        contentContainerStyle={[
          styles.list,
          filtered.length === 0 && styles.listEmpty,
        ]}
        ListEmptyComponent={
          <FeatureEmptyGuide
            HeroIcon={History}
            title="Nada no histórico ainda"
            subtitle="Aqui você acompanha evolução de preço dos produtos que já registrou."
            stepsLabel="O que é esta tela"
            steps={[
              {
                n: '1',
                title: 'Produtos com preço',
                text: 'Itens que você já capturou entram neste histórico.',
                Icon: History,
              },
              {
                n: '2',
                title: 'Último vs menor',
                text: 'Compare o preço atual com a mínima que você já viu.',
                Icon: TrendingDown,
              },
              {
                n: '3',
                title: 'Abra o detalhe',
                text: 'Toque em um produto para ver a linha do tempo de preços.',
                Icon: ScanLine,
              },
            ]}
            PrimaryIcon={ScanLine}
            primaryLabel="Registrar um preço"
            onPrimary={() => nav.navigate('Main', {screen: 'Capture'})}
            secondaryLabel="Ir para Compras"
            onSecondary={() => nav.navigate('Main', {screen: 'Lists'})}
          />
        }
        renderItem={({item}) => {
          const {product, stats, atLowest, pct} = item;
          return (
            <SoftCard
              onPress={() =>
                nav.navigate('ProductDetail', {productId: product.id})
              }
              style={styles.productCard}>
              <View style={styles.row}>
                <View style={{flex: 1, minWidth: 0}}>
                  <Text style={styles.name} numberOfLines={2}>
                    {product.name}
                  </Text>
                  {stats ? (
                    <Text style={styles.muted}>
                      Menor já visto {formatBrl(stats.minPrice)}
                    </Text>
                  ) : (
                    <Text style={styles.muted}>Sem registros</Text>
                  )}
                </View>
                <View style={styles.rightCol}>
                  {stats ? (
                    <Text style={styles.price}>
                      {formatBrl(stats.lastPrice)}
                    </Text>
                  ) : null}
                  {stats && atLowest ? (
                    <SavePill label="Menor preço" />
                  ) : stats && pct > 0 ? (
                    <SavePill
                      label={`+${pct >= 10 ? Math.round(pct) : pct.toFixed(1).replace('.', ',')}%`}
                      tone="orange"
                    />
                  ) : null}
                </View>
              </View>
            </SoftCard>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: colors.bg},
  searchWrap: {paddingHorizontal: space.md, marginBottom: space.sm},
  search: {
    height: 48,
    backgroundColor: colors.white,
    borderRadius: radii.pill,
    paddingHorizontal: space.md,
    fontSize: 15,
    fontWeight: '600',
    color: colors.ink,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: space.md,
    marginBottom: space.sm,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radii.pill,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipOn: {
    backgroundColor: colors.yellow,
    borderColor: colors.yellow,
  },
  chipText: {fontWeight: '800', color: colors.navy, fontSize: 13},
  chipTextOn: {color: colors.navy},
  list: {paddingHorizontal: space.md, paddingBottom: 40, gap: space.sm},
  listEmpty: {
    flexGrow: 1,
    paddingBottom: spacing.bottomNavClearance,
  },
  productCard: {marginBottom: space.sm},
  row: {flexDirection: 'row', alignItems: 'flex-start', gap: 10},
  name: {fontWeight: '900', color: colors.navy, fontSize: 15},
  muted: {color: colors.muted, marginTop: 4, fontWeight: '600', fontSize: 12},
  rightCol: {alignItems: 'flex-end', gap: 6},
  price: {fontWeight: '900', color: colors.navy, fontSize: 18},
});

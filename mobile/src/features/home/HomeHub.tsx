import React, {useMemo, useState} from 'react';
import {Pressable, StyleSheet, Text, TextInput, View} from 'react-native';
import {
  ClipboardList,
  History,
  MapPin,
  QrCode,
  ShoppingCart,
  UsersRound,
} from 'lucide-react-native';
import {colors, radii, space} from '@/ui/theme';
import type {CheaperCategory} from '@/domain/purchaseInsights';
import {HomeCheaperChart} from '@/features/home/HomeCheaperChart';

type Shortcut = {
  label: string;
  Icon: typeof MapPin;
  onPress: () => void;
};

export function HomeHub({
  savedLabel,
  savedValue,
  spentLabel,
  purchaseCount,
  onOpenInsights,
  shortcuts,
  cheaper,
  markets,
  onOpenMarket,
}: {
  savedLabel: string;
  savedValue: string;
  spentLabel: string;
  purchaseCount: number;
  onOpenInsights: () => void;
  shortcuts: Shortcut[];
  cheaper: CheaperCategory[];
  markets: {id: string; name: string; detail: string}[];
  onOpenMarket: () => void;
}) {
  const [query, setQuery] = useState('');
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q
      ? markets.filter(m => m.name.toLowerCase().includes(q))
      : markets;
    return base.slice(0, 4);
  }, [markets, query]);

  return (
    <View style={styles.wrap}>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Buscar mercado"
        placeholderTextColor={colors.muted}
        style={styles.search}
      />

      <Pressable style={styles.hero} onPress={onOpenInsights}>
        <Text style={styles.heroKicker}>Economia em 30 dias</Text>
        <Text style={styles.heroValue}>{savedValue}</Text>
        <Text style={styles.heroText}>{savedLabel}</Text>
        <View style={styles.heroStats}>
          <View style={styles.heroStat}>
            <Text style={styles.heroStatLabel}>Gasto</Text>
            <Text style={styles.heroStatValue}>{spentLabel}</Text>
          </View>
          <View style={styles.heroStat}>
            <Text style={styles.heroStatLabel}>Compras</Text>
            <Text style={styles.heroStatValue}>{purchaseCount}</Text>
          </View>
        </View>
      </Pressable>

      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>Atalhos</Text>
      </View>
      <View style={styles.grid}>
        {shortcuts.map(s => (
          <Pressable key={s.label} style={styles.tile} onPress={s.onPress}>
            <View style={styles.tileIcon}>
              <s.Icon size={20} color={colors.navy} />
            </View>
            <Text style={styles.tileLabel} numberOfLines={2}>
              {s.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <HomeCheaperChart items={cheaper} />

      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>Perto de você</Text>
        <Pressable onPress={onOpenMarket} hitSlop={8}>
          <Text style={styles.link}>Ver mapa</Text>
        </Pressable>
      </View>
      <View style={styles.recoRow}>
        {shown.length === 0 ? (
          <Text style={styles.empty}>
            {query.trim()
              ? 'Nenhum mercado com esse nome.'
              : 'Nenhum mercado perto de você ainda.'}
          </Text>
        ) : (
          shown.map(m => (
            <Pressable key={m.id} style={styles.reco} onPress={onOpenMarket}>
              <View style={styles.recoIcon}>
                <MapPin size={16} color={colors.navy} />
              </View>
              <Text style={styles.recoName} numberOfLines={2}>
                {m.name}
              </Text>
              <Text style={styles.recoDetail} numberOfLines={1}>
                {m.detail}
              </Text>
            </Pressable>
          ))
        )}
      </View>
    </View>
  );
}

export const homeShortcutIcons = {
  map: MapPin,
  lists: ShoppingCart,
  note: QrCode,
  insights: ClipboardList,
  history: History,
  community: UsersRound,
};

const styles = StyleSheet.create({
  wrap: {paddingBottom: space.sm},
  search: {
    marginHorizontal: space.md,
    backgroundColor: colors.white,
    borderRadius: radii.pill,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontWeight: '600',
    color: colors.ink,
    marginBottom: space.md,
  },
  hero: {
    marginHorizontal: space.md,
    backgroundColor: colors.navy,
    borderRadius: 24,
    padding: space.lg,
    gap: 8,
  },
  heroKicker: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.4,
    color: colors.yellow,
  },
  heroValue: {fontSize: 32, fontWeight: '900', color: colors.white},
  heroText: {
    color: 'rgba(255,255,255,0.88)',
    fontWeight: '600',
    lineHeight: 20,
  },
  heroStats: {flexDirection: 'row', gap: 16, marginTop: 8},
  heroStat: {gap: 2},
  heroStatLabel: {fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.7)'},
  heroStatValue: {fontSize: 16, fontWeight: '900', color: colors.white},
  sectionHead: {
    marginTop: space.lg,
    marginBottom: space.sm,
    marginHorizontal: space.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {fontSize: 18, fontWeight: '900', color: colors.navy},
  link: {fontWeight: '800', color: colors.navy},
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: space.sm,
  },
  tile: {width: '25%', alignItems: 'center', gap: 6, marginBottom: 12},
  tileIcon: {
    width: 52,
    height: 52,
    borderRadius: 18,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.navy,
    textAlign: 'center',
  },
  recoRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    paddingHorizontal: space.md,
  },
  reco: {
    width: '47%',
    backgroundColor: colors.white,
    borderRadius: 20,
    padding: 12,
    gap: 6,
  },
  recoIcon: {
    width: 32,
    height: 32,
    borderRadius: 12,
    backgroundColor: colors.yellow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recoName: {fontWeight: '900', color: colors.navy, fontSize: 14},
  recoDetail: {color: colors.muted, fontWeight: '600', fontSize: 12},
  empty: {
    color: colors.muted,
    fontWeight: '600',
    marginHorizontal: space.xs,
  },
});

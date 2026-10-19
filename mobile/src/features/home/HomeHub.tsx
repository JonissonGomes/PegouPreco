import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {
  Bell,
  History,
  Lightbulb,
  MapPin,
  QrCode,
  ShoppingCart,
  Store,
  UsersRound,
} from 'lucide-react-native';
import {colors, space} from '@/ui/theme';

type Shortcut = {
  label: string;
  Icon: typeof MapPin;
  onPress: () => void;
};

export function HomeHub({shortcuts}: {shortcuts: Shortcut[]}) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.sectionTitle}>Atalhos</Text>
      <View style={styles.grid}>
        {shortcuts.map(item => (
          <Pressable key={item.label} style={styles.tile} onPress={item.onPress}>
            <View style={styles.tileIcon}>
              <item.Icon size={20} color={colors.navy} />
            </View>
            <Text style={styles.tileLabel} numberOfLines={2}>
              {item.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

export const homeShortcutIcons = {
  map: MapPin,
  lists: ShoppingCart,
  note: QrCode,
  insights: Lightbulb,
  history: History,
  community: UsersRound,
  cheaper: Store,
  alerts: Bell,
};

const styles = StyleSheet.create({
  wrap: {paddingBottom: space.sm},
  sectionTitle: {
    marginTop: space.md,
    marginBottom: space.sm,
    marginHorizontal: space.md,
    fontSize: 18,
    fontWeight: '900',
    color: colors.navy,
  },
  grid: {flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: space.sm},
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
});

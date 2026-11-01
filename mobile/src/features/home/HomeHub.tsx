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
import {colors, radii, space} from '@/ui/theme';
import {PressableScale} from '@/ui/PressableScale';

type Shortcut = {
  label: string;
  Icon: typeof MapPin;
  onPress: () => void;
};

export function HomeHub({shortcuts}: {shortcuts: Shortcut[]}) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.sectionTitle}>Atalhos rápidos</Text>
      <View style={styles.grid}>
        {shortcuts.map(item => (
          <PressableScale
            key={item.label}
            style={styles.tile}
            onPress={item.onPress}
            activeScale={0.92}>
            <View style={styles.tileIcon}>
              <item.Icon size={22} color={colors.navy} strokeWidth={2.2} />
            </View>
            <Text style={styles.tileLabel} numberOfLines={2}>
              {item.label}
            </Text>
          </PressableScale>
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
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: space.sm,
    justifyContent: 'flex-start',
  },
  tile: {
    width: '25%',
    alignItems: 'center',
    marginBottom: 14,
  },
  tileIcon: {
    width: 52,
    height: 52,
    borderRadius: 18,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#091E42',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: {width: 0, height: 3},
    elevation: 3,
    borderWidth: 1,
    borderColor: 'rgba(235, 240, 248, 0.8)',
    marginBottom: 6,
  },
  tileLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.navy,
    textAlign: 'center',
    lineHeight: 14,
    paddingHorizontal: 2,
  },
});

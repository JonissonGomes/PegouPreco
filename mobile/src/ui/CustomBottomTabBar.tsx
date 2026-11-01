import React, {useEffect, useRef} from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type {BottomTabBarProps} from '@react-navigation/bottom-tabs';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {
  History,
  Home,
  Lightbulb,
  ShoppingCart,
  UserRound,
} from 'lucide-react-native';
import {colors} from '@/ui/theme';

const TAB_ICONS: Record<string, any> = {
  Lists: ShoppingCart,
  History: History,
  Home: Home,
  Insights: Lightbulb,
  Profile: UserRound,
};

const TAB_LABELS: Record<string, string> = {
  Lists: 'Compras',
  History: 'Histórico',
  Home: 'Início',
  Insights: 'Dicas',
  Profile: 'Perfil',
};

export function CustomBottomTabBar({state, descriptors, navigation, visible}: BottomTabBarProps & {visible: boolean}) {
  const insets = useSafeAreaInsets();
  const floatBottom = Math.max(insets.bottom, 12);

  // Filtrar apenas as rotas que devem aparecer no menu principal
  const visibleRoutes = state.routes.filter(r => ['Lists', 'History', 'Home', 'Insights', 'Profile'].includes(r.name));

  return (
    <View
      pointerEvents={visible ? 'auto' : 'none'}
      style={[
        styles.container,
        {
          bottom: visible ? floatBottom : -120,
          opacity: visible ? 1 : 0,
        },
      ]}>
      <View style={styles.tabBar}>
        {visibleRoutes.map((route, index) => {
          const isFocused = state.index === state.routes.findIndex(r => r.name === route.name);
          const isHome = route.name === 'Home';

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });

            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };

          const onLongPress = () => {
            navigation.emit({
              type: 'tabLongPress',
              target: route.key,
            });
          };

          const IconComponent = TAB_ICONS[route.name] || Home;
          const label = TAB_LABELS[route.name] || route.name;

          return (
            <TabItem
              key={route.key}
              label={label}
              isFocused={isFocused}
              isHome={isHome}
              IconComponent={IconComponent}
              onPress={onPress}
              onLongPress={onLongPress}
            />
          );
        })}
      </View>
    </View>
  );
}

function TabItem({
  label,
  isFocused,
  isHome,
  IconComponent,
  onPress,
  onLongPress,
}: {
  label: string;
  isFocused: boolean;
  isHome: boolean;
  IconComponent: any;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const bounceAnim = useRef(new Animated.Value(isFocused ? 1 : 0)).current;

  useEffect(() => {
    Animated.spring(bounceAnim, {
      toValue: isFocused ? 1 : 0,
      useNativeDriver: true,
      speed: 18,
      bounciness: 8,
    }).start();
  }, [isFocused, bounceAnim]);

  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.88,
      useNativeDriver: true,
      speed: 35,
      bounciness: 4,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      speed: 25,
      bounciness: 6,
    }).start();
  };

  if (isHome) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityState={isFocused ? {selected: true} : {}}
        onPress={onPress}
        onLongPress={onLongPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={styles.homeItemContainer}>
        <Animated.View
          style={[
            styles.homeFab,
            {
              transform: [{scale: scaleAnim}],
            },
          ]}>
          <IconComponent size={24} color={colors.navy} />
        </Animated.View>
        <Text style={[styles.label, isFocused && styles.labelActive]}>
          {label}
        </Text>
      </Pressable>
    );
  }

  const iconTranslate = bounceAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -2],
  });

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={isFocused ? {selected: true} : {}}
      onPress={onPress}
      onLongPress={onLongPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={styles.tabItem}>
      <Animated.View
        style={[
          styles.iconWrap,
          isFocused && styles.iconWrapActive,
          {
            transform: [{scale: scaleAnim}, {translateY: iconTranslate}],
          },
        ]}>
        <IconComponent
          size={20}
          color={isFocused ? colors.navy : colors.muted}
          strokeWidth={isFocused ? 2.6 : 2}
        />
      </Animated.View>
      <Text
        style={[
          styles.label,
          isFocused ? styles.labelActive : styles.labelInactive,
        ]}
        numberOfLines={1}>
        {label}
      </Text>
      {isFocused ? (
        <Animated.View
          style={[
            styles.activeIndicator,
            {
              transform: [{scaleX: bounceAnim}],
            },
          ]}
        />
      ) : (
        <View style={styles.indicatorPlaceholder} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 999,
  },
  tabBar: {
    flexDirection: 'row',
    height: 68,
    borderRadius: 34,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 8,
    shadowColor: '#071A42',
    shadowOpacity: 0.14,
    shadowRadius: 18,
    shadowOffset: {width: 0, height: 6},
    elevation: 12,
    borderWidth: 1,
    borderColor: 'rgba(230, 235, 245, 0.9)',
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
    minHeight: 52,
  },
  iconWrap: {
    width: 38,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapActive: {
    backgroundColor: '#F3F6FD',
  },
  label: {
    fontSize: 10,
    fontWeight: '700',
    marginTop: 2,
  },
  labelActive: {
    color: colors.navy,
    fontWeight: '900',
  },
  labelInactive: {
    color: colors.muted,
  },
  activeIndicator: {
    width: 14,
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.yellow,
    marginTop: 3,
  },
  indicatorPlaceholder: {
    height: 3,
    marginTop: 3,
  },
  homeItemContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -16,
  },
  homeFab: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.yellowBright,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#F59E0B',
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: {width: 0, height: 4},
    elevation: 6,
    borderWidth: 3,
    borderColor: '#ffffff',
  },
});

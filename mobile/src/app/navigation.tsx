import React from 'react';
import {ActivityIndicator, StyleSheet, Text, View} from 'react-native';
import {NavigationContainer} from '@react-navigation/native';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {
  ChartNoAxesColumnIncreasing,
  Map as MapIcon,
  ScanLine,
  ShoppingCart,
  UserRound,
} from 'lucide-react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {CartScreen} from '@/features/cart/CartScreen';
import {ShoppingListsScreen} from '@/features/cart/ShoppingListsScreen';
import {MapScreen} from '@/features/map/MapScreen';
import {CaptureScreen} from '@/features/capture/CaptureScreen';
import {InsightsScreen} from '@/features/insights/InsightsScreen';
import {ProductDetailScreen} from '@/features/insights/ProductDetailScreen';
import {ProfileScreen} from '@/features/profile/ProfileScreen';
import {HistoryScreen} from '@/features/history/HistoryScreen';
import {OnboardingScreen} from '@/features/onboarding/OnboardingScreen';
import {BrandLogo} from '@/ui/chrome';
import {colors, spacing} from '@/ui/theme';
import {useAppStore} from '@/store/appStore';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

function Tabs() {
  const insets = useSafeAreaInsets();
  const visible = useAppStore(s => s.bottomNavVisible);
  const bottom = visible ? 0 : -140;

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          position: 'absolute',
          left: 0,
          right: 0,
          bottom,
          height: spacing.bottomBarHeight + Math.max(insets.bottom, 0),
          paddingBottom: Math.max(insets.bottom, 8),
          paddingTop: 10,
          backgroundColor: '#fff',
          borderTopWidth: 1,
          borderTopColor: colors.border,
          elevation: 0,
          opacity: visible ? 1 : 0,
        },
        tabBarActiveTintColor: colors.navy,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: {fontSize: 10, fontWeight: '700'},
        tabBarItemStyle: {paddingTop: 2},
      }}>
      <Tab.Screen
        name="Cart"
        component={CartScreen}
        options={{
          title: 'Carrinho',
          tabBarIcon: ({color}) => <ShoppingCart size={20} color={color} />,
        }}
      />
      <Tab.Screen
        name="Map"
        component={MapScreen}
        options={{
          title: 'Mapa',
          tabBarIcon: ({color}) => <MapIcon size={20} color={color} />,
        }}
      />
      <Tab.Screen
        name="Capture"
        component={CaptureScreen}
        options={{
          title: '',
          tabBarIcon: () => (
            <View style={styles.scanFab}>
              <ScanLine size={28} color={colors.navy} />
            </View>
          ),
        }}
      />
      <Tab.Screen
        name="Insights"
        component={InsightsScreen}
        options={{
          title: 'Insights',
          tabBarIcon: ({color}) => (
            <ChartNoAxesColumnIncreasing size={20} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          title: 'Perfil',
          tabBarIcon: ({color}) => <UserRound size={20} color={color} />,
        }}
      />
    </Tab.Navigator>
  );
}

export function RootNavigation() {
  const ready = useAppStore(s => s.ready);
  const bootStatus = useAppStore(s => s.bootStatus);
  const onboardingDone = useAppStore(s => s.onboardingDone);

  if (!ready) {
    return (
      <View style={styles.boot}>
        <BrandLogo size={72} />
        <Text style={styles.bootText}>PegouPreço</Text>
        <ActivityIndicator color={colors.navy} style={{marginTop: 20}} />
        <Text style={styles.bootHint}>{bootStatus}</Text>
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{headerShown: false}}>
        {!onboardingDone ? (
          <Stack.Screen name="Onboarding" component={OnboardingScreen} />
        ) : (
          <>
            <Stack.Screen name="Home" component={Tabs} />
            <Stack.Screen name="ShoppingLists" component={ShoppingListsScreen} />
            <Stack.Screen name="History" component={HistoryScreen} />
            <Stack.Screen name="ProductDetail" component={ProductDetailScreen} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  scanFab: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.yellowBright,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
    borderWidth: 4,
    borderColor: '#fff',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 10,
    shadowOffset: {width: 0, height: 4},
    elevation: 6,
  },
  boot: {
    flex: 1,
    backgroundColor: colors.yellowBright,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  bootText: {
    marginTop: 14,
    fontSize: 28,
    fontWeight: '900',
    color: colors.navy,
  },
  bootHint: {
    marginTop: 12,
    fontSize: 13,
    fontWeight: '600',
    color: colors.navy,
    opacity: 0.75,
    textAlign: 'center',
  },
});

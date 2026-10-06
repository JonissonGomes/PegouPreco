import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {NavigationContainer} from '@react-navigation/native';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {
  LineChart,
  Map as MapIcon,
  ScanLine,
  ShoppingCart,
  User,
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
import {colors, spacing} from '@/ui/theme';
import {useAppStore} from '@/store/appStore';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

function Tabs() {
  const insets = useSafeAreaInsets();
  const visible = useAppStore(s => s.bottomNavVisible);

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          position: 'absolute',
          left: 12,
          right: 12,
          bottom: visible ? Math.max(insets.bottom, 10) : -120,
          height: spacing.bottomBarHeight,
          borderRadius: 28,
          backgroundColor: 'rgba(255,255,255,0.95)',
          borderTopWidth: 0,
          elevation: 8,
          opacity: visible ? 1 : 0,
        },
        tabBarActiveTintColor: colors.navy,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: {fontSize: 10, fontWeight: '700'},
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
              <ScanLine size={24} color={colors.navy} />
            </View>
          ),
        }}
      />
      <Tab.Screen
        name="Insights"
        component={InsightsScreen}
        options={{
          title: 'Comparar',
          tabBarIcon: ({color}) => <LineChart size={20} color={color} />,
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          title: 'Perfil',
          tabBarIcon: ({color}) => <User size={20} color={color} />,
        }}
      />
    </Tab.Navigator>
  );
}

export function RootNavigation() {
  const ready = useAppStore(s => s.ready);
  const onboardingDone = useAppStore(s => s.onboardingDone);

  if (!ready) {
    return (
      <View style={styles.boot}>
        <Text style={styles.bootText}>PegouPreço</Text>
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
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.yellowBright,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  boot: {
    flex: 1,
    backgroundColor: colors.yellowBright,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bootText: {fontSize: 28, fontWeight: '900', color: colors.navy},
});

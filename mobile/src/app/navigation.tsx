import React, {useEffect} from 'react';
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  Text,
  UIManager,
  View,
} from 'react-native';
import {NavigationContainer} from '@react-navigation/native';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {
  Lightbulb,
  History,
  Home,
  ShoppingCart,
  UserRound,
} from 'lucide-react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {HomeScreen} from '@/features/home/HomeScreen';
import {HomeSpendScreen} from '@/features/home/HomeSpendScreen';
import {CartScreen} from '@/features/cart/CartScreen';
import {ShoppingListsScreen} from '@/features/cart/ShoppingListsScreen';
import {ImportPurchaseScreen} from '@/features/cart/ImportPurchaseScreen';
import {MapScreen} from '@/features/map/MapScreen';
import {CaptureScreen} from '@/features/capture/CaptureScreen';
import {CommunityScreen} from '@/features/community/CommunityScreen';
import {InsightsScreen} from '@/features/insights/InsightsScreen';
import {ProductDetailScreen} from '@/features/insights/ProductDetailScreen';
import {ProfileScreen} from '@/features/profile/ProfileScreen';
import {AdminMarketsScreen} from '@/features/admin/AdminMarketsScreen';
import {HistoryScreen} from '@/features/history/HistoryScreen';
import {OnboardingScreen} from '@/features/onboarding/OnboardingScreen';
import {BrandLogo} from '@/ui/chrome';
import {animateLayout, motion} from '@/ui/motion';
import {colors} from '@/ui/theme';
import {useAppStore} from '@/store/appStore';

if (
  Platform.OS === 'android' &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

function Tabs() {
  const insets = useSafeAreaInsets();
  const visible = useAppStore(s => s.bottomNavVisible);
  const floatBottom = Math.max(insets.bottom, 10);
  const bottom = visible ? floatBottom : -180;

  useEffect(() => {
    animateLayout();
  }, [visible]);

  return (
    <Tab.Navigator
      initialRouteName="Home"
      screenOptions={{
        headerShown: false,
        tabBarHideOnKeyboard: true,
        tabBarStyle: {
          position: 'absolute',
          left: 16,
          right: 16,
          bottom,
          height: 68,
          paddingBottom: 8,
          paddingTop: 6,
          borderRadius: 34,
          backgroundColor: '#fff',
          borderTopWidth: 0,
          shadowColor: '#0B2A6B',
          shadowOpacity: 0.12,
          shadowRadius: 16,
          shadowOffset: {width: 0, height: 6},
          elevation: 10,
          opacity: visible ? 1 : 0,
        },
        tabBarActiveTintColor: colors.navy,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: {fontSize: 10, fontWeight: '700', marginTop: 2},
        tabBarItemStyle: {borderRadius: 28, paddingTop: 2},
      }}>
      <Tab.Screen
        name="Lists"
        component={CartScreen}
        options={{
          title: 'Compras',
          tabBarIcon: ({color}) => <ShoppingCart size={20} color={color} />,
        }}
      />
      <Tab.Screen
        name="History"
        component={HistoryScreen}
        options={{
          title: 'Histórico',
          tabBarIcon: ({color}) => <History size={20} color={color} />,
        }}
      />
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          title: 'Início',
          tabBarIcon: () => (
            <View style={styles.homeFab}>
              <Home size={26} color={colors.navy} />
            </View>
          ),
        }}
      />
      <Tab.Screen
        name="Insights"
        component={InsightsScreen}
        options={{
          title: 'Dicas',
          tabBarIcon: ({color}) => <Lightbulb size={20} color={color} />,
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
      {/* Mantém a tab bar visível; sem slot no layout da barra. */}
      <Tab.Screen
        name="Map"
        component={MapScreen}
        options={{
          title: 'Mapa',
          tabBarButton: () => null,
          tabBarItemStyle: {display: 'none'},
        }}
      />
      <Tab.Screen
        name="Community"
        component={CommunityScreen}
        options={{
          title: 'Comunidade',
          tabBarButton: () => null,
          tabBarItemStyle: {display: 'none'},
        }}
      />
      <Tab.Screen
        name="Capture"
        component={CaptureScreen}
        options={{
          title: 'Captura',
          tabBarButton: () => null,
          tabBarItemStyle: {display: 'none'},
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
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          animation: 'slide_from_right',
          animationDuration: motion.open,
          contentStyle: {backgroundColor: colors.bg},
        }}>
        {!onboardingDone ? (
          <Stack.Screen name="Onboarding" component={OnboardingScreen} />
        ) : (
          <>
            <Stack.Screen name="Main" component={Tabs} />
            <Stack.Screen name="HomeSpend" component={HomeSpendScreen} />
            <Stack.Screen name="ShoppingLists" component={ShoppingListsScreen} />
            <Stack.Screen name="ImportPurchase" component={ImportPurchaseScreen} />
            <Stack.Screen name="ProductDetail" component={ProductDetailScreen} />
            <Stack.Screen name="AdminMarkets" component={AdminMarketsScreen} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  homeFab: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.yellowBright,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
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

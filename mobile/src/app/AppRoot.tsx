import React, {useEffect} from 'react';
import {StatusBar} from 'react-native';
import {GestureHandlerRootView} from 'react-native-gesture-handler';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {RootNavigation} from './navigation';
import {useAppStore} from '@/store/appStore';
import {AppDialogHost} from '@/ui/appDialog';
import {colors} from '@/ui/theme';

export function AppRoot() {
  const bootstrap = useAppStore(s => s.bootstrap);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  return (
    <GestureHandlerRootView style={{flex: 1}}>
      <SafeAreaProvider>
        <StatusBar barStyle="dark-content" backgroundColor={colors.yellowBright} />
        <RootNavigation />
        <AppDialogHost />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

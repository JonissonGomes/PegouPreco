import React from 'react';
import {SafeAreaView, StyleSheet, Text, View} from 'react-native';
import {AppButton, BrandLogo} from '@/ui/chrome';
import {colors} from '@/ui/theme';
import {useAppStore} from '@/store/appStore';

export function OnboardingScreen() {
  const complete = useAppStore(s => s.completeOnboarding);
  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.hero}>
        <BrandLogo size={88} />
        <Text style={styles.brand}>PegouPreço</Text>
        <Text style={styles.lead}>
          Capture etiquetas, compare preços e finalize suas listas — offline
          first.
        </Text>
      </View>
      <AppButton label="Começar" onPress={complete} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.yellowBright,
    padding: 24,
    justifyContent: 'space-between',
  },
  hero: {marginTop: 64},
  brand: {
    marginTop: 18,
    fontSize: 36,
    fontWeight: '900',
    color: colors.navy,
    letterSpacing: -0.5,
  },
  lead: {
    marginTop: 12,
    fontSize: 16,
    fontWeight: '600',
    color: colors.navy,
    lineHeight: 22,
  },
});

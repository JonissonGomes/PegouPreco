import React from 'react';
import {ActivityIndicator, Modal, StyleSheet, Text, View} from 'react-native';
import {create} from 'zustand';
import {colors, radii} from '@/ui/theme';

type LoadingState = {
  visible: boolean;
  message: string;
  show: (message?: string) => void;
  hide: () => void;
};

export const useAppLoading = create<LoadingState>(set => ({
  visible: false,
  message: 'Processando…',
  show: (message = 'Processando…') => set({visible: true, message}),
  hide: () => set({visible: false}),
}));

/**
 * Função utilitária global para exibir loading em requisições
 */
export function showAppLoading(message?: string) {
  useAppLoading.getState().show(message);
}

export function hideAppLoading() {
  useAppLoading.getState().hide();
}

/**
 * Host de Loading em Overlay global elegante
 */
export function AppLoadingHost() {
  const visible = useAppLoading(s => s.visible);
  const message = useAppLoading(s => s.message);

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <ActivityIndicator size="large" color={colors.navy} />
          <Text style={styles.message} numberOfLines={2}>
            {message}
          </Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: radii.xl,
    paddingHorizontal: 28,
    paddingVertical: 22,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    minWidth: 160,
    maxWidth: '80%',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 16,
    shadowOffset: {width: 0, height: 6},
    elevation: 8,
  },
  message: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.navy,
    textAlign: 'center',
  },
});

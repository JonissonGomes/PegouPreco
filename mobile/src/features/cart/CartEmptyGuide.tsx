import React from 'react';
import {ScrollView, StyleSheet, Text, View} from 'react-native';
import {
  ClipboardList,
  ScanLine,
  Store,
  CheckCircle2,
} from 'lucide-react-native';
import {AppButton} from '@/ui/chrome';
import {colors, radii, space, spacing} from '@/ui/theme';

type Props = {
  hasActiveList: boolean;
  onStartScan: () => void;
  onOpenSavedLists?: () => void;
};

const STEPS_NO_LIST = [
  {
    n: '1',
    title: 'Crie a lista',
    text: 'Informe o nome e confirme o mercado onde você está.',
    Icon: ClipboardList,
  },
  {
    n: '2',
    title: 'Confirme o mercado',
    text: 'Usamos o GPS para sugerir o supermercado mais próximo.',
    Icon: Store,
  },
  {
    n: '3',
    title: 'Comece a escanear',
    text: 'Aponte a câmera para a etiqueta e os itens entram na lista.',
    Icon: ScanLine,
  },
];

const STEPS_ACTIVE = [
  {
    n: '1',
    title: 'Aponte para a etiqueta',
    text: 'Enquadre o preço na câmera — o app lê produto e valor.',
    Icon: ScanLine,
  },
  {
    n: '2',
    title: 'Confirme o item',
    text: 'Ajuste nome ou preço se precisar e salve no carrinho.',
    Icon: CheckCircle2,
  },
  {
    n: '3',
    title: 'Compare depois',
    text: 'Com a lista montada, veja onde a compra sai mais barata.',
    Icon: Store,
  },
];

export function CartEmptyGuide({
  hasActiveList,
  onStartScan,
  onOpenSavedLists,
}: Props) {
  const steps = hasActiveList ? STEPS_ACTIVE : STEPS_NO_LIST;

  return (
    <ScrollView
      contentContainerStyle={styles.pad}
      showsVerticalScrollIndicator={false}>
      <View style={styles.hero}>
        <View style={styles.heroIcon}>
          <ScanLine size={28} color={colors.navy} />
        </View>
        <Text style={styles.title}>
          {hasActiveList ? 'Carrinho vazio' : 'Monte sua lista no mercado'}
        </Text>
        <Text style={styles.sub}>
          {hasActiveList
            ? 'Escaneie etiquetas para adicionar itens e acompanhar o total.'
            : 'Em poucos passos você cria a lista e começa a capturar preços.'}
        </Text>
      </View>

      <Text style={styles.stepsLabel}>Passo a passo</Text>
      {steps.map(s => (
        <View key={s.n} style={styles.step}>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{s.n}</Text>
          </View>
          <View style={styles.stepIcon}>
            <s.Icon size={18} color={colors.navy} />
          </View>
          <View style={{flex: 1}}>
            <Text style={styles.stepTitle}>{s.title}</Text>
            <Text style={styles.stepText}>{s.text}</Text>
          </View>
        </View>
      ))}

      <AppButton
        icon={<ScanLine size={20} color="#fff" />}
        label={
          hasActiveList ? 'Começar a escanear' : 'Começar · criar lista e escanear'
        }
        onPress={onStartScan}
      />
      {!hasActiveList && onOpenSavedLists ? (
        <AppButton
          outlined
          label="Ver listas salvas"
          onPress={onOpenSavedLists}
        />
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  pad: {
    padding: space.md,
    paddingBottom: spacing.bottomNavClearance,
    gap: 10,
  },
  hero: {
    backgroundColor: colors.navy,
    borderRadius: radii.xl,
    padding: space.lg,
    gap: 8,
    marginBottom: space.sm,
  },
  heroIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: colors.yellow,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  title: {
    fontSize: 22,
    fontWeight: '900',
    color: colors.white,
    letterSpacing: -0.3,
  },
  sub: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.88)',
    lineHeight: 20,
  },
  stepsLabel: {
    marginTop: space.xs,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.5,
    color: colors.muted,
    textTransform: 'uppercase',
  },
  step: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    padding: space.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  badge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.navy,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {color: colors.white, fontWeight: '900', fontSize: 12},
  stepIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.yellow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepTitle: {fontWeight: '900', color: colors.navy, fontSize: 14},
  stepText: {
    marginTop: 2,
    fontWeight: '600',
    color: colors.muted,
    fontSize: 12,
    lineHeight: 16,
  },
});

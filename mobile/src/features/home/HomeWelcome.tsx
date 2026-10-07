import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {MapPin, ScanLine, ShoppingBasket} from 'lucide-react-native';
import {AppButton} from '@/ui/chrome';
import {colors, radii, space} from '@/ui/theme';

type Props = {
  regionLabel?: string;
  onExploreMap: () => void;
  onStartList: () => void;
  onCapture: () => void;
};

export function HomeWelcome({
  regionLabel,
  onExploreMap,
  onStartList,
  onCapture,
}: Props) {
  return (
    <View style={styles.root}>
      <View style={styles.hero}>
        <Text style={styles.brand}>PegouPreço</Text>
        <Text style={styles.headline}>
          Veja onde a compra sai mais barata perto de você
        </Text>
        <Text style={styles.sub}>
          {regionLabel
            ? `Comece explorando mercados em ${regionLabel}.`
            : 'Descubra supermercados próximos, compare preços e economize com a comunidade.'}
        </Text>
        <AppButton label="Ver mercados no mapa" onPress={onExploreMap} />
        <AppButton
          outlined
          label="Começar lista de compras"
          onPress={onStartList}
        />
      </View>

      <Text style={styles.stepsLabel}>Como funciona</Text>
      <View style={styles.steps}>
        <Step
          icon={<MapPin size={18} color={colors.navy} />}
          title="Encontre"
          text="Mercados perto de você no mapa"
          onPress={onExploreMap}
        />
        <Step
          icon={<ScanLine size={18} color={colors.navy} />}
          title="Capture"
          text="Etiquetas ou NFC-e da nota"
          onPress={onCapture}
        />
        <Step
          icon={<ShoppingBasket size={18} color={colors.navy} />}
          title="Compare"
          text="Veja onde a cesta fica mais em conta"
          onPress={onStartList}
        />
      </View>
    </View>
  );
}

function Step({
  icon,
  title,
  text,
  onPress,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.step} onPress={onPress}>
      <View style={styles.stepIcon}>{icon}</View>
      <View style={{flex: 1}}>
        <Text style={styles.stepTitle}>{title}</Text>
        <Text style={styles.stepText}>{text}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {paddingBottom: space.md},
  hero: {
    marginHorizontal: space.md,
    marginTop: space.xs,
    backgroundColor: colors.navy,
    borderRadius: radii.xl,
    padding: space.lg,
    gap: 10,
  },
  brand: {
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: colors.yellow,
  },
  headline: {
    fontSize: 24,
    fontWeight: '900',
    color: colors.white,
    lineHeight: 30,
    letterSpacing: -0.4,
  },
  sub: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.88)',
    lineHeight: 20,
    marginBottom: 4,
  },
  stepsLabel: {
    marginTop: space.lg,
    marginHorizontal: space.md,
    marginBottom: space.sm,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.5,
    color: colors.muted,
    textTransform: 'uppercase',
  },
  steps: {
    marginHorizontal: space.md,
    gap: 8,
  },
  step: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    padding: space.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  stepIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.yellow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepTitle: {fontWeight: '900', color: colors.navy, fontSize: 15},
  stepText: {
    marginTop: 2,
    fontWeight: '600',
    color: colors.muted,
    fontSize: 12,
  },
});

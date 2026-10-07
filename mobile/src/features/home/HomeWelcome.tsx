import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {AppButton} from '@/ui/chrome';
import {colors, radii, space} from '@/ui/theme';

type Props = {
  regionLabel?: string;
  onExploreMap: () => void;
  onStartList: () => void;
};

/** Hero de onboarding — "Como funciona" fica sempre na Home via HomeHowItWorks. */
export function HomeWelcome({
  regionLabel,
  onExploreMap,
  onStartList,
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
    </View>
  );
}

const styles = StyleSheet.create({
  root: {paddingBottom: space.sm},
  hero: {
    marginHorizontal: space.md,
    marginTop: space.xs,
    backgroundColor: colors.navy,
    borderRadius: radii.xl,
    padding: space.lg,
    gap: 10,
    alignItems: 'center',
  },
  brand: {
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: colors.yellow,
    textAlign: 'center',
  },
  headline: {
    fontSize: 24,
    fontWeight: '900',
    color: colors.white,
    lineHeight: 30,
    letterSpacing: -0.4,
    textAlign: 'center',
  },
  sub: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.88)',
    lineHeight: 20,
    marginBottom: 4,
    textAlign: 'center',
  },
});

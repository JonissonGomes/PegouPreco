import React, {useState} from 'react';
import {
  FlatList,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {AppButton, AppField, BrandLogo} from '@/ui/chrome';
import {colors, space} from '@/ui/theme';
import {prefs, useAppStore} from '@/store/appStore';

const CITIES = [
  'Recife',
  'Olinda',
  'Jaboatão dos Guararapes',
  'Paulista',
  'São Paulo',
  'Rio de Janeiro',
  'Belo Horizonte',
  'Salvador',
  'Fortaleza',
  'Brasília',
];

export function OnboardingScreen() {
  const complete = useAppStore(s => s.completeOnboarding);
  const markets = useAppStore(s => s.markets);
  const [step, setStep] = useState(0);
  const [city, setCity] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [favorites, setFavorites] = useState<number[]>([]);

  const toggleFav = (id: number) => {
    setFavorites(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id].slice(0, 8),
    );
  };

  const finish = () => {
    prefs.setLocationPrefs({
      city: city.trim() || 'Recife',
      neighborhood: neighborhood.trim(),
      favoriteMarketIds: favorites,
    });
    complete();
  };

  return (
    <SafeAreaView style={styles.root}>
      {step === 0 ? (
        <View style={styles.hero}>
          <BrandLogo size={88} />
          <Text style={styles.brand}>PegouPreço</Text>
          <Text style={styles.lead}>
            Compare preços da comunidade, organize listas e ajude a manter os
            dados honestos — com níveis, badges e validação.
          </Text>
          <AppButton label="Começar" onPress={() => setStep(1)} />
        </View>
      ) : null}

      {step === 1 ? (
        <View style={styles.pad}>
          <Text style={styles.stepTitle}>Sua cidade</Text>
          <Text style={styles.stepSub}>
            Usamos isso no ranking comunitário de mercados
          </Text>
          <AppField
            label="Cidade"
            value={city}
            onChangeText={setCity}
            placeholder="Ex.: Recife"
          />
          <FlatList
            data={CITIES}
            keyExtractor={c => c}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{gap: 8, marginBottom: 16}}
            renderItem={({item}) => (
              <Pressable
                style={[styles.chip, city === item && styles.chipOn]}
                onPress={() => setCity(item)}>
                <Text
                  style={[styles.chipText, city === item && styles.chipTextOn]}>
                  {item}
                </Text>
              </Pressable>
            )}
          />
          <AppButton
            label="Continuar"
            onPress={() => setStep(2)}
            disabled={!city.trim()}
          />
        </View>
      ) : null}

      {step === 2 ? (
        <View style={styles.pad}>
          <Text style={styles.stepTitle}>Bairro</Text>
          <AppField
            label="Bairro"
            value={neighborhood}
            onChangeText={setNeighborhood}
            placeholder="Ex.: Boa Viagem"
          />
          <AppButton label="Continuar" onPress={() => setStep(3)} />
          <AppButton
            label="Pular"
            outlined
            onPress={() => setStep(3)}
          />
        </View>
      ) : null}

      {step === 3 ? (
        <View style={[styles.pad, {flex: 1}]}>
          <Text style={styles.stepTitle}>Mercados favoritos</Text>
          <Text style={styles.stepSub}>
            Opcional — prioriza esses mercados no comparador
          </Text>
          <FlatList
            data={markets.slice(0, 20)}
            keyExtractor={m => String(m.id)}
            style={{flex: 1, marginVertical: 12}}
            ListEmptyComponent={
              <Text style={styles.stepSub}>
                Nenhum mercado ainda. Você pode escolher depois no mapa/perfil.
              </Text>
            }
            renderItem={({item}) => {
              const on = favorites.includes(item.id);
              return (
                <Pressable
                  style={[styles.marketRow, on && styles.marketOn]}
                  onPress={() => toggleFav(item.id)}>
                  <Text style={[styles.marketName, on && {color: '#fff'}]}>
                    {item.name}
                  </Text>
                </Pressable>
              );
            }}
          />
          <AppButton label="Entrar no app" onPress={finish} />
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.yellowBright,
  },
  hero: {
    flex: 1,
    padding: space.xl,
    justifyContent: 'space-between',
    paddingTop: 64,
    paddingBottom: 32,
  },
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
    flex: 1,
  },
  pad: {flex: 1, padding: space.xl, paddingTop: 48},
  stepTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: colors.navy,
  },
  stepSub: {
    marginTop: 8,
    marginBottom: 16,
    color: colors.navy,
    fontWeight: '600',
    opacity: 0.8,
  },
  chip: {
    backgroundColor: 'rgba(255,255,255,0.55)',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipOn: {backgroundColor: colors.navy},
  chipText: {fontWeight: '800', color: colors.navy, fontSize: 12},
  chipTextOn: {color: '#fff'},
  marketRow: {
    backgroundColor: 'rgba(255,255,255,0.7)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  marketOn: {
    backgroundColor: colors.navy,
  },
  marketName: {fontWeight: '800', color: colors.navy},
});

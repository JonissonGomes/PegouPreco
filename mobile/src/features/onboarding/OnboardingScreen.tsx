import React, {useCallback, useMemo, useRef, useState} from 'react';
import {
  Dimensions,
  FlatList,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ViewToken,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {
  ChevronLeft,
  ChevronRight,
  MapPin,
  ScanLine,
  ShoppingCart,
  UsersRound,
  Zap,
} from 'lucide-react-native';
import {AppButton, AppField, BrandLogo} from '@/ui/chrome';
import {colors, radii, space} from '@/ui/theme';
import {prefs, useAppStore} from '@/store/appStore';

const {width: PAGE_W} = Dimensions.get('window');

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

type StorySlide = {
  key: string;
  kind: 'story';
  kicker: string;
  title: string;
  body: string;
  bullets: string[];
  icon: 'brand' | 'scan' | 'cart' | 'community' | 'fiscal';
};

type SetupSlide = {
  key: string;
  kind: 'city' | 'favorites';
};

type Slide = StorySlide | SetupSlide;

const STORY: StorySlide[] = [
  {
    key: 'welcome',
    kind: 'story',
    kicker: 'Bem-vindo',
    title: 'PegouPreço',
    body: 'Um app comunitário para achar o mercado mais barato na sua região — com preços reais, validados por pessoas como você.',
    bullets: [
      'Compare a sua lista em vários mercados',
      'Capture etiquetas com a câmera',
      'Ganhe pontos e badges ajudando a comunidade',
    ],
    icon: 'brand',
  },
  {
    key: 'capture',
    kind: 'story',
    kicker: 'Passo 1',
    title: 'Capture etiquetas',
    body: 'Aponte a câmera para a etiqueta do produto. O OCR lê nome e preços (varejo/atacado) e já monta o item na sua lista.',
    bullets: [
      'Funciona com etiquetas de atacarejo',
      'Você confirma antes de salvar',
      'Também dá para colar texto ou NFC-e',
    ],
    icon: 'scan',
  },
  {
    key: 'lists',
    kind: 'story',
    kicker: 'Passo 2',
    title: 'Organize e compare',
    body: 'Monte listas, arraste para editar/excluir e veja o ranking comunitário: qual mercado fica mais barato para o que você precisa.',
    bullets: [
      'Ranking com cobertura da lista',
      'Economia estimada vs opção mais cara',
      'Histórico das suas compras',
    ],
    icon: 'cart',
  },
  {
    key: 'community',
    kind: 'story',
    kicker: 'Passo 3',
    title: 'Valide e avalie',
    body: 'Na Comunidade você confirma ou rejeita preços suspeitos e avalia mercados. Assim o comparador fica mais confiável.',
    bullets: [
      'Missões com +pts a cada voto',
      'Níveis Fiscal Bronze → Ouro',
      'Badges por participação',
    ],
    icon: 'community',
  },
  {
    key: 'fiscal',
    kind: 'story',
    kicker: 'Gamificação',
    title: 'Suba de Fiscal',
    body: 'Quanto mais você contribui (com conta verificada), mais peso tem o seu voto e mais rápido o ranking da região melhora.',
    bullets: [
      'Verifique o e-mail no Perfil',
      'Defina cidade, bairro e favoritos',
      'Use o mapa para achar mercados perto',
    ],
    icon: 'fiscal',
  },
];

function SlideIcon({name}: {name: StorySlide['icon']}) {
  if (name === 'brand') return <BrandLogo size={72} />;
  const wrap = (node: React.ReactNode) => (
    <View style={styles.iconBubble}>{node}</View>
  );
  if (name === 'scan')
    return wrap(<ScanLine size={34} color={colors.navy} />);
  if (name === 'cart')
    return wrap(<ShoppingCart size={34} color={colors.navy} />);
  if (name === 'community')
    return wrap(<UsersRound size={34} color={colors.navy} />);
  return wrap(<Zap size={34} color={colors.navy} fill={colors.navy} />);
}

export function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const complete = useAppStore(s => s.completeOnboarding);
  const markets = useAppStore(s => s.markets);
  const listRef = useRef<FlatList<Slide>>(null);
  const [index, setIndex] = useState(0);
  const [city, setCity] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [favorites, setFavorites] = useState<number[]>([]);

  const slides: Slide[] = useMemo(
    () => [
      ...STORY,
      {key: 'city', kind: 'city'},
      {key: 'favorites', kind: 'favorites'},
    ],
    [],
  );

  const last = slides.length - 1;
  const isCity = slides[index]?.kind === 'city';
  const isFavorites = slides[index]?.kind === 'favorites';
  const canContinueCity = city.trim().length > 0;

  const goTo = useCallback(
    (i: number) => {
      const next = Math.max(0, Math.min(last, i));
      listRef.current?.scrollToIndex({index: next, animated: true});
      setIndex(next);
    },
    [last],
  );

  const onMomentumEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / PAGE_W);
    if (i !== index) setIndex(i);
  };

  const onViewableItemsChanged = useRef(
    ({viewableItems}: {viewableItems: ViewToken[]}) => {
      const i = viewableItems[0]?.index;
      if (typeof i === 'number') setIndex(i);
    },
  ).current;

  const viewabilityConfig = useRef({viewAreaCoveragePercentThreshold: 60}).current;

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

  const primaryLabel = isFavorites
    ? 'Entrar no app'
    : isCity
      ? 'Continuar'
      : index === 0
        ? 'Começar'
        : 'Próximo';

  const onPrimary = () => {
    if (isFavorites) {
      finish();
      return;
    }
    if (isCity && !canContinueCity) return;
    goTo(index + 1);
  };

  const renderSlide = ({item}: {item: Slide}) => {
    if (item.kind === 'story') {
      return (
        <View style={[styles.page, {width: PAGE_W, paddingTop: insets.top + 24}]}>
          <SlideIcon name={item.icon} />
          <Text style={styles.kicker}>{item.kicker}</Text>
          <Text style={styles.title}>{item.title}</Text>
          <Text style={styles.body}>{item.body}</Text>
          <View style={styles.bullets}>
            {item.bullets.map(b => (
              <View key={b} style={styles.bulletRow}>
                <View style={styles.bulletDot} />
                <Text style={styles.bulletText}>{b}</Text>
              </View>
            ))}
          </View>
        </View>
      );
    }

    if (item.kind === 'city') {
      return (
        <View style={[styles.page, {width: PAGE_W, paddingTop: insets.top + 24}]}>
          <View style={styles.iconBubble}>
            <MapPin size={34} color={colors.navy} />
          </View>
          <Text style={styles.kicker}>Quase lá</Text>
          <Text style={styles.title}>Sua região</Text>
          <Text style={styles.body}>
            Cidade e bairro alimentam o ranking comunitário e o mapa de mercados
            próximos.
          </Text>
          <AppField
            label="Cidade"
            value={city}
            onChangeText={setCity}
            placeholder="Ex.: Recife"
            compact
          />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipRow}>
            {CITIES.map(c => (
              <Pressable
                key={c}
                style={[styles.chip, city === c && styles.chipOn]}
                onPress={() => setCity(c)}>
                <Text style={[styles.chipText, city === c && styles.chipTextOn]}>
                  {c}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
          <AppField
            label="Bairro (opcional)"
            value={neighborhood}
            onChangeText={setNeighborhood}
            placeholder="Ex.: Boa Viagem"
            compact
          />
        </View>
      );
    }

    return (
      <View style={[styles.page, {width: PAGE_W, paddingTop: insets.top + 24}]}>
        <View style={styles.iconBubble}>
          <ShoppingCart size={34} color={colors.navy} />
        </View>
        <Text style={styles.kicker}>Personalize</Text>
        <Text style={styles.title}>Mercados favoritos</Text>
        <Text style={styles.body}>
          Opcional — prioriza esses mercados no comparador. Pode mudar depois no
          Perfil.
        </Text>
        <ScrollView style={styles.favList} nestedScrollEnabled>
          {markets.length === 0 ? (
            <Text style={styles.emptyFav}>
              Nenhum mercado ainda. Abra o mapa depois para descobrir os da sua
              região.
            </Text>
          ) : (
            markets.slice(0, 20).map(m => {
              const on = favorites.includes(m.id);
              return (
                <Pressable
                  key={m.id}
                  style={[styles.marketRow, on && styles.marketOn]}
                  onPress={() => toggleFav(m.id)}>
                  <Text style={[styles.marketName, on && {color: '#fff'}]}>
                    {m.name}
                  </Text>
                </Pressable>
              );
            })
          )}
        </ScrollView>
      </View>
    );
  };

  return (
    <View style={[styles.root, {paddingBottom: Math.max(insets.bottom, 12)}]}>
      <FlatList
        ref={listRef}
        data={slides}
        keyExtractor={s => s.key}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        bounces
        onMomentumScrollEnd={onMomentumEnd}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        getItemLayout={(_, i) => ({
          length: PAGE_W,
          offset: PAGE_W * i,
          index: i,
        })}
        renderItem={renderSlide}
      />

      <View style={styles.footer}>
        <View style={styles.dots}>
          {slides.map((s, i) => (
            <Pressable
              key={s.key}
              onPress={() => goTo(i)}
              hitSlop={8}
              style={[styles.dot, i === index && styles.dotOn]}
            />
          ))}
        </View>

        <View style={styles.navRow}>
          <Pressable
            style={[styles.navBtn, index === 0 && styles.navBtnGhost]}
            disabled={index === 0}
            onPress={() => goTo(index - 1)}>
            <ChevronLeft size={22} color={colors.navy} />
            <Text style={styles.navBtnText}>Voltar</Text>
          </Pressable>

          <View style={{flex: 1}}>
            <AppButton
              label={primaryLabel}
              onPress={onPrimary}
              disabled={isCity && !canContinueCity}
            />
          </View>

          {!isFavorites ? (
            <Pressable style={styles.navBtn} onPress={() => goTo(index + 1)}>
              <Text style={styles.navBtnText}>Avançar</Text>
              <ChevronRight size={22} color={colors.navy} />
            </Pressable>
          ) : (
            <Pressable style={styles.navBtn} onPress={finish}>
              <Text style={styles.navBtnText}>Pular</Text>
            </Pressable>
          )}
        </View>

        <Text style={styles.swipeHint}>Deslize ← → para navegar</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.yellowBright,
  },
  page: {
    flex: 1,
    paddingHorizontal: space.xl,
    paddingBottom: 8,
  },
  iconBubble: {
    width: 72,
    height: 72,
    borderRadius: 24,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.navy,
    marginBottom: 8,
  },
  kicker: {
    marginTop: 12,
    fontSize: 12,
    fontWeight: '800',
    color: colors.navy,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    opacity: 0.75,
  },
  title: {
    marginTop: 6,
    fontSize: 32,
    fontWeight: '900',
    color: colors.navy,
    letterSpacing: -0.6,
  },
  body: {
    marginTop: 12,
    fontSize: 16,
    fontWeight: '600',
    color: colors.navy,
    lineHeight: 22,
    opacity: 0.9,
  },
  bullets: {marginTop: 20, gap: 10},
  bulletRow: {flexDirection: 'row', alignItems: 'flex-start', gap: 10},
  bulletDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.navy,
    marginTop: 5,
  },
  bulletText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: colors.navy,
    lineHeight: 20,
  },
  chipRow: {gap: 8, paddingVertical: 10},
  chip: {
    backgroundColor: 'rgba(255,255,255,0.65)',
    borderRadius: radii.pill,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(11,42,107,0.15)',
  },
  chipOn: {backgroundColor: colors.navy, borderColor: colors.navy},
  chipText: {fontWeight: '800', color: colors.navy, fontSize: 12},
  chipTextOn: {color: '#fff'},
  favList: {flex: 1, marginTop: 8, marginBottom: 4},
  emptyFav: {
    color: colors.navy,
    fontWeight: '600',
    opacity: 0.8,
    lineHeight: 20,
  },
  marketRow: {
    backgroundColor: 'rgba(255,255,255,0.75)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(11,42,107,0.12)',
  },
  marketOn: {backgroundColor: colors.navy, borderColor: colors.navy},
  marketName: {fontWeight: '800', color: colors.navy},
  footer: {
    paddingHorizontal: space.md,
    paddingTop: 8,
    gap: 10,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(11,42,107,0.25)',
  },
  dotOn: {
    width: 22,
    backgroundColor: colors.navy,
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  navBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 6,
    paddingVertical: 10,
    minWidth: 72,
  },
  navBtnGhost: {opacity: 0.35},
  navBtnText: {fontWeight: '800', color: colors.navy, fontSize: 13},
  swipeHint: {
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '700',
    color: colors.navy,
    opacity: 0.55,
    marginBottom: 4,
  },
});

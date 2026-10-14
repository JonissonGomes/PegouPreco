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
  MapPin,
  ScanLine,
  ShoppingCart,
  UsersRound,
  Zap,
} from 'lucide-react-native';
import {AppField, BrandLogo} from '@/ui/chrome';
import {colors, radii} from '@/ui/theme';
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
    const story = item.kind === 'story';
    const title = story
      ? item.title
      : item.kind === 'city'
        ? 'Sua região'
        : 'Mercados favoritos';
    const body = story
      ? item.body
      : item.kind === 'city'
        ? 'Cidade e bairro alimentam o ranking e o mapa de mercados próximos.'
        : 'Opcional. Esses mercados aparecem primeiro no comparador. Dá para mudar no Perfil.';

    return (
      <ScrollView
        style={{width: PAGE_W}}
        contentContainerStyle={styles.page}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          {story ? (
            <SlideIcon name={item.icon} />
          ) : (
            <View style={styles.iconBubble}>
              {item.kind === 'city' ? (
                <MapPin size={34} color={colors.navy} />
              ) : (
                <ShoppingCart size={34} color={colors.navy} />
              )}
            </View>
          )}
        </View>
        <View style={styles.copy}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.body}>{body}</Text>
          {item.kind === 'city' ? (
            <View style={styles.form}>
              <AppField
                label="Cidade"
                value={city}
                onChangeText={setCity}
                placeholder="Ex.: Recife"
                compact
              />
              <View style={styles.chipWrap}>
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
              </View>
              <AppField
                label="Bairro (opcional)"
                value={neighborhood}
                onChangeText={setNeighborhood}
                placeholder="Ex.: Boa Viagem"
                compact
              />
            </View>
          ) : null}
          {item.kind === 'favorites' ? (
            <ScrollView style={styles.favList} nestedScrollEnabled>
              {markets.length === 0 ? (
                <Text style={styles.emptyFav}>
                  Nenhum mercado ainda. O mapa mostra os da sua região depois.
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
          ) : null}
        </View>
      </ScrollView>
    );
  };

  return (
    <View style={[styles.root, {paddingBottom: Math.max(insets.bottom, 16)}]}>
      <View style={[styles.topBar, {paddingTop: insets.top + 10}]}>
        {index > 0 ? (
          <Pressable
            onPress={() => goTo(index - 1)}
            hitSlop={10}
            style={styles.backBtn}
            accessibilityLabel="Voltar">
            <ChevronLeft size={22} color={colors.navy} />
          </Pressable>
        ) : (
          <View style={styles.backBtn} />
        )}
        <View style={styles.bars}>
          {slides.map((s, i) => (
            <Pressable
              key={s.key}
              onPress={() => goTo(i)}
              style={[styles.bar, i <= index && styles.barOn]}
            />
          ))}
        </View>
      </View>
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
        <Pressable
          style={[styles.cta, isCity && !canContinueCity && styles.ctaOff]}
          disabled={isCity && !canContinueCity}
          onPress={onPrimary}>
          <Text style={styles.ctaText}>
            {isFavorites ? 'Começar' : primaryLabel} →
          </Text>
        </Pressable>
        {isFavorites ? (
          <Pressable onPress={finish} hitSlop={8}>
            <Text style={styles.skip}>Pular favoritos</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: '#fff'},
  topBar: {
    paddingHorizontal: 20,
    paddingBottom: 8,
    gap: 10,
  },
  backBtn: {width: 36, height: 28, justifyContent: 'center'},
  bars: {flexDirection: 'row', gap: 6},
  bar: {
    flex: 1,
    height: 4,
    borderRadius: 4,
    backgroundColor: '#E7E5E4',
  },
  barOn: {backgroundColor: colors.navy},
  page: {flexGrow: 1, backgroundColor: '#fff', paddingBottom: 12},
  hero: {
    height: 240,
    marginHorizontal: 16,
    borderRadius: 28,
    backgroundColor: '#FFF6D8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: {
    paddingHorizontal: 28,
    paddingTop: 28,
    paddingBottom: 8,
    alignItems: 'center',
  },
  iconBubble: {
    width: 88,
    height: 88,
    borderRadius: 28,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.navy,
  },
  title: {
    fontSize: 30,
    fontWeight: '900',
    color: colors.ink,
    letterSpacing: -0.6,
    textAlign: 'center',
  },
  body: {
    marginTop: 12,
    fontSize: 15,
    fontWeight: '600',
    color: colors.muted,
    lineHeight: 22,
    textAlign: 'center',
  },
  form: {alignSelf: 'stretch', marginTop: 16, gap: 8},
  chipWrap: {flexDirection: 'row', flexWrap: 'wrap', gap: 8},
  chip: {
    backgroundColor: '#F3F4F6',
    borderRadius: radii.pill,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipOn: {backgroundColor: colors.navy},
  chipText: {fontWeight: '800', color: colors.navy, fontSize: 12},
  chipTextOn: {color: '#fff'},
  favList: {alignSelf: 'stretch', maxHeight: 180, marginTop: 12},
  emptyFav: {
    color: colors.muted,
    fontWeight: '600',
    lineHeight: 20,
    textAlign: 'center',
  },
  marketRow: {
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  marketOn: {backgroundColor: colors.navy},
  marketName: {fontWeight: '800', color: colors.navy},
  footer: {
    paddingHorizontal: 24,
    paddingTop: 8,
    alignItems: 'center',
    gap: 10,
  },
  cta: {
    alignSelf: 'center',
    backgroundColor: colors.navy,
    borderRadius: radii.pill,
    paddingHorizontal: 28,
    paddingVertical: 14,
    minWidth: 180,
  },
  ctaOff: {opacity: 0.4},
  ctaText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 16,
    textAlign: 'center',
  },
  skip: {fontWeight: '700', color: colors.muted, fontSize: 13},
});

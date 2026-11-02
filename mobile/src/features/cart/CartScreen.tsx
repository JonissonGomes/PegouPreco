import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  UIManager,
  View,
} from 'react-native';
import {useFocusEffect, useNavigation, useRoute} from '@react-navigation/native';
import Geolocation from 'react-native-geolocation-service';
import {
  ClipboardList,
  FileText,
  History,
  MapPin,
  MoreVertical,
  Pencil,
  Plus,
  Barcode,
  QrCode,
  Search,
  SlidersHorizontal,
  Trash2,
  TrendingDown,
  TrendingUp,
  X,
} from 'lucide-react-native';
import {AppButton, AppField} from '@/ui/chrome';
import {
  ProgressBar,
  SavePill,
  SoftCard,
  SoftHeader,
} from '@/ui/screenChrome';
import {appAlert} from '@/ui/appDialog';
import {KeyboardSafeSheet} from '@/ui/keyboardSheet';
import {MarketSuggestRow} from '@/ui/MarketSuggestRow';
import {SwipeableActions} from '@/ui/SwipeableActions';
import {PressableScale} from '@/ui/PressableScale';
import {animateLayout} from '@/ui/motion';
import {colors, radii, space, spacing} from '@/ui/theme';

if (
  Platform.OS === 'android' &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}
import {formatBrl, formatQty, maskMoneyTyping, parseBrl} from '@/domain/money';
import {parseSpendLimit, SpendLimitBar} from '@/features/cart/SpendLimitBar';
import {lineTotal} from '@/domain/pricing';
import {
  formatDistanceKm,
  pickConfirmCandidate,
  rankNearestMarkets,
} from '@/domain/marketUi';
import {
  cartRepo,
  prefs,
  priceLogRepo,
  productRepo,
  useAppStore,
  useMarketName,
} from '@/store/appStore';
import type {CartItem} from '@/data/types';
import {marketRepo} from '@/data/repositories';
import {ensureNearbyMarketsDiscovered} from '@/data/remote/ensureNearbyMarkets';
import {haversineKm} from '@/data/remote/nearbyMarkets';
import {MAPBOX_ACCESS_TOKEN} from '@/config/env';
import {CartEmptyGuide} from '@/features/cart/CartEmptyGuide';
import {BasketWhereCard} from '@/features/cart/BasketWhereCard';
import {ImportListSheet} from '@/features/cart/ImportListSheet';
import {CategoryIcon} from '@/features/history/categoryIcon';
import {groupCartByCategory} from '@/domain/groupCartByCategory';
import {parseShoppingListText} from '@/domain/parseShoppingListText';

function qtyPhrase(qty: number) {
  const n = formatQty(qty);
  return qty === 1 ? `${n} un` : `${n} un`;
}

export function CartScreen() {
  const nav = useNavigation<any>();
  const route = useRoute<any>();
  const cart = useAppStore(s => s.cart);
  const refresh = useAppStore(s => s.refresh);
  const finalize = useAppStore(s => s.finalize);
  const cancelPurchase = useAppStore(s => s.cancelPurchase);
  const startList = useAppStore(s => s.startList);
  const activeListName = useAppStore(s => s.activeListName);
  const activeMarketId = useAppStore(s => s.activeMarketId);
  const spendLimit = useAppStore(s => s.spendLimit);
  const markets = useAppStore(s => s.markets);
  const products = useAppStore(s => s.products);
  const auth = useAppStore(s => s.auth);
  const marketName = useMarketName(activeMarketId);
  const [editItem, setEditItem] = useState<CartItem | null>(null);
  const [startOpen, setStartOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [limitModalOpen, setLimitModalOpen] = useState(false);
  const [limitModalText, setLimitModalText] = useState('');
  const [renameCartOpen, setRenameCartOpen] = useState(false);
  const [renameCartText, setRenameCartText] = useState('');
  const [editMarketOpen, setEditMarketOpen] = useState(false);
  const [editMarketQuery, setEditMarketQuery] = useState('');
  const [listName, setListName] = useState('Compras de hoje');
  const [spendLimitText, setSpendLimitText] = useState('');
  const presetMarketId = useRef<number | null>(null);
  const [marketQuery, setMarketQuery] = useState('');
  const [origin, setOrigin] = useState<{lat: number; lng: number} | null>(
    () => prefs.getLastLocation(),
  );
  const [pickedMarketId, setPickedMarketId] = useState<number | null>(null);
  /** confirm = pergunta in-loco; pick = escolher/buscar; loading discovery. */
  const [startStep, setStartStep] = useState<'loading' | 'confirm' | 'pick'>(
    'loading',
  );
  const [confirmHint, setConfirmHint] = useState<string | null>(null);
  const [itemDraft, setItemDraft] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [searchItemQuery, setSearchItemQuery] = useState('');

  const totals = useMemo(() => cartRepo.computeTotals(cart), [cart]);
  const selectedCount = totals.checkedCount;
  const bottomPad = spacing.bottomNavClearance;
  const filteredCart = useMemo(() => {
    const q = searchItemQuery.trim().toLowerCase();
    if (!q) return cart;
    return cart.filter(i => i.productName.toLowerCase().includes(q));
  }, [cart, searchItemQuery]);

  const inCart = useMemo(
    () => filteredCart.filter(i => i.checkedOff),
    [filteredCart],
  );
  const missing = useMemo(
    () => filteredCart.filter(i => !i.checkedOff),
    [filteredCart],
  );
  const inCartGroups = useMemo(
    () => groupCartByCategory(inCart, products),
    [inCart, products],
  );
  const missingGroups = useMemo(
    () => groupCartByCategory(missing, products),
    [missing, products],
  );
  const progress =
    totals.itemCount > 0 ? selectedCount / totals.itemCount : 0;

  const suggestedProducts = useMemo(() => {
    const q = itemDraft.trim().toLowerCase();
    if (!q || q.length < 2) return [];
    // Prioritiza produtos que começam com o texto digitado e depois os que contêm
    const matches = products.filter(p => p.name.toLowerCase().includes(q));
    matches.sort((a, b) => {
      const aStarts = a.name.toLowerCase().startsWith(q);
      const bStarts = b.name.toLowerCase().startsWith(q);
      if (aStarts && !bStarts) return -1;
      if (!aStarts && bStarts) return 1;
      return a.name.localeCompare(b.name, 'pt-BR');
    });
    return matches.slice(0, 5);
  }, [itemDraft, products]);

  const addWrittenItem = (chosenName?: string, category?: string | null) => {
    if (!activeListName || !activeMarketId) {
      setStartOpen(true);
      return;
    }
    const name = (chosenName ?? itemDraft).trim();
    if (!name) return;
    const product = productRepo.resolveOrCreate(name, category);
    cartRepo.upsert({
      productId: product.id,
      productName: name,
      quantity: 1,
      retailPrice: 0,
      checkedOff: 0,
    });
    setItemDraft('');
    setAddOpen(false);
    refresh();
  };

  const importListText = (raw: string) => {
    const parsed = parseShoppingListText(raw);
    if (!parsed.length) {
      appAlert('Importar lista', 'Não reconheci nenhum item neste texto.');
      return;
    }
    animateLayout();
    const known = new Map(cart.map(row => [row.productId, row]));
    for (const item of parsed) {
      const product = productRepo.resolveOrCreate(item.name, item.category);
      const existing = known.get(product.id);
      const nextQty = (existing?.quantity ?? 0) + item.quantity;
      cartRepo.upsert({
        productId: product.id,
        productName: item.name,
        quantity: nextQty,
        retailPrice: existing?.retailPrice ?? 0,
        wholesalePrice: existing?.wholesalePrice ?? null,
        minWholesaleQty: existing?.minWholesaleQty ?? null,
        checkedOff: existing?.checkedOff ?? 0,
      });
      known.set(product.id, {
        id: existing?.id ?? product.id,
        productId: product.id,
        productName: item.name,
        quantity: nextQty,
        retailPrice: existing?.retailPrice ?? 0,
        wholesalePrice: existing?.wholesalePrice ?? null,
        minWholesaleQty: existing?.minWholesaleQty ?? null,
        useWholesale: existing?.useWholesale ?? 0,
        checkedOff: existing?.checkedOff ?? 0,
        updatedAt: existing?.updatedAt ?? '',
      });
    }
    refresh();
    appAlert(
      'Lista importada',
      `${parsed.length} itens adicionados ao carrinho.`,
    );
  };

  const scanListItem = (item: CartItem) => {
    if (!activeListName || !activeMarketId) {
      setStartOpen(true);
      return;
    }
    nav.navigate('Capture', {cartItemId: item.id});
  };

  const goCapture = () => {
    if (!activeListName || !activeMarketId) {
      setStartOpen(true);
      return;
    }
    nav.navigate('Capture');
  };

  const runMenuAction = (action: () => void) => {
    setMenuOpen(false);
    action();
  };

  useFocusEffect(
    useCallback(() => {
      if (!route.params?.askMarket) return;
      const name = String(route.params.listName ?? '').trim();
      const marketId = Number(route.params.marketId);
      presetMarketId.current =
        Number.isFinite(marketId) && marketId > 0 ? marketId : null;
      if (name) setListName(name);
      setStartOpen(true);
      nav.setParams({
        askMarket: undefined,
        listName: undefined,
        marketId: undefined,
      });
    }, [nav, route.params?.askMarket, route.params?.listName, route.params?.marketId]),
  );

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () =>
      setKeyboardOpen(true),
    );
    const hide = Keyboard.addListener('keyboardDidHide', () =>
      setKeyboardOpen(false),
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  useEffect(() => {
    if (!startOpen) return;
    const preset = presetMarketId.current;
    presetMarketId.current = null;
    if (preset) {
      const market = marketRepo.getById(preset);
      setPickedMarketId(preset);
      setMarketQuery(market?.name ?? '');
      setConfirmHint(null);
      setStartStep('confirm');
      return;
    }
    let cancelled = false;
    setStartStep('loading');
    setConfirmHint(null);
    setPickedMarketId(null);
    setMarketQuery('');
    setSpendLimitText('');

    const finishWithOrigin = async (next: {lat: number; lng: number} | null) => {
      if (cancelled) return;
      if (next) setOrigin(next);
      const originPt = next ?? prefs.getLastLocation();
      if (!originPt) {
        setConfirmHint('GPS indisponível — escolha ou digite o mercado.');
        setStartStep('pick');
        return;
      }
      try {
        await ensureNearbyMarketsDiscovered(originPt.lat, originPt.lng, {
          mapboxToken: MAPBOX_ACCESS_TOKEN,
        });
        if (cancelled) return;
        // Um único refresh ao terminar a discovery (não a cada pin)
        refresh();
        if (cancelled) return;
        const marketsNow = marketRepo.all();
        const candidate = pickConfirmCandidate(marketsNow, originPt);
        if (candidate) {
          setPickedMarketId(candidate.id);
          setMarketQuery(candidate.name);
          setStartStep('confirm');
        } else {
          setConfirmHint('Escolha o mercado mais próximo ou busque pelo nome.');
          setStartStep('pick');
        }
      } catch {
        if (cancelled) return;
        setConfirmHint('Não foi possível buscar mercados próximos.');
        setStartStep('pick');
      }
    };

    const last = prefs.getLastLocation();
    if (last) setOrigin(last);
    Geolocation.getCurrentPosition(
      pos => {
        const next = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        };
        prefs.setLastLocation(next.lat, next.lng);
        void finishWithOrigin(next);
      },
      () => {
        void finishWithOrigin(last);
      },
      {enableHighAccuracy: false, timeout: 10000, maximumAge: 60000},
    );
    return () => {
      cancelled = true;
    };
    // Só reexecuta ao abrir/fechar o sheet — refresh estável não deve resetar o fluxo
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startOpen]);

  const suggested = useMemo(
    () =>
      rankNearestMarkets(markets, origin, {
        query: marketQuery,
        limit: marketQuery.trim() ? 12 : 3,
      }),
    [markets, origin, marketQuery],
  );

  const canCreateMarket =
    marketQuery.trim().length > 0 &&
    !markets.some(
      m => m.name.toLowerCase() === marketQuery.trim().toLowerCase(),
    );

  const beginList = (marketId: number) => {
    const name = listName.trim();
    if (!name) {
      appAlert('Lista incompleta', 'Informe o nome da lista.');
      return;
    }
    const limit = parseSpendLimit(spendLimitText);
    if (limit === 'invalid') {
      appAlert(
        'Limite inválido',
        'Informe um valor maior que zero ou deixe o campo em branco.',
      );
      return;
    }
    startList(name, marketId, limit);
    setSpendLimitText('');
    setStartOpen(false);
    setPickedMarketId(null);
    setStartStep('loading');
  };

  return (
    <View style={styles.root}>
      <SoftHeader
        title={activeListName || 'Iniciar compras'}
        subtitle={
          activeListName
            ? marketName || 'Mercado não definido'
            : 'Comece uma compra e registre os itens no mercado'
        }
        trailing={
          <View style={styles.headerActions}>
            {activeListName ? (
              <Pressable
                onPress={() => setAddOpen(true)}
                style={styles.menuCircle}
                accessibilityLabel="Adicionar item">
                <Plus color={colors.navy} size={20} />
              </Pressable>
            ) : null}
            <Pressable
              onPress={() => setMenuOpen(true)}
              style={styles.menuCircle}
              accessibilityLabel="Menu da lista">
              <MoreVertical color={colors.navy} size={20} />
            </Pressable>
          </View>
        }
      />
      <Modal
        visible={menuOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuOpen(false)}>
        <Pressable style={styles.menuBackdrop} onPress={() => setMenuOpen(false)}>
          <View style={styles.menuCard}>
            <Text style={styles.menuTitle}>Ações</Text>
            <Pressable
              style={styles.menuItem}
              onPress={() =>
                runMenuAction(() => nav.navigate('ImportPurchase'))
              }>
              <QrCode size={18} color={colors.navy} />
              <Text style={styles.menuItemText}>Cadastrar nota</Text>
            </Pressable>
            <Pressable
              style={styles.menuItem}
              onPress={() =>
                runMenuAction(() => nav.navigate('ShoppingLists'))
              }>
              <ClipboardList size={18} color={colors.navy} />
              <Text style={styles.menuItemText}>Compras salvas</Text>
            </Pressable>
            <Pressable
              style={styles.menuItem}
              onPress={() => runMenuAction(() => nav.navigate('History'))}>
              <History size={18} color={colors.navy} />
              <Text style={styles.menuItemText}>Histórico</Text>
            </Pressable>
            {activeListName ? (
              <>
                <Pressable
                  style={styles.menuItem}
                  onPress={() =>
                    runMenuAction(() => {
                      setRenameCartText(activeListName || '');
                      setRenameCartOpen(true);
                    })
                  }>
                  <Pencil size={18} color={colors.navy} />
                  <Text style={styles.menuItemText}>Renomear compra</Text>
                </Pressable>
                <Pressable
                  style={styles.menuItem}
                  onPress={() =>
                    runMenuAction(() => {
                      setEditMarketQuery(marketName || '');
                      setEditMarketOpen(true);
                    })
                  }>
                  <MapPin size={18} color={colors.navy} />
                  <Text style={styles.menuItemText}>Alterar mercado/local</Text>
                </Pressable>
                <Pressable
                  style={styles.menuItem}
                  onPress={() =>
                    runMenuAction(() => {
                      setLimitModalText(
                        spendLimit != null && spendLimit > 0
                          ? spendLimit.toFixed(2)
                          : '',
                      );
                      setLimitModalOpen(true);
                    })
                  }>
                  <SlidersHorizontal size={18} color={colors.navy} />
                  <Text style={styles.menuItemText}>
                    {spendLimit != null && spendLimit > 0
                      ? 'Alterar limite de gasto'
                      : 'Definir limite de gasto'}
                  </Text>
                </Pressable>
                <Pressable
                  style={styles.menuItem}
                  onPress={() => runMenuAction(() => setImportOpen(true))}>
                  <FileText size={18} color={colors.navy} />
                  <Text style={styles.menuItemText}>Importar lista</Text>
                </Pressable>
                <Pressable
                  style={styles.menuItem}
                  onPress={() =>
                    runMenuAction(() =>
                      appAlert(
                        'Cancelar esta compra?',
                        'Os itens saem do carrinho e você pode iniciar outra.',
                        [
                          {label: 'Voltar', style: 'cancel'},
                          {
                            label: 'Cancelar compra',
                            style: 'destructive',
                            onPress: () => cancelPurchase(),
                          },
                        ],
                      ),
                    )
                  }>
                  <Trash2 size={18} color={colors.danger} />
                  <Text style={[styles.menuItemText, {color: colors.danger}]}>
                    Cancelar compra
                  </Text>
                </Pressable>
              </>
            ) : null}
          </View>
        </Pressable>
      </Modal>
      {!activeListName && cart.length === 0 ? (
        <CartEmptyGuide
          hasActiveList={!!activeListName}
          onStartScan={goCapture}
          onOpenSavedLists={() => nav.navigate('ShoppingLists')}
        />
      ) : (
        <>
          <ScrollView
            style={styles.list}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={[
              styles.listPad,
              {paddingBottom: keyboardOpen ? space.md : 16},
            ]}>
            <View style={styles.summaryCard}>
              <View style={styles.summaryTopRow}>
                <View style={{flex: 1}}>
                  <Text style={styles.summaryKicker}>TOTAL NO CARRINHO</Text>
                  <Text style={styles.summaryTotal}>
                    {formatBrl(totals.subtotal)}
                  </Text>
                </View>
                <View style={styles.summaryBadges}>
                  <View style={styles.itemsBadge}>
                    <Text style={styles.itemsBadgeText}>
                      {selectedCount}/{totals.itemCount} itens
                    </Text>
                  </View>
                  {totals.savings > 0 ? (
                    <SavePill label={`-${formatBrl(totals.savings)}`} />
                  ) : null}
                </View>
              </View>

              <View style={{marginTop: 6}}>
                <ProgressBar progress={progress} height={6} />
              </View>

              {spendLimit != null ? (
                <View style={{marginTop: 4}}>
                  <SpendLimitBar spent={totals.subtotal} limit={spendLimit} />
                </View>
              ) : null}
            </View>

            {cart.length > 0 ? (
              <View style={styles.searchBar}>
                <Search size={16} color={colors.muted} />
                <TextInput
                  placeholder="Buscar item no carrinho…"
                  placeholderTextColor={colors.muted}
                  value={searchItemQuery}
                  onChangeText={setSearchItemQuery}
                  style={styles.searchInput}
                  returnKeyType="search"
                />
                {searchItemQuery ? (
                  <Pressable onPress={() => setSearchItemQuery('')} hitSlop={8}>
                    <X size={16} color={colors.navy} />
                  </Pressable>
                ) : null}
              </View>
            ) : null}

            {cart.length === 0 ? (
              <Text style={styles.emptyList}>
                Lista vazia. Toque em + no topo ou importe uma lista no menu.
              </Text>
            ) : null}

            {inCart.length > 0 ? (
              <>
                <Text style={styles.sectionTitle}>No carrinho</Text>
                {inCartGroups.map(group => (
                  <View key={`in-${group.category}`} style={styles.catBlock}>
                    <View style={styles.catHead}>
                      <CategoryIcon name={group.category} size={14} />
                      <Text style={styles.catTitle}>{group.category}</Text>
                    </View>
                    {group.items.map(item => (
                      <CartRow
                        key={item.id}
                        item={item}
                        muted={false}
                        onEdit={() => setEditItem(item)}
                        onDelete={() => {
                          appAlert(
                            'Excluir item?',
                            `"${item.productName}" será removido da lista.`,
                            [
                              {label: 'Cancelar', style: 'cancel'},
                              {
                                label: 'Excluir',
                                style: 'destructive',
                                onPress: () => {
                                  animateLayout();
                                  cartRepo.remove(item.id);
                                  refresh();
                                },
                              },
                            ],
                          );
                        }}
                        onToggle={() => {
                          cartRepo.toggleChecked(item.id);
                          refresh();
                        }}
                        onScan={() => scanListItem(item)}
                      />
                    ))}
                  </View>
                ))}
              </>
            ) : null}

            {missing.length > 0 ? (
              <>
                <Text style={styles.sectionTitle}>
                  Faltam · {missing.length}
                </Text>
                {missingGroups.map(group => (
                  <View key={`miss-${group.category}`} style={styles.catBlock}>
                    <View style={styles.catHead}>
                      <CategoryIcon name={group.category} size={14} />
                      <Text style={styles.catTitle}>{group.category}</Text>
                    </View>
                    {group.items.map(item => (
                      <CartRow
                        key={item.id}
                        item={item}
                        muted
                        onEdit={() => setEditItem(item)}
                        onDelete={() => {
                          appAlert(
                            'Excluir item?',
                            `"${item.productName}" será removido da lista.`,
                            [
                              {label: 'Cancelar', style: 'cancel'},
                              {
                                label: 'Excluir',
                                style: 'destructive',
                                onPress: () => {
                                  animateLayout();
                                  cartRepo.remove(item.id);
                                  refresh();
                                },
                              },
                            ],
                          );
                        }}
                        onToggle={() => {
                          cartRepo.toggleChecked(item.id);
                          refresh();
                        }}
                        onScan={() => scanListItem(item)}
                      />
                    ))}
                  </View>
                ))}
              </>
            ) : null}
          </ScrollView>
          <View style={[styles.finalizeBar, {paddingBottom: bottomPad}]}>
            <PressableScale
              activeScale={0.96}
              onPress={() => {
                if (!activeListName) {
                  setStartOpen(true);
                  return;
                }
                if (!selectedCount) {
                  appAlert(
                    'Nada selecionado',
                    'Marque os itens que entram no total da compra.',
                  );
                  return;
                }
                appAlert(
                  'Finalizar compras?',
                  `${selectedCount} selecionado(s) · ${formatBrl(totals.subtotal)}`,
                  [
                    {label: 'Cancelar', style: 'cancel'},
                    {
                      label: 'Finalizar',
                      style: 'primary',
                      onPress: () => {
                        if (finalize()) {
                          appAlert(
                            'Compra salva',
                            'A lista foi para o histórico.',
                            [{label: 'Concluir', style: 'primary'}],
                            'success',
                          );
                        }
                      },
                    },
                  ],
                );
              }}>
              <View style={styles.finalizeBtnPill}>
                <Text style={styles.finalizeBtnText}>
                  Finalizar compra · {formatBrl(totals.subtotal)}
                </Text>
              </View>
            </PressableScale>
          </View>
        </>
      )}

      <ImportListSheet
        visible={importOpen}
        onClose={() => setImportOpen(false)}
        onImport={importListText}
      />

      <KeyboardSafeSheet
        visible={addOpen}
        onClose={() => setAddOpen(false)}>
        <View style={styles.addItemForm}>
          <AppField
            compact
            value={itemDraft}
            onChangeText={setItemDraft}
            placeholder="Nome do item (ex.: Leite, Arroz…)"
            onSubmitEditing={() => addWrittenItem()}
            returnKeyType="done"
            autoFocus
          />
          {suggestedProducts.length > 0 ? (
            <View style={styles.suggestionsContainer}>
              <Text style={styles.suggestionsHeader}>Sugestões:</Text>
              <ScrollView
                nestedScrollEnabled
                keyboardShouldPersistTaps="handled"
                style={{maxHeight: 160}}
                showsVerticalScrollIndicator={false}>
                {suggestedProducts.map(p => (
                  <Pressable
                    key={p.id}
                    onPress={() => addWrittenItem(p.name, p.category)}
                    style={styles.suggestionRow}>
                    <View style={styles.suggestionLeft}>
                      <CategoryIcon name={p.category ?? 'Outros'} size={14} />
                      <Text style={styles.suggestionName} numberOfLines={1}>
                        {p.name}
                      </Text>
                    </View>
                    {p.category ? (
                      <Text style={styles.suggestionCat}>{p.category}</Text>
                    ) : null}
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          ) : null}
          <AppButton label="Adicionar" onPress={() => addWrittenItem()} />
        </View>
      </KeyboardSafeSheet>

      <KeyboardSafeSheet
        visible={limitModalOpen}
        onClose={() => setLimitModalOpen(false)}>
        <Text style={styles.modalTitle}>Limite de gasto da compra</Text>
        <Text style={styles.limitModalHint}>
          Defina um teto para acompanhar seus gastos em tempo real com barra de progresso.
        </Text>
        <AppField
          label="Valor limite (R$)"
          value={limitModalText}
          onChangeText={text => setLimitModalText(maskMoneyTyping(text))}
          placeholder="Ex.: 350,00"
          keyboardType="numeric"
          compact
          autoFocus
        />
        <View style={{flexDirection: 'row', gap: 10, marginTop: 4}}>
          {spendLimit != null && spendLimit > 0 ? (
            <AppButton
              label="Remover limite"
              outlined
              onPress={() => {
                prefs.setSpendLimit(null);
                refresh();
                setLimitModalOpen(false);
              }}
            />
          ) : null}
          <View style={{flex: 1}}>
            <AppButton
              label="Salvar limite"
              onPress={() => {
                const parsed = parseSpendLimit(limitModalText);
                if (parsed === 'invalid') {
                  appAlert('Valor inválido', 'Digite um valor numérico válido.');
                  return;
                }
                prefs.setSpendLimit(parsed);
                refresh();
                setLimitModalOpen(false);
              }}
            />
          </View>
        </View>
      </KeyboardSafeSheet>

      <KeyboardSafeSheet
        visible={renameCartOpen}
        onClose={() => setRenameCartOpen(false)}>
        <Text style={styles.modalTitle}>Renomear carrinho</Text>
        <AppField
          label="Nome da compra"
          value={renameCartText}
          onChangeText={setRenameCartText}
          placeholder="Ex.: Compras do mês"
          autoFocus
          compact
        />
        <AppButton
          label="Salvar nome"
          onPress={() => {
            const trimmed = renameCartText.trim();
            if (!trimmed) {
              appAlert('Nome inválido', 'Digite um nome para a compra.');
              return;
            }
            prefs.setActiveListName(trimmed);
            refresh();
            setRenameCartOpen(false);
          }}
        />
        <AppButton
          label="Cancelar"
          outlined
          onPress={() => setRenameCartOpen(false)}
        />
      </KeyboardSafeSheet>

      <KeyboardSafeSheet
        visible={editMarketOpen}
        onClose={() => setEditMarketOpen(false)}>
        <Text style={styles.modalTitle}>Alterar mercado</Text>
        <AppField
          label="Buscar ou cadastrar mercado"
          value={editMarketQuery}
          onChangeText={setEditMarketQuery}
          placeholder="Nome do mercado…"
          compact
          autoFocus
        />
        {editMarketQuery.trim().length >= 1 ? (
          <ScrollView
            nestedScrollEnabled
            keyboardShouldPersistTaps="handled"
            style={{maxHeight: 180, marginVertical: 6}}>
            {markets
              .filter(m =>
                m.name.toLowerCase().includes(editMarketQuery.trim().toLowerCase()),
              )
              .slice(0, 5)
              .map(m => (
                <Pressable
                  key={m.id}
                  onPress={() => {
                    prefs.setActiveMarketId(m.id);
                    prefs.setCurrentMarketId(m.id);
                    refresh();
                    setEditMarketOpen(false);
                  }}
                  style={styles.suggestionRow}>
                  <View style={styles.suggestionLeft}>
                    <MapPin size={14} color={colors.navy} />
                    <Text style={styles.suggestionName} numberOfLines={1}>
                      {m.name}
                    </Text>
                  </View>
                  {m.address ? (
                    <Text style={styles.suggestionCat} numberOfLines={1}>
                      {m.address.split(',')[0]}
                    </Text>
                  ) : null}
                </Pressable>
              ))}
          </ScrollView>
        ) : null}
        <AppButton
          label="Usar este mercado"
          onPress={() => {
            const q = editMarketQuery.trim();
            if (!q) {
              appAlert('Informe o mercado', 'Digite o nome do mercado.');
              return;
            }
            const m = marketRepo.resolveOrCreate(q);
            prefs.setActiveMarketId(m.id);
            prefs.setCurrentMarketId(m.id);
            refresh();
            setEditMarketOpen(false);
          }}
        />
        <AppButton
          label="Cancelar"
          outlined
          onPress={() => setEditMarketOpen(false)}
        />
      </KeyboardSafeSheet>

      <KeyboardSafeSheet
        visible={startOpen}
        onClose={() => {
          setStartOpen(false);
          setPickedMarketId(null);
          setStartStep('loading');
        }}>
        <Text style={styles.modalTitle}>Iniciar compra</Text>
        <AppField
          label="Nome da compra"
          value={listName}
          onChangeText={setListName}
          compact
        />
        {startStep === 'loading' ? (
          <View style={styles.discoverBox}>
            <ActivityIndicator color={colors.navy} />
            <Text style={styles.discoverText}>
              Buscando mercados próximos…
            </Text>
          </View>
        ) : null}
        {startStep === 'confirm' && pickedMarketId != null ? (
          <>
            <Text style={styles.confirmTitle}>
              Você está no{' '}
              {markets.find(m => m.id === pickedMarketId)?.name ??
                marketQuery}
              ?
            </Text>
            {(() => {
              const live = markets.find(x => x.id === pickedMarketId);
              if (!origin || live?.lat == null || live?.lng == null) {
                return null;
              }
              const km = haversineKm(origin, {
                lat: live.lat,
                lng: live.lng,
              });
              return (
                <Text style={styles.confirmDist}>
                  A cerca de {formatDistanceKm(km)}
                </Text>
              );
            })()}
            <AppButton
              label="Sim, estou aqui"
              onPress={() => {
                if (pickedMarketId == null) {
                  appAlert('Lista incompleta', 'Informe o nome da lista.');
                  return;
                }
                beginList(pickedMarketId);
              }}
            />
            <AppButton
              label="Outro mercado"
              outlined
              onPress={() => {
                setPickedMarketId(null);
                setMarketQuery('');
                setStartStep('pick');
              }}
            />
          </>
        ) : null}
        {startStep === 'pick' ? (
          <>
            {confirmHint ? (
              <Text style={styles.createHint}>{confirmHint}</Text>
            ) : null}
            <AppField
              label="Mercado"
              placeholder="Buscar mercado próximo…"
              value={marketQuery}
              onChangeText={t => {
                setMarketQuery(t);
                setPickedMarketId(null);
              }}
              compact
            />
            <Text style={styles.suggestLabel}>
              {marketQuery.trim()
                ? 'Resultados'
                : '3 mercados mais próximos'}
            </Text>
            {suggested.map(m => (
              <MarketSuggestRow
                key={m.id}
                market={m}
                highlight={pickedMarketId === m.id}
                onPress={() => {
                  setMarketQuery(m.name);
                  setPickedMarketId(m.id);
                }}
              />
            ))}
            {suggested.length === 0 ? (
              <Text style={styles.createHint}>
                Nenhum mercado próximo. Digite um nome para criar.
              </Text>
            ) : null}
            {canCreateMarket ? (
              <Text style={styles.createHint}>
                Será criado: "{marketQuery.trim()}"
              </Text>
            ) : null}
            {origin && marketQuery.trim() ? (
              <AppButton
                outlined
                label="Usar GPS neste nome"
                onPress={() => {
                  const q = marketQuery.trim();
                  const m = marketRepo.resolveOrCreateNear(
                    q,
                    origin.lat,
                    origin.lng,
                  );
                  marketRepo.upsertGeo(m.id, {
                    lat: origin.lat,
                    lng: origin.lng,
                  });
                  refresh();
                  setPickedMarketId(m.id);
                  setMarketQuery(m.name);
                  appAlert(
                    'Mercado no GPS',
                    'Pin local criado. Você pode começar a lista.',
                  );
                }}
              />
            ) : null}
            <AppButton
              label="Começar lista"
              onPress={() => {
                const name = listName.trim();
                const q = marketQuery.trim();
                if (!name || !q) {
                  appAlert(
                    'Lista incompleta',
                    'Informe nome da lista e mercado.',
                  );
                  return;
                }
                const market =
                  pickedMarketId != null
                    ? markets.find(m => m.id === pickedMarketId) ??
                      marketRepo.resolveOrCreate(q)
                    : marketRepo.resolveOrCreate(q);
                beginList(market.id);
              }}
            />
          </>
        ) : null}
        <AppButton
          label="Cancelar"
          outlined
          onPress={() => {
            setStartOpen(false);
            setPickedMarketId(null);
            setStartStep('loading');
          }}
        />
      </KeyboardSafeSheet>

      {editItem ? (
        <EditItemModal
          item={editItem}
          onClose={() => setEditItem(null)}
          onSave={data => {
            cartRepo.updateItem(editItem.id, data);
            if (data.productName !== editItem.productName) {
              productRepo.rename(editItem.productId, data.productName);
            }
            refresh();
            setEditItem(null);
          }}
        />
      ) : null}
    </View>
  );
}

function CartRow({
  item,
  muted,
  onEdit,
  onDelete,
  onToggle,
  onScan,
}: {
  item: CartItem;
  muted?: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: () => void;
  onScan: () => void;
}) {
  const refresh = useAppStore(s => s.refresh);
  const total = lineTotal(item);
  const priced = item.retailPrice > 0;
  const hasWholesale = item.wholesalePrice != null;
  const useWholesale = !!item.useWholesale && hasWholesale;

  const setMode = (wantWholesale: boolean) => {
    if (wantWholesale && !hasWholesale) {
      appAlert(
        'Preço de atacado',
        'Informe o preço de atacado no item para usar esse modo.',
        [
          {label: 'Agora não', style: 'cancel'},
          {label: 'Editar item', style: 'primary', onPress: onEdit},
        ],
      );
      return;
    }
    cartRepo.setUseWholesale(item.id, wantWholesale);
    refresh();
  };

  const priceCtx = useMemo(() => {
    if (!priced) return null;
    return priceLogRepo.cartContext(item.productId, item.retailPrice);
  }, [priced, item.productId, item.retailPrice]);

  return (
    <SwipeableActions dense onEdit={onEdit} onDelete={onDelete}>
      <Pressable
        onPress={priced ? onEdit : onScan}
        onLongPress={onToggle}
        style={[styles.rowCard, muted && priced && styles.cardDim]}>
        <View style={styles.rowBody}>
          <View style={styles.rowMain}>
            <Text
              style={[styles.itemName, muted && priced && {color: colors.muted}]}
              numberOfLines={1}>
              {item.productName}
            </Text>
            <Pressable
              onPress={onScan}
              hitSlop={6}
              style={styles.scanBtn}
              accessibilityLabel="Ler código de barras">
              <Barcode size={15} color={colors.navy} />
            </Pressable>
            {priced ? (
              <View style={styles.priceWrap}>
                {priceCtx?.previousPrice != null && priceCtx.previousPrice !== item.retailPrice ? (
                  item.retailPrice < priceCtx.previousPrice ? (
                    <TrendingDown size={13} color={colors.trustGreen} />
                  ) : (
                    <TrendingUp size={13} color={colors.danger} />
                  )
                ) : null}
                <Text style={[styles.price, muted && {opacity: 0.5}]}>
                  {formatBrl(total)}
                </Text>
              </View>
            ) : null}
          </View>
          {priced ? (
          <View style={styles.rowMeta}>
            <Text style={styles.metaText}>{qtyPhrase(item.quantity)}</Text>
            <View style={styles.modeSeg}>
              <Pressable
                onPress={() => setMode(false)}
                style={[
                  styles.modeSegBtn,
                  !useWholesale && styles.modeSegBtnOn,
                ]}
                accessibilityRole="button"
                accessibilityState={{selected: !useWholesale}}
                accessibilityLabel="Varejo">
                <Text
                  style={[
                    styles.modeSegText,
                    !useWholesale && styles.modeSegTextOn,
                  ]}>
                  Varejo
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setMode(true)}
                style={[
                  styles.modeSegBtn,
                  useWholesale && styles.modeSegBtnOn,
                ]}
                accessibilityRole="button"
                accessibilityState={{selected: useWholesale}}
                accessibilityLabel="Atacado">
                <Text
                  style={[
                    styles.modeSegText,
                    useWholesale && styles.modeSegTextOn,
                  ]}>
                  Atacado
                </Text>
              </Pressable>
            </View>
          </View>
          ) : null}
        </View>
      </Pressable>
    </SwipeableActions>
  );
}

function EditItemModal({
  item,
  onClose,
  onSave,
}: {
  item: CartItem;
  onClose: () => void;
  onSave: (d: {
    productName: string;
    quantity: number;
    retailPrice: number;
    wholesalePrice?: number | null;
    minWholesaleQty?: number | null;
  }) => void;
}) {
  const [name, setName] = useState(item.productName);
  const [qty, setQty] = useState(formatQty(item.quantity));
  const [retail, setRetail] = useState(item.retailPrice.toFixed(2));
  const [wholesale, setWholesale] = useState(
    item.wholesalePrice?.toFixed(2) ?? '',
  );
  const [minQty, setMinQty] = useState(
    item.minWholesaleQty != null ? formatQty(item.minWholesaleQty) : '',
  );

  return (
    <KeyboardSafeSheet visible onClose={onClose}>
      <Text style={styles.modalTitle}>Editar item</Text>
      <AppField label="Produto" value={name} onChangeText={setName} compact />
      <View style={{flexDirection: 'row', gap: 10}}>
        <AppField
          label="Qtd"
          value={qty}
          onChangeText={setQty}
          keyboardType="decimal-pad"
          compact
        />
        <AppField
          label="Preço varejo"
          value={retail}
          onChangeText={setRetail}
          keyboardType="decimal-pad"
          compact
        />
      </View>
      <View style={{flexDirection: 'row', gap: 10}}>
        <AppField
          label="Atacado (opc.)"
          value={wholesale}
          onChangeText={setWholesale}
          keyboardType="decimal-pad"
          compact
        />
        <AppField
          label="Qtd mín."
          value={minQty}
          onChangeText={setMinQty}
          keyboardType="decimal-pad"
          compact
        />
      </View>
      <AppButton
        label="Salvar"
        onPress={() => {
          const price = parseBrl(retail);
          const q = Number.parseFloat(qty.replace(',', '.'));
          if (!name.trim() || price == null || !q) {
            appAlert('Dados inválidos', 'Informe nome, quantidade e preço válidos.');
            return;
          }
          onSave({
            productName: name.trim(),
            quantity: q,
            retailPrice: price,
            wholesalePrice: wholesale.trim() ? parseBrl(wholesale) : null,
            minWholesaleQty: minQty.trim()
              ? Number.parseFloat(minQty.replace(',', '.'))
              : null,
          });
        }}
      />
      <AppButton label="Cancelar" outlined onPress={onClose} />
    </KeyboardSafeSheet>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: colors.bg},
  headerActions: {flexDirection: 'row', alignItems: 'center', gap: 8},
  menuCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: {width: 0, height: 2},
    elevation: 2,
  },
  summaryCard: {
    backgroundColor: '#fff',
    borderRadius: radii.xl,
    padding: space.md,
    marginBottom: space.xs,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: {width: 0, height: 2},
    elevation: 2,
    borderWidth: 1,
    borderColor: 'rgba(230, 235, 245, 0.9)',
  },
  summaryTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  summaryKicker: {
    fontSize: 10,
    fontWeight: '900',
    color: colors.muted,
    letterSpacing: 0.5,
  },
  summaryTotal: {
    fontSize: 26,
    fontWeight: '900',
    color: colors.navy,
    letterSpacing: -0.5,
  },
  summaryBadges: {
    alignItems: 'flex-end',
    gap: 4,
  },
  itemsBadge: {
    backgroundColor: '#F3F4F6',
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  itemsBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.navy,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: radii.pill,
    paddingHorizontal: 14,
    paddingVertical: 6,
    marginBottom: space.xs,
    marginTop: space.xs,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    height: 36,
    paddingVertical: 0,
    fontSize: 13,
    fontWeight: '600',
    color: colors.ink,
  },
  emptyList: {
    textAlign: 'center',
    color: colors.muted,
    fontSize: 13,
    fontWeight: '600',
    paddingVertical: space.lg,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginTop: 6,
    marginBottom: 4,
  },
  catBlock: {marginBottom: 6},
  catHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 3,
    paddingHorizontal: 2,
  },
  catTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.navy,
  },
  menuBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-start',
    alignItems: 'flex-end',
    paddingTop: 72,
    paddingHorizontal: 16,
  },
  menuCard: {
    minWidth: 220,
    backgroundColor: '#fff',
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 8,
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: {width: 0, height: 4},
  },
  menuTitle: {
    paddingHorizontal: 14,
    paddingBottom: 6,
    fontSize: 11,
    fontWeight: '800',
    color: colors.muted,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  menuItemText: {fontSize: 15, fontWeight: '700', color: colors.ink},
  list: {flex: 1},
  listPad: {paddingHorizontal: space.md, paddingTop: 4},
  scanBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
  },
  finalizeBar: {
    paddingHorizontal: 20,
    paddingTop: 4,
    backgroundColor: 'transparent',
  },
  finalizeBtnPill: {
    backgroundColor: colors.navy,
    borderRadius: radii.pill,
    paddingVertical: 10,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: {width: 0, height: 3},
    elevation: 4,
  },
  finalizeBtnText: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 14,
  },
  rowCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginBottom: 4,
    shadowColor: '#000',
    shadowOpacity: 0.02,
    shadowRadius: 3,
    shadowOffset: {width: 0, height: 1},
    elevation: 1,
    borderWidth: 1,
    borderColor: 'rgba(235, 240, 248, 0.7)',
  },
  cardDim: {opacity: 0.55},
  rowBody: {flex: 1, minWidth: 0, gap: 2},
  rowMain: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  priceWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  rowMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 4,
  },
  itemName: {
    flex: 1,
    fontWeight: '800',
    color: colors.navy,
    fontSize: 13,
  },
  price: {fontWeight: '900', color: colors.navy, fontSize: 13},
  metaText: {fontSize: 10.5, fontWeight: '700', color: colors.muted},
  modeSeg: {
    flexDirection: 'row',
    backgroundColor: colors.bg,
    borderRadius: radii.pill,
    padding: 1,
    gap: 1,
  },
  modeSegBtn: {
    paddingHorizontal: 7,
    paddingVertical: 1.5,
    borderRadius: radii.pill,
  },
  modeSegBtnOn: {backgroundColor: colors.yellow},
  modeSegText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: colors.muted,
  },
  modeSegTextOn: {color: colors.navy},
  modalTitle: {fontSize: 18, fontWeight: '800', color: colors.navy},
  limitModalHint: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.muted,
    lineHeight: 18,
    marginBottom: 6,
  },
  suggestLabel: {
    marginTop: 4,
    marginBottom: 6,
    fontSize: 12,
    fontWeight: '800',
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  createHint: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.navy,
    marginBottom: 4,
  },
  discoverBox: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 24,
  },
  discoverText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.muted,
  },
  confirmTitle: {
    marginTop: 8,
    marginBottom: 4,
    fontSize: 17,
    fontWeight: '800',
    color: colors.navy,
    lineHeight: 24,
  },
  confirmDist: {
    marginBottom: 12,
    fontSize: 13,
    fontWeight: '700',
    color: colors.muted,
  },
  suggestionsContainer: {
    backgroundColor: colors.white,
    borderRadius: radii.md,
    padding: 8,
    marginTop: -2,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 4,
  },
  suggestionsHeader: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 4,
    paddingHorizontal: 4,
  },
  suggestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 7,
    paddingHorizontal: 8,
    borderRadius: radii.sm,
    backgroundColor: colors.bg,
  },
  suggestionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    marginRight: 8,
  },
  suggestionName: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.navy,
    flex: 1,
  },
  suggestionCat: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.muted,
    backgroundColor: colors.white,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  addItemForm: {
    gap: 8,
  },
});

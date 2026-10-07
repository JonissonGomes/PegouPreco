import React, {useEffect, useMemo, useState} from 'react';
import {
  ActivityIndicator,
  LayoutAnimation,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  UIManager,
  View,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import Geolocation from 'react-native-geolocation-service';
import {
  ClipboardList,
  History,
  MoreVertical,
  RefreshCw,
  ScanLine,
  Trash2,
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
import {colors, radii, space, spacing} from '@/ui/theme';

if (
  Platform.OS === 'android' &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}
import {formatBrl, formatQty, parseBrl} from '@/domain/money';
import {lineTotal} from '@/domain/pricing';
import {
  formatDistanceKm,
  pickConfirmCandidate,
  rankNearestMarkets,
} from '@/domain/marketUi';
import {
  cartRepo,
  prefs,
  productRepo,
  useAppStore,
  useMarketName,
} from '@/store/appStore';
import type {CartItem} from '@/data/types';
import {runFullSync} from '@/data/syncWorker';
import {marketRepo} from '@/data/repositories';
import {ensureNearbyMarketsDiscovered} from '@/data/remote/ensureNearbyMarkets';
import {haversineKm} from '@/data/remote/nearbyMarkets';
import {MAPBOX_ACCESS_TOKEN} from '@/config/env';

function qtyPhrase(qty: number) {
  const n = formatQty(qty);
  return qty === 1 ? `${n} un` : `${n} un`;
}

export function CartScreen() {
  const nav = useNavigation<any>();
  const cart = useAppStore(s => s.cart);
  const refresh = useAppStore(s => s.refresh);
  const finalize = useAppStore(s => s.finalize);
  const startList = useAppStore(s => s.startList);
  const activeListName = useAppStore(s => s.activeListName);
  const activeMarketId = useAppStore(s => s.activeMarketId);
  const markets = useAppStore(s => s.markets);
  const marketName = useMarketName(activeMarketId);
  const [editItem, setEditItem] = useState<CartItem | null>(null);
  const [startOpen, setStartOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [listName, setListName] = useState('Compras de hoje');
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

  const totals = useMemo(() => cartRepo.computeTotals(cart), [cart]);
  const selectedCount = totals.checkedCount;
  const bottomPad = spacing.bottomNavClearance;
  const inCart = useMemo(
    () => cart.filter(i => i.checkedOff),
    [cart],
  );
  const missing = useMemo(
    () => cart.filter(i => !i.checkedOff),
    [cart],
  );
  const progress =
    totals.itemCount > 0 ? selectedCount / totals.itemCount : 0;

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

  useEffect(() => {
    if (!startOpen) return;
    let cancelled = false;
    setStartStep('loading');
    setConfirmHint(null);
    setPickedMarketId(null);
    setMarketQuery('');

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

  return (
    <View style={styles.root}>
      <SoftHeader
        title={activeListName || 'Lista de compras'}
        subtitle={
          activeListName
            ? marketName || 'Mercado não definido'
            : 'Inicie uma lista para capturar'
        }
        trailing={
          <Pressable
            onPress={() => setMenuOpen(true)}
            style={styles.menuCircle}
            accessibilityLabel="Menu da lista">
            <MoreVertical color={colors.navy} size={20} />
          </Pressable>
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
              onPress={() => runMenuAction(goCapture)}>
              <ScanLine size={18} color={colors.navy} />
              <Text style={styles.menuItemText}>Escanear item</Text>
            </Pressable>
            <Pressable
              style={styles.menuItem}
              onPress={() =>
                runMenuAction(() => nav.navigate('ShoppingLists'))
              }>
              <ClipboardList size={18} color={colors.navy} />
              <Text style={styles.menuItemText}>Listas salvas</Text>
            </Pressable>
            <Pressable
              style={styles.menuItem}
              onPress={() => runMenuAction(() => nav.navigate('History'))}>
              <History size={18} color={colors.navy} />
              <Text style={styles.menuItemText}>Histórico</Text>
            </Pressable>
            <Pressable
              style={styles.menuItem}
              onPress={() =>
                runMenuAction(async () => {
                  const r = await runFullSync();
                  appAlert(r.ok ? 'Sync' : 'Falha', r.message);
                })
              }>
              <RefreshCw size={18} color={colors.navy} />
              <Text style={styles.menuItemText}>Sincronizar</Text>
            </Pressable>
            <Pressable
              style={styles.menuItem}
              onPress={() =>
                runMenuAction(() =>
                  appAlert(
                    'Limpar carrinho?',
                    'Todos os itens serão removidos.',
                    [
                      {label: 'Cancelar', style: 'cancel'},
                      {
                        label: 'Limpar',
                        style: 'destructive',
                        onPress: () => {
                          cartRepo.clear();
                          refresh();
                        },
                      },
                    ],
                  ),
                )
              }>
              <Trash2 size={18} color={colors.danger} />
              <Text style={[styles.menuItemText, {color: colors.danger}]}>
                Limpar lista
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
      {cart.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>
            {activeListName ? 'Carrinho vazio' : 'Nenhuma lista ativa'}
          </Text>
          <Text style={styles.emptyMsg}>
            {activeListName
              ? 'Capture uma etiqueta para adicionar itens.'
              : 'Inicie uma lista de compras para começar.'}
          </Text>
          <AppButton
            icon={
              activeListName ? (
                <ScanLine size={20} color="#fff" />
              ) : undefined
            }
            label={activeListName ? 'Escanear item' : 'Nova lista'}
            onPress={goCapture}
          />
        </View>
      ) : (
        <>
          <ScrollView
            contentContainerStyle={[
              styles.listPad,
              {paddingBottom: bottomPad + 72},
            ]}>
            <SoftCard style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>
                Total no carrinho · {selectedCount} de {totals.itemCount}{' '}
                itens
              </Text>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryTotal}>
                  {formatBrl(totals.subtotal)}
                </Text>
                {totals.savings > 0 ? (
                  <SavePill label={`Atacado: -${formatBrl(totals.savings)}`} />
                ) : null}
              </View>
              <ProgressBar progress={progress} height={8} />
            </SoftCard>

            {inCart.length > 0 ? (
              <>
                <Text style={styles.sectionTitle}>No carrinho</Text>
                {inCart.map(item => (
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
                              LayoutAnimation.configureNext(
                                LayoutAnimation.Presets.easeInEaseOut,
                              );
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
                  />
                ))}
              </>
            ) : null}

            {missing.length > 0 ? (
              <>
                <Text style={styles.sectionTitle}>
                  Faltam · {missing.length}
                </Text>
                {missing.map(item => (
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
                              LayoutAnimation.configureNext(
                                LayoutAnimation.Presets.easeInEaseOut,
                              );
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
                  />
                ))}
              </>
            ) : null}
          </ScrollView>
          <View style={[styles.finalizeBar, {paddingBottom: bottomPad}]}>
            <AppButton
              label={`Finalizar compra · ${formatBrl(totals.subtotal)}`}
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
                          appAlert('Pronto', 'Lista salva no histórico');
                        }
                      },
                    },
                  ],
                );
              }}
            />
          </View>
        </>
      )}

      <KeyboardSafeSheet
        visible={startOpen}
        onClose={() => {
          setStartOpen(false);
          setPickedMarketId(null);
          setStartStep('loading');
        }}>
        <Text style={styles.modalTitle}>Nova lista de compras</Text>
        <AppField
          label="Nome da lista"
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
                const name = listName.trim();
                if (!name || pickedMarketId == null) {
                  appAlert('Lista incompleta', 'Informe o nome da lista.');
                  return;
                }
                startList(name, pickedMarketId);
                setStartOpen(false);
                setPickedMarketId(null);
                setStartStep('loading');
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
                startList(name, market.id);
                setStartOpen(false);
                setPickedMarketId(null);
                setStartStep('loading');
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
}: {
  item: CartItem;
  muted?: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: () => void;
}) {
  const refresh = useAppStore(s => s.refresh);
  const total = lineTotal(item);
  const hasWholesale = item.wholesalePrice != null;
  const useWholesale = !!item.useWholesale && hasWholesale;

  return (
    <SwipeableActions dense onEdit={onEdit} onDelete={onDelete}>
      <Pressable
        onPress={onEdit}
        onLongPress={onToggle}
        style={[styles.rowCard, muted && styles.cardDim]}>
        <View style={styles.rowBody}>
          <View style={styles.rowMain}>
            <Text
              style={[styles.itemName, muted && {color: colors.muted}]}
              numberOfLines={2}>
              {item.productName}
            </Text>
            <Text style={[styles.price, muted && {opacity: 0.5}]}>
              {formatBrl(total)}
            </Text>
          </View>
          <View style={styles.rowMeta}>
            <Text style={styles.metaText}>{qtyPhrase(item.quantity)} ·</Text>
            {hasWholesale ? (
              <Pressable
                onPress={() => {
                  cartRepo.setUseWholesale(item.id, !useWholesale);
                  refresh();
                }}
                style={[
                  styles.wholesalePill,
                  useWholesale && styles.wholesalePillOn,
                ]}>
                <Text
                  style={[
                    styles.wholesalePillText,
                    useWholesale && styles.wholesalePillTextOn,
                  ]}>
                  {useWholesale ? 'Atacado' : 'Varejo'}
                </Text>
              </Pressable>
            ) : (
              <Text style={styles.metaText}>Varejo</Text>
            )}
          </View>
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
  summaryCard: {marginBottom: space.md, gap: 10},
  summaryLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.muted,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 10,
  },
  summaryTotal: {
    fontSize: 32,
    fontWeight: '900',
    color: colors.navy,
    letterSpacing: -0.5,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: colors.navy,
    marginBottom: space.sm,
    marginTop: space.xs,
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
  listPad: {paddingHorizontal: space.md, paddingTop: 4},
  empty: {flex: 1, justifyContent: 'center', padding: 24, gap: 12},
  emptyTitle: {fontSize: 20, fontWeight: '800', color: colors.navy},
  emptyMsg: {color: colors.muted, marginBottom: 8},
  finalizeBar: {
    paddingHorizontal: 16,
    paddingTop: 8,
    backgroundColor: colors.bg,
  },
  rowCard: {
    backgroundColor: '#fff',
    borderRadius: radii.xl,
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    marginBottom: space.sm,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: {width: 0, height: 2},
    elevation: 1,
  },
  cardDim: {opacity: 0.55},
  rowBody: {flex: 1, minWidth: 0, gap: 6},
  rowMain: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  rowMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  itemName: {
    flex: 1,
    fontWeight: '900',
    color: colors.navy,
    fontSize: 15,
  },
  price: {fontWeight: '900', color: colors.navy, fontSize: 16},
  metaText: {fontSize: 12, fontWeight: '600', color: colors.muted},
  wholesalePill: {
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 3,
    backgroundColor: colors.bg,
  },
  wholesalePillOn: {backgroundColor: colors.yellow},
  wholesalePillText: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.muted,
  },
  wholesalePillTextOn: {color: colors.navy},
  modalTitle: {fontSize: 18, fontWeight: '800', color: colors.navy},
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
});

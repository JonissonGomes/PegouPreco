import React, {useEffect, useMemo, useState} from 'react';
import {
  LayoutAnimation,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  UIManager,
  View,
} from 'react-native';
import {FlatList} from 'react-native-gesture-handler';
import {useNavigation} from '@react-navigation/native';
import Geolocation from 'react-native-geolocation-service';
import {
  Check,
  ClipboardList,
  History,
  Menu,
  RefreshCw,
  ScanLine,
  Trash2,
} from 'lucide-react-native';
import {
  AppButton,
  AppCartTotalsBar,
  AppField,
  AppScreenHeader,
} from '@/ui/chrome';
import {appAlert} from '@/ui/appDialog';
import {KeyboardSafeSheet} from '@/ui/keyboardSheet';
import {MarketSuggestRow} from '@/ui/MarketSuggestRow';
import {SwipeableActions} from '@/ui/SwipeableActions';
import {colors, radii, spacing} from '@/ui/theme';

if (
  Platform.OS === 'android' &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}
import {formatBrl, formatQty, parseBrl} from '@/domain/money';
import {effectiveUnitPrice, lineTotal} from '@/domain/pricing';
import {rankNearestMarkets} from '@/domain/marketUi';
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

  const totals = useMemo(() => cartRepo.computeTotals(cart), [cart]);
  const selectedCount = totals.checkedCount;
  const bottomPad = spacing.bottomNavClearance;

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
    const last = prefs.getLastLocation();
    if (last) setOrigin(last);
    Geolocation.getCurrentPosition(
      pos => {
        const next = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        };
        prefs.setLastLocation(next.lat, next.lng);
        setOrigin(next);
      },
      () => {
        // mantém última posição
      },
      {enableHighAccuracy: false, timeout: 10000, maximumAge: 60000},
    );
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
      <AppScreenHeader
        showLogo={false}
        title={activeListName || 'Lista de compras'}
        subtitle={
          activeListName
            ? marketName || 'Mercado não definido'
            : 'Inicie uma lista para capturar'
        }
        actions={
          <Pressable
            onPress={() => setMenuOpen(true)}
            style={styles.headerIcon}
            accessibilityLabel="Menu da lista">
            <Menu color={colors.navy} size={22} />
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
      {cart.length > 0 ? (
        <AppCartTotalsBar
          compact
          value={formatBrl(totals.subtotal)}
          retailLabel={formatBrl(totals.retailTotal)}
          wholesaleLabel={formatBrl(totals.wholesaleTotal)}
          savingsLabel={
            totals.savings > 0
              ? `${formatBrl(totals.savings)} econ.`
              : 'sem economia'
          }
          itemsLabel={`${selectedCount}/${totals.itemCount}`}
        />
      ) : null}

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
          <FlatList
            data={cart}
            keyExtractor={i => String(i.id)}
            contentContainerStyle={styles.listPad}
            renderItem={({item}) => (
              <CartRow
                item={item}
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
            )}
          />
          <View style={[styles.finalizeBar, {paddingBottom: bottomPad}]}>
            <AppButton
              icon={<Check size={20} color="#fff" />}
              label={`Finalizar · ${formatBrl(totals.subtotal)}`}
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
        }}>
        <Text style={styles.modalTitle}>Nova lista de compras</Text>
        <AppField
          label="Nome da lista"
          value={listName}
          onChangeText={setListName}
          compact
        />
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
        <AppButton
          label="Começar lista"
          onPress={() => {
            const name = listName.trim();
            const q = marketQuery.trim();
            if (!name || !q) {
              appAlert('Lista incompleta', 'Informe nome da lista e mercado.');
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
          }}
        />
        <AppButton
          label="Cancelar"
          outlined
          onPress={() => {
            setStartOpen(false);
            setPickedMarketId(null);
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
  onEdit,
  onDelete,
  onToggle,
}: {
  item: CartItem;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: () => void;
}) {
  const refresh = useAppStore(s => s.refresh);
  const selected = !!item.checkedOff;
  const total = lineTotal(item);
  const hasWholesale = item.wholesalePrice != null;
  const useWholesale = !!item.useWholesale && hasWholesale;

  return (
    <SwipeableActions dense onEdit={onEdit} onDelete={onDelete}>
      <Pressable
        onPress={onEdit}
        style={[styles.rowCard, !selected && styles.cardDim]}>
        <Pressable
          onPress={onToggle}
          style={[styles.check, selected ? styles.checkOn : null]}
          hitSlop={6}
          accessibilityLabel={
            selected ? 'Remover do total' : 'Incluir no total'
          }>
          {selected ? <Check size={12} color="#fff" strokeWidth={3} /> : null}
        </Pressable>

        <View style={styles.rowBody}>
          <View style={styles.rowMain}>
            <Text
              style={[styles.itemName, !selected && {color: colors.muted}]}
              numberOfLines={1}>
              {item.productName}
            </Text>
            <Text style={[styles.price, !selected && {opacity: 0.45}]}>
              {formatBrl(total)}
            </Text>
          </View>
          <View style={styles.rowMeta}>
            <Text style={styles.metaText}>
              {qtyPhrase(item.quantity)} · {formatBrl(effectiveUnitPrice(item))}
            </Text>
            {hasWholesale ? (
              <View style={styles.modeSeg}>
                <Pressable
                  style={[styles.modeBtn, !useWholesale && styles.modeBtnOn]}
                  onPress={() => {
                    cartRepo.setUseWholesale(item.id, false);
                    refresh();
                  }}>
                  <Text
                    style={[
                      styles.modeBtnText,
                      !useWholesale && styles.modeBtnTextOn,
                    ]}>
                    V
                  </Text>
                </Pressable>
                <Pressable
                  style={[styles.modeBtn, useWholesale && styles.modeBtnOnAt]}
                  onPress={() => {
                    cartRepo.setUseWholesale(item.id, true);
                    refresh();
                  }}>
                  <Text
                    style={[
                      styles.modeBtnText,
                      useWholesale && styles.modeBtnTextOn,
                    ]}>
                    A
                  </Text>
                </Pressable>
              </View>
            ) : (
              <Text style={styles.metaText}>varejo</Text>
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
  headerIcon: {padding: 8},
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
  listPad: {paddingHorizontal: 12, paddingTop: 8, paddingBottom: 8},
  empty: {flex: 1, justifyContent: 'center', padding: 24, gap: 12},
  emptyTitle: {fontSize: 20, fontWeight: '800', color: colors.navy},
  emptyMsg: {color: colors.muted, marginBottom: 8},
  finalizeBar: {
    paddingHorizontal: 16,
    paddingTop: 8,
    backgroundColor: colors.bg,
  },
  rowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#fff',
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  cardDim: {opacity: 0.55},
  check: {
    width: 22,
    height: 22,
    borderWidth: 2,
    borderColor: 'rgba(11,42,107,0.25)',
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  checkOn: {
    backgroundColor: colors.navy,
    borderColor: colors.navy,
  },
  rowBody: {flex: 1, minWidth: 0, gap: 2},
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
    fontWeight: '700',
    color: colors.ink,
    fontSize: 14,
  },
  price: {fontWeight: '800', color: colors.navy, fontSize: 14},
  metaText: {fontSize: 11, fontWeight: '600', color: colors.muted},
  modeSeg: {
    flexDirection: 'row',
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  modeBtn: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    backgroundColor: colors.bg,
  },
  modeBtnOn: {backgroundColor: '#EEF2FF'},
  modeBtnOnAt: {backgroundColor: colors.yellowBright},
  modeBtnText: {fontSize: 11, fontWeight: '800', color: colors.muted},
  modeBtnTextOn: {color: colors.navy},
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
});

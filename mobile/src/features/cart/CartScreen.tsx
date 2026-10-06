import React, {useEffect, useMemo, useState} from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import Geolocation from 'react-native-geolocation-service';
import {
  Check,
  ClipboardList,
  History,
  Pencil,
  RefreshCw,
  Trash2,
} from 'lucide-react-native';
import {
  AppButton,
  AppCartTotalsBar,
  AppField,
  AppListCard,
  AppScreenHeader,
} from '@/ui/chrome';
import {KeyboardSafeSheet} from '@/ui/keyboardSheet';
import {MarketSuggestRow} from '@/ui/MarketSuggestRow';
import {colors, spacing} from '@/ui/theme';
import {formatBrl, formatQty, parseBrl} from '@/domain/money';
import {effectiveUnitPrice, lineTotal} from '@/domain/pricing';
import {rankNearestMarkets} from '@/domain/marketUi';
import {
  cartRepo,
  prefs,
  priceLogRepo,
  productRepo,
  useAppStore,
  useMarketName,
} from '@/store/appStore';
import type {CartItem} from '@/data/types';
import {runFullSync} from '@/data/syncWorker';
import {marketRepo} from '@/data/repositories';

function qtyPhrase(qty: number) {
  const n = formatQty(qty);
  return qty === 1 ? `${n} unidade` : `${n} unidades`;
}

const MONTHS = [
  'jan.', 'fev.', 'mar.', 'abr.', 'mai.', 'jun.',
  'jul.', 'ago.', 'set.', 'out.', 'nov.', 'dez.',
];

export function CartScreen() {
  const nav = useNavigation<any>();
  const cart = useAppStore(s => s.cart);
  const refresh = useAppStore(s => s.refresh);
  const finalize = useAppStore(s => s.finalize);
  const startList = useAppStore(s => s.startList);
  const activeListName = useAppStore(s => s.activeListName);
  const activeMarketId = useAppStore(s => s.activeMarketId);
  const markets = useAppStore(s => s.markets);
  const navVisible = useAppStore(s => s.bottomNavVisible);
  const setNavVisible = useAppStore(s => s.setNavVisible);
  const marketName = useMarketName(activeMarketId);
  const [editItem, setEditItem] = useState<CartItem | null>(null);
  const [startOpen, setStartOpen] = useState(false);
  const [listName, setListName] = useState('Compras de hoje');
  const [marketQuery, setMarketQuery] = useState('');
  const [origin, setOrigin] = useState<{lat: number; lng: number} | null>(
    () => prefs.getLastLocation(),
  );
  const [pickedMarketId, setPickedMarketId] = useState<number | null>(null);

  const totals = useMemo(() => cartRepo.computeTotals(cart), [cart]);
  const pending = totals.itemCount - totals.checkedCount;
  const bottomPad = navVisible ? spacing.bottomNavClearance : 16;

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
        stacked
        title={activeListName || 'Nova lista'}
        subtitle={marketName || 'Mercado não definido'}
        actions={
          <View style={styles.headerActions}>
            <Pressable
              onPress={() => nav.navigate('ShoppingLists')}
              style={styles.headerIcon}
              accessibilityLabel="Listas salvas">
              <ClipboardList color={colors.navy} size={20} />
            </Pressable>
            <Pressable
              onPress={() => nav.navigate('History')}
              style={styles.headerIcon}
              accessibilityLabel="Histórico">
              <History color={colors.navy} size={20} />
            </Pressable>
            <Pressable
              onPress={async () => {
                const r = await runFullSync();
                Alert.alert(r.ok ? 'Sync' : 'Falha', r.message);
              }}
              style={styles.headerIcon}
              accessibilityLabel="Sincronizar">
              <RefreshCw color={colors.navy} size={20} />
            </Pressable>
            <Pressable
              onPress={() =>
                Alert.alert('Limpar carrinho?', 'Todos os itens serão removidos.', [
                  {text: 'Cancelar', style: 'cancel'},
                  {
                    text: 'Limpar',
                    style: 'destructive',
                    onPress: () => {
                      cartRepo.clear();
                      refresh();
                    },
                  },
                ])
              }
              style={styles.headerIcon}
              accessibilityLabel="Limpar lista">
              <Trash2 color={colors.navy} size={20} />
            </Pressable>
          </View>
        }
      />
      {cart.length > 0 ? (
        <AppCartTotalsBar
          value={formatBrl(totals.subtotal)}
          savingsLabel={`${formatBrl(totals.savings)} economizados`}
          itemsLabel={`${totals.checkedCount} / ${totals.itemCount} ITENS`}
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
            label={activeListName ? 'Ir para Capturar' : 'Nova lista'}
            onPress={() =>
              activeListName ? nav.navigate('Capture') : setStartOpen(true)
            }
          />
        </View>
      ) : (
        <>
          <View style={styles.sectionRow}>
            <Text style={styles.section}>Itens da lista</Text>
            <Text style={styles.muted}>{pending} pendentes</Text>
          </View>
          <FlatList
            data={cart}
            keyExtractor={i => String(i.id)}
            contentContainerStyle={{padding: 16, paddingBottom: 8}}
            onScroll={e => {
              const y = e.nativeEvent.contentOffset.y;
              if (y > 40 && navVisible) setNavVisible(false);
              if (y < 8 && !navVisible) setNavVisible(true);
            }}
            scrollEventThrottle={16}
            renderItem={({item}) => (
              <CartRow item={item} onEdit={() => setEditItem(item)} onToggle={() => {
                cartRepo.toggleChecked(item.id);
                refresh();
              }} />
            )}
          />
          <View style={[styles.finalizeBar, {paddingBottom: bottomPad}]}>
            <AppButton
              icon={<Check size={20} color="#fff" />}
              label={`Finalizar compras · ${formatBrl(totals.subtotal)}`}
              onPress={() => {
                if (!activeListName) {
                  setStartOpen(true);
                  return;
                }
                Alert.alert('Finalizar compras?', 'A lista será salva no histórico.', [
                  {text: 'Cancelar', style: 'cancel'},
                  {
                    text: 'Finalizar',
                    onPress: () => {
                      if (finalize()) {
                        Alert.alert('Pronto', 'Lista salva no histórico');
                      }
                    },
                  },
                ]);
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
              Alert.alert('Informe nome da lista e mercado');
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
  onToggle,
}: {
  item: CartItem;
  onEdit: () => void;
  onToggle: () => void;
}) {
  const refresh = useAppStore(s => s.refresh);
  const activeMarketId = useAppStore(s => s.activeMarketId);
  const unit = effectiveUnitPrice(item);
  const total = lineTotal(item);
  const ctx = priceLogRepo.cartContext(item.productId, unit, activeMarketId);
  const previous = ctx.previousPrice;
  const best = ctx.bestPrice;
  const pct =
    previous != null && previous > 0
      ? ((previous - unit) / previous) * 100
      : null;
  const canSwap =
    best != null &&
    ctx.bestMarketName != null &&
    best + 0.05 < unit &&
    (ctx.bestMarketId == null || ctx.bestMarketId !== activeMarketId);
  const swapSave = canSwap && best != null ? (unit - best) * item.quantity : 0;

  return (
    <AppListCard style={canSwap ? styles.cardSwap : undefined}>
      <View style={styles.row}>
        <Pressable
          onPress={onToggle}
          style={[styles.check, item.checkedOff ? styles.checkOn : null]}>
          {item.checkedOff ? <Check size={14} color="#fff" strokeWidth={3} /> : null}
        </Pressable>
        <View style={{flex: 1}}>
          <View style={styles.itemTop}>
            <View style={{flex: 1, minWidth: 0}}>
              <Text
                style={[
                  styles.itemName,
                  item.checkedOff
                    ? {textDecorationLine: 'line-through', color: colors.muted}
                    : null,
                ]}>
                {item.productName}
              </Text>
              <Text style={styles.muted}>
                {qtyPhrase(item.quantity)} · {formatBrl(unit)}
              </Text>
            </View>
            <View style={{alignItems: 'flex-end'}}>
              <View style={{flexDirection: 'row', alignItems: 'center'}}>
                <Text style={styles.price}>{formatBrl(total)}</Text>
                <Pressable onPress={onEdit} hitSlop={8} style={{marginLeft: 4}}>
                  <Pencil size={15} color={colors.navy} />
                </Pressable>
              </View>
              {pct != null && pct >= 1 ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>
                    {pct.toFixed(0)}% abaixo da última
                  </Text>
                </View>
              ) : null}
            </View>
          </View>

          {(previous != null || (best != null && best + 0.009 < unit)) &&
          !canSwap ? (
            <View style={styles.compareRow}>
              {previous != null ? (
                <View style={styles.compareBox}>
                  <Text style={styles.compareLabel}>Compra anterior</Text>
                  <Text style={styles.compareValue} numberOfLines={1}>
                    {formatBrl(previous)}
                    {ctx.previousAt
                      ? ` · ${MONTHS[new Date(ctx.previousAt).getMonth()]}`
                      : ''}
                  </Text>
                </View>
              ) : null}
              {best != null && best + 0.009 < unit ? (
                <View style={[styles.compareBox, styles.compareHi]}>
                  <Text style={[styles.compareLabel, {color: colors.navy}]}>
                    Menor preço
                  </Text>
                  <Text
                    style={[styles.compareValue, {fontWeight: '800'}]}
                    numberOfLines={1}>
                    {formatBrl(best)}
                    {ctx.bestMarketName ? ` · ${ctx.bestMarketName}` : ''}
                  </Text>
                </View>
              ) : null}
            </View>
          ) : null}

          {canSwap && best != null ? (
            <View style={styles.swapBanner}>
              <View style={{flex: 1}}>
                <Text style={styles.swapTitle} numberOfLines={1}>
                  {formatBrl(best)} no {ctx.bestMarketName}
                </Text>
                <Text style={styles.swapSub}>
                  Economize {formatBrl(swapSave)} nesta compra
                </Text>
              </View>
              <Pressable
                style={styles.swapBtn}
                onPress={() => {
                  cartRepo.updateItem(item.id, {
                    productName: item.productName,
                    quantity: item.quantity,
                    retailPrice: best,
                    wholesalePrice: item.wholesalePrice,
                    minWholesaleQty: item.minWholesaleQty,
                  });
                  refresh();
                }}>
                <Text style={styles.swapBtnText}>Trocar</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      </View>
    </AppListCard>
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
            Alert.alert('Informe nome, quantidade e preço válidos');
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
  headerActions: {flexDirection: 'row', alignItems: 'center'},
  headerIcon: {padding: 8},
  sectionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 4,
  },
  section: {fontWeight: '800', color: colors.ink, fontSize: 18},
  muted: {color: colors.muted, fontWeight: '500', fontSize: 12, marginTop: 4},
  empty: {flex: 1, justifyContent: 'center', padding: 24, gap: 12},
  emptyTitle: {fontSize: 20, fontWeight: '800', color: colors.navy},
  emptyMsg: {color: colors.muted, marginBottom: 8},
  finalizeBar: {
    paddingHorizontal: 16,
    paddingTop: 8,
    backgroundColor: colors.bg,
  },
  row: {flexDirection: 'row', alignItems: 'flex-start', gap: 12},
  itemTop: {flexDirection: 'row', alignItems: 'flex-start', gap: 12},
  check: {
    width: 24,
    height: 24,
    marginTop: 2,
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
  itemName: {fontWeight: '600', color: colors.ink, fontSize: 15, lineHeight: 20},
  price: {fontWeight: '800', color: colors.ink, fontSize: 18},
  badge: {
    marginTop: 4,
    backgroundColor: 'rgba(22,163,74,0.1)',
    overflow: 'hidden',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgeText: {
    color: colors.trustGreen,
    fontSize: 9,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  compareRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(229,231,235,0.7)',
  },
  compareBox: {
    flex: 1,
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    padding: 8,
  },
  compareHi: {
    backgroundColor: '#FFF8E1',
    borderWidth: 1,
    borderColor: 'rgba(255,212,0,0.5)',
  },
  compareLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: colors.muted,
    textTransform: 'uppercase',
  },
  compareValue: {fontSize: 11, fontWeight: '600', color: colors.ink, marginTop: 2},
  cardSwap: {
    borderLeftWidth: 4,
    borderLeftColor: colors.yellowBright,
  },
  swapBanner: {
    marginTop: 12,
    backgroundColor: colors.yellowBright,
    borderRadius: 8,
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  swapTitle: {fontSize: 11, fontWeight: '800', color: colors.navy},
  swapSub: {fontSize: 11, fontWeight: '600', color: colors.navy, marginTop: 2},
  swapBtn: {
    backgroundColor: colors.navy,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  swapBtnText: {color: '#fff', fontWeight: '800', fontSize: 12},
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
  createHint: {fontSize: 12, fontWeight: '700', color: colors.navy, marginBottom: 4},
});

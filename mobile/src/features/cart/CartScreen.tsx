import React, {useMemo, useState} from 'react';
import {
  Alert,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {Pencil, MoreHorizontal} from 'lucide-react-native';
import {
  AppButton,
  AppField,
  AppListCard,
  AppScreenHeader,
  AppScreenNavyBar,
} from '@/ui/chrome';
import {colors, spacing} from '@/ui/theme';
import {formatBrl, formatQty, parseBrl} from '@/domain/money';
import {effectiveUnitPrice, lineTotal} from '@/domain/pricing';
import {
  cartRepo,
  priceLogRepo,
  productRepo,
  useAppStore,
  useMarketName,
} from '@/store/appStore';
import type {CartItem} from '@/data/types';
import {runFullSync} from '@/data/syncWorker';
import {marketRepo} from '@/data/repositories';

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
  const [menuOpen, setMenuOpen] = useState(false);
  const [editItem, setEditItem] = useState<CartItem | null>(null);
  const [startOpen, setStartOpen] = useState(false);
  const [listName, setListName] = useState('Compras de hoje');
  const [marketQuery, setMarketQuery] = useState('');

  const totals = useMemo(() => cartRepo.computeTotals(cart), [cart]);
  const pending = totals.itemCount - totals.checkedCount;
  const bottomPad = navVisible ? spacing.bottomNavClearance : 16;

  const filteredMarkets = markets.filter(m =>
    m.name.toLowerCase().includes(marketQuery.trim().toLowerCase()),
  );
  const canCreateMarket =
    marketQuery.trim().length > 0 &&
    !markets.some(
      m => m.name.toLowerCase() === marketQuery.trim().toLowerCase(),
    );

  return (
    <View style={styles.root}>
      <AppScreenHeader
        title={activeListName || 'Nova lista'}
        subtitle={marketName || 'Mercado não definido'}
        actions={
          <Pressable onPress={() => setMenuOpen(true)} style={styles.fabIcon}>
            <MoreHorizontal color={colors.navy} size={22} />
          </Pressable>
        }
      />
      {cart.length > 0 ? (
        <AppScreenNavyBar
          value={formatBrl(totals.subtotal)}
          label={`total · ${totals.checkedCount}/${totals.itemCount} itens`}
          trailing={
            <View style={styles.pill}>
              <Text style={styles.pillText}>{formatBrl(totals.savings)}</Text>
            </View>
          }
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
          <View style={{paddingHorizontal: 16, paddingBottom: bottomPad}}>
            <AppButton
              label={`Finalizar · ${formatBrl(totals.subtotal)}`}
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

      <Modal visible={menuOpen} transparent animationType="fade">
        <Pressable style={styles.backdrop} onPress={() => setMenuOpen(false)}>
          <View style={styles.sheet}>
            {[
              {label: 'Listas salvas', action: () => nav.navigate('ShoppingLists')},
              {label: 'Histórico de preços', action: () => nav.navigate('History')},
              {
                label: 'Sincronizar',
                action: async () => {
                  const r = await runFullSync();
                  Alert.alert(r.ok ? 'Sync' : 'Falha', r.message);
                },
              },
              {
                label: 'Limpar carrinho',
                action: () => {
                  cartRepo.clear();
                  refresh();
                },
              },
            ].map(opt => (
              <Pressable
                key={opt.label}
                style={styles.sheetItem}
                onPress={() => {
                  setMenuOpen(false);
                  opt.action();
                }}>
                <Text style={styles.sheetText}>{opt.label}</Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>

      <Modal visible={startOpen} transparent animationType="slide">
        <View style={styles.modalRoot}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Nova lista de compras</Text>
            <AppField
              label="Nome da lista"
              value={listName}
              onChangeText={setListName}
              compact
            />
            <AppField
              label="Mercado"
              placeholder="Buscar ou criar mercado…"
              value={marketQuery}
              onChangeText={setMarketQuery}
              compact
            />
            {filteredMarkets.slice(0, 6).map(m => (
              <Pressable
                key={m.id}
                style={styles.marketRow}
                onPress={() => setMarketQuery(m.name)}>
                <Text style={styles.marketName}>{m.name}</Text>
              </Pressable>
            ))}
            {canCreateMarket ? (
              <Text style={styles.createHint}>Será criado: "{marketQuery.trim()}"</Text>
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
                const market = marketRepo.resolveOrCreate(q);
                startList(name, market.id);
                setStartOpen(false);
              }}
            />
            <AppButton
              label="Cancelar"
              outlined
              onPress={() => setStartOpen(false)}
            />
          </View>
        </View>
      </Modal>

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
  const unit = effectiveUnitPrice(item);
  const total = lineTotal(item);
  const ctx = priceLogRepo.cartContext(
    item.productId,
    unit,
    useAppStore.getState().activeMarketId,
  );
  const previous = ctx.previousPrice;
  const best = ctx.bestPrice;
  const pct =
    previous != null && previous > 0
      ? ((previous - unit) / previous) * 100
      : null;

  return (
    <AppListCard>
      <View style={styles.row}>
        <Pressable onPress={onToggle} style={styles.check}>
          <Text>{item.checkedOff ? '✓' : ''}</Text>
        </Pressable>
        <View style={{flex: 1}}>
          <Text
            style={[
              styles.itemName,
              item.checkedOff && {textDecorationLine: 'line-through'},
            ]}>
            {item.productName}
          </Text>
          <Text style={styles.muted}>
            {formatQty(item.quantity)} un · {formatBrl(unit)}/un
          </Text>
        </View>
        <View style={{alignItems: 'flex-end'}}>
          <View style={{flexDirection: 'row', alignItems: 'center'}}>
            <Text style={styles.price}>{formatBrl(total)}</Text>
            <Pressable onPress={onEdit} hitSlop={8}>
              <Pencil size={16} color={colors.navy} />
            </Pressable>
          </View>
          {pct != null && pct >= 1 ? (
            <Text style={styles.badge}>{pct.toFixed(0)}% ABAIXO</Text>
          ) : null}
        </View>
      </View>
      {(previous != null || (best != null && best + 0.009 < unit)) && (
        <View style={styles.compareRow}>
          {previous != null ? (
            <View style={styles.compareBox}>
              <Text style={styles.compareLabel}>COMPRA ANTERIOR</Text>
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
              <Text style={styles.compareLabel}>MENOR PREÇO</Text>
              <Text style={styles.compareValue} numberOfLines={1}>
                {formatBrl(best)}
                {ctx.bestMarketName ? ` · ${ctx.bestMarketName}` : ''}
              </Text>
            </View>
          ) : null}
        </View>
      )}
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
    <Modal visible transparent animationType="slide">
      <View style={styles.modalRoot}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>Editar item</Text>
          <AppField label="Produto" value={name} onChangeText={setName} compact />
          <View style={{flexDirection: 'row', gap: 10}}>
            <AppField label="Qtd" value={qty} onChangeText={setQty} keyboardType="decimal-pad" compact />
            <AppField label="Preço varejo" value={retail} onChangeText={setRetail} keyboardType="decimal-pad" compact />
          </View>
          <View style={{flexDirection: 'row', gap: 10}}>
            <AppField label="Atacado (opc.)" value={wholesale} onChangeText={setWholesale} keyboardType="decimal-pad" compact />
            <AppField label="Qtd mín." value={minQty} onChangeText={setMinQty} keyboardType="decimal-pad" compact />
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
                wholesalePrice: wholesale.trim()
                  ? parseBrl(wholesale)
                  : null,
                minWholesaleQty: minQty.trim()
                  ? Number.parseFloat(minQty.replace(',', '.'))
                  : null,
              });
            }}
          />
          <AppButton label="Cancelar" outlined onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: colors.bg},
  fabIcon: {padding: 8},
  pill: {
    backgroundColor: colors.yellowBright,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  pillText: {color: colors.navy, fontWeight: '800', fontSize: 11},
  sectionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  section: {fontWeight: '800', color: colors.navy, fontSize: 15},
  muted: {color: colors.muted, fontWeight: '600', fontSize: 12},
  empty: {flex: 1, justifyContent: 'center', padding: 24, gap: 12},
  emptyTitle: {fontSize: 20, fontWeight: '800', color: colors.navy},
  emptyMsg: {color: colors.muted, marginBottom: 8},
  row: {flexDirection: 'row', alignItems: 'flex-start', gap: 8},
  check: {
    width: 28,
    height: 28,
    borderWidth: 1.6,
    borderColor: '#93C5FD',
    borderRadius: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemName: {fontWeight: '800', color: colors.navy, fontSize: 14},
  price: {fontWeight: '800', color: colors.navy, fontSize: 16, marginRight: 4},
  badge: {
    marginTop: 4,
    backgroundColor: '#DCFCE7',
    color: '#166534',
    fontSize: 9,
    fontWeight: '800',
    overflow: 'hidden',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
  },
  compareRow: {flexDirection: 'row', gap: 8, marginTop: 10},
  compareBox: {
    flex: 1,
    backgroundColor: '#F3F4F6',
    borderRadius: 10,
    padding: 8,
  },
  compareHi: {
    backgroundColor: '#FFF3C4',
    borderWidth: 1.2,
    borderColor: '#F59E0B',
  },
  compareLabel: {fontSize: 10, fontWeight: '700', color: colors.muted},
  compareValue: {fontSize: 12, fontWeight: '800', color: colors.navy},
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 8,
    paddingBottom: 24,
  },
  sheetItem: {padding: 16},
  sheetText: {fontWeight: '700', color: colors.navy, fontSize: 16},
  modalRoot: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 16,
    gap: 8,
  },
  modalTitle: {fontSize: 18, fontWeight: '800', color: colors.navy},
  marketRow: {
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    marginBottom: 6,
  },
  marketName: {fontWeight: '700', color: colors.navy},
  createHint: {fontSize: 12, fontWeight: '700', color: colors.navy},
});

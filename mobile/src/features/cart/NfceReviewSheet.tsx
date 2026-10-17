import React, {useEffect, useState} from 'react';
import {ScrollView, StyleSheet, Text, View} from 'react-native';
import {Check} from 'lucide-react-native';
import {AppButton} from '@/ui/chrome';
import {KeyboardSafeSheet} from '@/ui/keyboardSheet';
import {colors, radii} from '@/ui/theme';
import {formatBrl, formatQty} from '@/domain/money';
import {guessCategory} from '@/domain/productCategory';
import {CategoryIcon} from '@/features/history/categoryIcon';
import type {NfceDraft} from '@/data/archivePurchase';

function dateToField(iso: string | null): string {
  const d = iso ? new Date(iso) : new Date();
  if (Number.isNaN(d.getTime())) return '';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${day}/${month}/${d.getFullYear()}`;
}

export function NfceReviewSheet({
  draft,
  saving,
  onClose,
  onSave,
  saveLabel = 'Salvar no histórico',
  hint = 'Confira os itens antes de salvar no histórico.',
}: {
  draft: NfceDraft | null;
  saving: boolean;
  onClose: () => void;
  onSave: (purchasedAt: string) => void;
  saveLabel?: string;
  hint?: string;
}) {
  const [issuedAt, setIssuedAt] = useState<string | null>(null);
  const items = draft?.parsed.items ?? [];
  const total = draft?.subtotal ?? 0;

  useEffect(() => {
    setIssuedAt(draft?.parsed.issuedAt ?? null);
  }, [draft]);

  const save = () => {
    const iso =
      issuedAt && !Number.isNaN(Date.parse(issuedAt))
        ? issuedAt
        : new Date().toISOString();
    onSave(iso);
  };

  return (
    <KeyboardSafeSheet visible={draft != null} onClose={onClose}>
      {draft ? (
        <View style={styles.ticket}>
          <View style={styles.badge}>
            <Check size={22} color={colors.navy} />
          </View>
          <Text style={styles.title}>Nota lida</Text>
          <Text style={styles.sub}>{hint}</Text>
          <View style={styles.dash} />
          <View style={styles.facts}>
            <View style={{flex: 1}}>
              <Text style={styles.factLabel}>Mercado</Text>
              <Text style={styles.factValue} numberOfLines={2}>
                {draft.parsed.marketName || 'Nota fiscal'}
              </Text>
            </View>
            <View>
              <Text style={styles.factLabel}>Total</Text>
              <Text style={styles.factValue}>{formatBrl(total)}</Text>
            </View>
          </View>
          <Text style={styles.factLabel}>Data da compra</Text>
          <Text style={styles.dateValue}>{dateToField(issuedAt)}</Text>

          <ScrollView style={styles.list} nestedScrollEnabled>
            {items.map((it, index) => (
              <View key={`${it.description}-${index}`} style={styles.row}>
                <CategoryIcon name={guessCategory(it.description)} size={14} />
                <View style={{flex: 1, minWidth: 0}}>
                  <Text style={styles.name} numberOfLines={2}>
                    {it.description}
                  </Text>
                  <Text style={styles.qty}>
                    Quant. {formatQty(it.quantity)} × {formatBrl(it.unitPrice)}
                  </Text>
                </View>
                <Text style={styles.line}>
                  {formatBrl(it.quantity * it.unitPrice)}
                </Text>
              </View>
            ))}
          </ScrollView>

          <AppButton
            label={saving ? 'Salvando…' : saveLabel}
            disabled={saving}
            onPress={save}
          />
          <AppButton label="Agora não" outlined onPress={onClose} />
        </View>
      ) : null}
    </KeyboardSafeSheet>
  );
}

const styles = StyleSheet.create({
  ticket: {backgroundColor: colors.white, borderRadius: 24, gap: 8},
  badge: {
    alignSelf: 'center',
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.yellow,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  title: {textAlign: 'center', fontSize: 22, fontWeight: '900', color: colors.ink},
  sub: {textAlign: 'center', color: colors.muted, fontWeight: '600', lineHeight: 20},
  dash: {
    borderTopWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
    marginVertical: 6,
  },
  facts: {flexDirection: 'row', gap: 12},
  factLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.muted,
    letterSpacing: 0.4,
  },
  factValue: {fontWeight: '900', color: colors.navy, fontSize: 15, marginTop: 2},
  dateValue: {
    height: 48,
    borderRadius: radii.lg,
    backgroundColor: colors.bg,
    paddingHorizontal: 14,
    fontSize: 16,
    fontWeight: '800',
    color: colors.ink,
    lineHeight: 48,
  },
  list: {maxHeight: 220, marginTop: 4},
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  name: {fontWeight: '800', color: colors.navy, fontSize: 14},
  qty: {marginTop: 2, fontSize: 12, fontWeight: '600', color: colors.muted},
  line: {fontWeight: '900', color: colors.navy},
});

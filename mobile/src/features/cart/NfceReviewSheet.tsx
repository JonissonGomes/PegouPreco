import React from 'react';
import {ScrollView, StyleSheet, Text, View} from 'react-native';
import {AppButton} from '@/ui/chrome';
import {KeyboardSafeSheet} from '@/ui/keyboardSheet';
import {colors, space} from '@/ui/theme';
import {formatBrl, formatQty} from '@/domain/money';
import {guessCategory} from '@/domain/productCategory';
import type {NfceDraft} from '@/data/archivePurchase';

function formatWhen(iso: string | null): string {
  if (!iso) return 'Data da nota';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Data da nota';
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function NfceReviewSheet({
  draft,
  saving,
  onClose,
  onSave,
}: {
  draft: NfceDraft | null;
  saving: boolean;
  onClose: () => void;
  onSave: () => void;
}) {
  const items = draft?.parsed.items ?? [];
  return (
    <KeyboardSafeSheet visible={draft != null} onClose={onClose}>
      {draft ? (
        <>
          <Text style={styles.title}>
            {draft.parsed.marketName || 'Nota fiscal'}
          </Text>
          <Text style={styles.meta}>
            {formatWhen(draft.parsed.issuedAt)} · {items.length} itens
          </Text>
          <Text style={styles.total}>{formatBrl(draft.subtotal)}</Text>
          <ScrollView style={styles.list}>
            {items.map((it, index) => (
              <View key={`${it.description}-${index}`} style={styles.row}>
                <View style={{flex: 1, minWidth: 0}}>
                  <Text style={styles.name} numberOfLines={2}>
                    {it.description}
                  </Text>
                  <Text style={styles.qty}>
                    {guessCategory(it.description)} · {formatQty(it.quantity)} ×{' '}
                    {formatBrl(it.unitPrice)}
                  </Text>
                </View>
                <Text style={styles.line}>
                  {formatBrl(it.quantity * it.unitPrice)}
                </Text>
              </View>
            ))}
          </ScrollView>
          <Text style={styles.ask}>Salvar esta compra no histórico?</Text>
          <AppButton
            label={saving ? 'Salvando…' : 'Salvar no histórico'}
            disabled={saving}
            onPress={onSave}
          />
          <AppButton label="Agora não" outlined onPress={onClose} />
        </>
      ) : null}
    </KeyboardSafeSheet>
  );
}

const styles = StyleSheet.create({
  title: {fontSize: 20, fontWeight: '900', color: colors.navy},
  meta: {marginTop: 4, color: colors.muted, fontWeight: '600'},
  total: {
    marginTop: 8,
    marginBottom: 8,
    fontSize: 28,
    fontWeight: '900',
    color: colors.navy,
  },
  list: {maxHeight: 280},
  row: {
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  name: {fontWeight: '800', color: colors.navy, fontSize: 15},
  qty: {marginTop: 2, color: colors.muted, fontWeight: '600', fontSize: 12},
  line: {fontWeight: '900', color: colors.navy},
  ask: {
    marginTop: space.md,
    marginBottom: space.sm,
    fontWeight: '800',
    color: colors.navy,
  },
});

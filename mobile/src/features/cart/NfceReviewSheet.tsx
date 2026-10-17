import React, {useEffect, useState} from 'react';
import {Pressable, ScrollView, StyleSheet, Text, TextInput, View} from 'react-native';
import {Check} from 'lucide-react-native';
import {AppButton} from '@/ui/chrome';
import {KeyboardSafeSheet} from '@/ui/keyboardSheet';
import {colors, radii, space} from '@/ui/theme';
import {formatBrl, formatQty} from '@/domain/money';
import {guessCategory} from '@/domain/productCategory';
import type {NfceDraft} from '@/data/archivePurchase';

function maskDate(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}
function dateToField(iso: string | null): string {
  const d = iso ? new Date(iso) : new Date();
  if (Number.isNaN(d.getTime())) return '';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${day}/${month}/${d.getFullYear()}`;
}

function fieldToIso(text: string): string | null {
  const match = text.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(year, month - 1, day, 12, 0, 0, 0);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date.toISOString();
}

const RATE_STEPS = [
  'Salve esta nota no histórico.',
  'Abra o mercado no mapa.',
  'Toque em Avaliar mercado.',
  'Dê a nota de 1 a 5. Só quem cadastrou a nota pode avaliar.',
];

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
  const [guide, setGuide] = useState(false);
  const [dateText, setDateText] = useState('');
  const [dateError, setDateError] = useState('');
  const items = draft?.parsed.items ?? [];
  const total = draft?.subtotal ?? 0;

  useEffect(() => {
    setDateText(dateToField(draft?.parsed.issuedAt ?? null));
    setDateError('');
    setGuide(false);
  }, [draft]);

  const save = () => {
    const iso = fieldToIso(dateText);
    if (!iso) {
      setDateError('Use o formato dd/mm/aaaa.');
      return;
    }
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
          <TextInput
            value={dateText}
            onChangeText={text => {
              setDateText(maskDate(text));
              setDateError('');
            }}
            placeholder="dd/mm/aaaa"
            placeholderTextColor={colors.muted}
            keyboardType="number-pad"
            maxLength={10}
            style={styles.dateInput}
          />
          {dateError ? <Text style={styles.dateError}>{dateError}</Text> : null}

          <ScrollView style={styles.list} nestedScrollEnabled>
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

          <Pressable style={styles.guideBtn} onPress={() => setGuide(v => !v)}>
            <Text style={styles.guideBtnText}>Como avaliar o mercado</Text>
          </Pressable>
          {guide ? (
            <View style={styles.steps}>
              {RATE_STEPS.map((step, i) => (
                <Text key={step} style={styles.step}>
                  {i + 1}. {step}
                </Text>
              ))}
            </View>
          ) : null}

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
  ticket: {
    backgroundColor: colors.white,
    borderRadius: 24,
    gap: 8,
  },
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
  title: {
    textAlign: 'center',
    fontSize: 22,
    fontWeight: '900',
    color: colors.ink,
  },
  sub: {
    textAlign: 'center',
    color: colors.muted,
    fontWeight: '600',
    lineHeight: 20,
  },
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
  dateInput: {
    height: 48,
    borderRadius: radii.lg,
    backgroundColor: colors.bg,
    paddingHorizontal: 14,
    fontSize: 16,
    fontWeight: '800',
    color: colors.ink,
  },
  dateError: {color: colors.danger, fontWeight: '700', fontSize: 12},
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
  guideBtn: {
    alignSelf: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: radii.pill,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  guideBtnText: {fontWeight: '800', color: colors.navy, fontSize: 13},
  steps: {
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    padding: space.md,
    gap: 6,
  },
  step: {fontWeight: '600', color: colors.ink, lineHeight: 20},
});

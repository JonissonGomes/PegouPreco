import React, {useEffect, useMemo, useState} from 'react';
import {StyleSheet, Text, TextInput, View} from 'react-native';
import {AppButton} from '@/ui/chrome';
import {KeyboardSafeSheet} from '@/ui/keyboardSheet';
import {colors, radii, space} from '@/ui/theme';
import {
  parseShoppingListText,
  summarizeParsedList,
} from '@/domain/parseShoppingListText';

export function ImportListSheet({
  visible,
  onClose,
  onImport,
}: {
  visible: boolean;
  onClose: () => void;
  onImport: (text: string) => void;
}) {
  const [text, setText] = useState('');

  useEffect(() => {
    if (visible) setText('');
  }, [visible]);

  const preview = useMemo(() => {
    const items = parseShoppingListText(text);
    return summarizeParsedList(items);
  }, [text]);

  return (
    <KeyboardSafeSheet visible={visible} onClose={onClose}>
      <Text style={styles.title}>Importar lista</Text>
      <Text style={styles.hint}>
        Cole a lista ou o conteúdo de um arquivo .txt. Quantidades e categorias
        são reconhecidas automaticamente.
      </Text>
      <TextInput
        value={text}
        onChangeText={setText}
        placeholder={`Arroz\n2 Macarrões\n3 molhos de tomate\nChá (erva-doce, camomila)`}
        placeholderTextColor={colors.muted}
        multiline
        textAlignVertical="top"
        style={styles.input}
      />
      {preview.itemCount > 0 ? (
        <Text style={styles.preview}>
          {preview.itemCount} itens · {preview.categoryCount} categorias
        </Text>
      ) : (
        <Text style={styles.previewMuted}>Nenhum item reconhecido ainda</Text>
      )}
      <View style={styles.actions}>
        <AppButton label="Cancelar" outlined onPress={onClose} />
        <AppButton
          label="Adicionar ao carrinho"
          disabled={preview.itemCount === 0}
          onPress={() => {
            onImport(text);
            onClose();
          }}
        />
      </View>
    </KeyboardSafeSheet>
  );
}

const styles = StyleSheet.create({
  title: {fontSize: 22, fontWeight: '900', color: colors.navy},
  hint: {
    color: colors.muted,
    fontWeight: '600',
    fontSize: 13,
    lineHeight: 18,
  },
  input: {
    minHeight: 180,
    maxHeight: 280,
    borderRadius: radii.lg,
    backgroundColor: colors.bg,
    padding: space.md,
    color: colors.ink,
    fontWeight: '600',
    fontSize: 14,
    lineHeight: 20,
  },
  preview: {fontWeight: '800', color: colors.navy, fontSize: 13},
  previewMuted: {fontWeight: '600', color: colors.muted, fontSize: 13},
  actions: {gap: 8},
});

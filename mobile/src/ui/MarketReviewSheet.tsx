import React, {useEffect, useState} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {Store} from 'lucide-react-native';
import {AppButton} from '@/ui/chrome';
import {KeyboardSafeSheet} from '@/ui/keyboardSheet';
import {StarPicker} from '@/ui/gamification';
import {colors, radii, space} from '@/ui/theme';

const LABELS = ['', 'Ruim', 'Fraco', 'Ok', 'Bom', 'Excelente'];

export function MarketReviewSheet({
  visible,
  marketName,
  busy,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  marketName: string;
  busy?: boolean;
  onClose: () => void;
  onSubmit: (stars: number) => void | Promise<void>;
}) {
  const [stars, setStars] = useState(0);

  useEffect(() => {
    if (visible) setStars(0);
  }, [visible, marketName]);

  return (
    <KeyboardSafeSheet visible={visible} onClose={onClose}>
      <View style={styles.hero}>
        <View style={styles.icon}>
          <Store size={22} color={colors.navy} />
        </View>
        <View style={{flex: 1}}>
          <Text style={styles.kicker}>Missão · Avaliar mercado</Text>
          <Text style={styles.title} numberOfLines={2}>
            {marketName}
          </Text>
        </View>
      </View>

      <Text style={styles.hint}>
        Sua nota ajuda a comunidade a escolher onde comprar. Vale +5 pts.
      </Text>

      <StarPicker value={stars} onChange={setStars} />

      <View style={styles.labelBox}>
        <Text style={styles.labelText}>
          {stars > 0 ? LABELS[stars] : 'Toque nas estrelas'}
        </Text>
        {stars > 0 ? (
          <View style={styles.ptsPill}>
            <Text style={styles.ptsText}>+5 pts</Text>
          </View>
        ) : null}
      </View>

      <AppButton
        label={busy ? 'Enviando…' : 'Enviar avaliação'}
        disabled={busy || stars < 1}
        onPress={() => onSubmit(stars)}
      />
      <AppButton label="Agora não" outlined onPress={onClose} />
    </KeyboardSafeSheet>
  );
}

const styles = StyleSheet.create({
  hero: {flexDirection: 'row', alignItems: 'center', gap: 12},
  icon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: colors.yellowBright,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kicker: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  title: {
    marginTop: 2,
    fontSize: 20,
    fontWeight: '800',
    color: colors.navy,
    letterSpacing: -0.3,
  },
  hint: {
    marginTop: 4,
    color: colors.muted,
    fontWeight: '600',
    fontSize: 13,
    lineHeight: 18,
  },
  labelBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: space.sm,
  },
  labelText: {fontWeight: '800', color: colors.navy, fontSize: 16},
  ptsPill: {
    backgroundColor: colors.yellowBright,
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  ptsText: {fontWeight: '900', color: colors.navy, fontSize: 12},
});

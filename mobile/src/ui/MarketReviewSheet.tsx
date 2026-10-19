import React, {useEffect, useState} from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {Store} from 'lucide-react-native';
import {AppButton} from '@/ui/chrome';
import {KeyboardSafeSheet} from '@/ui/keyboardSheet';
import {StarPicker} from '@/ui/gamification';
import {colors, radii, space} from '@/ui/theme';
import {reviewTagsForStars} from '@/domain/marketReviewTags';

const LABELS = ['', 'Ruim', 'Fraco', 'Ok', 'Bom', 'Excelente'];

export function MarketReviewForm({
  marketName,
  busy,
  onClose,
  onSubmit,
}: {
  marketName: string;
  busy?: boolean;
  onClose: () => void;
  onSubmit: (stars: number, tags: string[]) => void | Promise<void>;
}) {
  const [stars, setStars] = useState(0);
  const [tags, setTags] = useState<string[]>([]);
  const groups = reviewTagsForStars(stars);

  useEffect(() => {
    setStars(0);
    setTags([]);
  }, [marketName]);

  const pickStars = (value: number) => {
    setStars(value);
    const allowed = new Set([
      ...reviewTagsForStars(value).positive,
      ...reviewTagsForStars(value).negative,
    ]);
    setTags(current => current.filter(tag => allowed.has(tag)));
  };

  const toggle = (tag: string) => {
    setTags(current =>
      current.includes(tag) ? current.filter(item => item !== tag) : [...current, tag],
    );
  };

  return (
    <>
      <View style={styles.hero}>
        <View style={styles.icon}>
          <Store size={22} color={colors.navy} />
        </View>
        <View style={{flex: 1}}>
          <Text style={styles.kicker}>Avaliar mercado</Text>
          <Text style={styles.title} numberOfLines={2}>
            {marketName}
          </Text>
        </View>
      </View>

      <Text style={styles.hint}>
        Sua nota ajuda a comunidade a escolher onde comprar. Vale +5 pts.
      </Text>

      <StarPicker value={stars} onChange={pickStars} />

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

      {groups.positive.length > 0 ? (
        <TagGroup
          title="O que foi bom"
          tags={groups.positive}
          selected={tags}
          onToggle={toggle}
        />
      ) : null}
      {groups.negative.length > 0 ? (
        <TagGroup
          title="O que pode melhorar"
          tags={groups.negative}
          selected={tags}
          onToggle={toggle}
        />
      ) : null}

      <AppButton
        label={busy ? 'Enviando…' : 'Enviar avaliação'}
        disabled={busy || stars < 1}
        onPress={() => onSubmit(stars, tags)}
      />
      <AppButton label="Agora não" outlined onPress={onClose} />
    </>
  );
}

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
  onSubmit: (stars: number, tags: string[]) => void | Promise<void>;
}) {
  return (
    <KeyboardSafeSheet visible={visible} onClose={onClose}>
      {visible ? (
        <MarketReviewForm
          marketName={marketName}
          busy={busy}
          onClose={onClose}
          onSubmit={onSubmit}
        />
      ) : null}
    </KeyboardSafeSheet>
  );
}

function TagGroup({
  title,
  tags,
  selected,
  onToggle,
}: {
  title: string;
  tags: readonly string[];
  selected: string[];
  onToggle: (tag: string) => void;
}) {
  return (
    <View style={styles.group}>
      <Text style={styles.groupTitle}>{title}</Text>
      <View style={styles.pills}>
        {tags.map(tag => {
          const on = selected.includes(tag);
          return (
            <Pressable
              key={tag}
              onPress={() => onToggle(tag)}
              style={[styles.pill, on && styles.pillOn]}>
              <Text style={[styles.pillText, on && styles.pillTextOn]}>{tag}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
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
  group: {gap: 8},
  groupTitle: {fontWeight: '800', color: colors.navy, fontSize: 13},
  pills: {flexDirection: 'row', flexWrap: 'wrap', gap: 8},
  pill: {
    borderRadius: radii.pill,
    backgroundColor: colors.bg,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  pillOn: {backgroundColor: colors.navy},
  pillText: {fontWeight: '800', color: colors.ink, fontSize: 13},
  pillTextOn: {color: colors.white},
});

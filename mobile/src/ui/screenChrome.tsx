import React from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {TrustEngine} from '@/domain/trust';
import type {FiscalLevel} from '@/data/types';
import {colors, radii, space, spacing, typography} from './theme';

export function SoftCard({
  children,
  onPress,
  style,
  muted,
}: {
  children: React.ReactNode;
  onPress?: () => void;
  style?: ViewStyle;
  /** Estilo atenuado (itens pendentes). */
  muted?: boolean;
}) {
  const inner = (
    <View style={[styles.card, muted && styles.cardMuted, style]}>
      {children}
    </View>
  );
  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({pressed}) => pressed && {opacity: 0.92}}>
        {inner}
      </Pressable>
    );
  }
  return inner;
}

/** Chip compacto do nível Fiscal (header à direita). */
export function FiscalChip({
  level,
  points,
  accessibilityLabel,
}: {
  level: FiscalLevel;
  points: number;
  accessibilityLabel?: string;
}) {
  return (
    <View
      style={styles.fiscalChip}
      accessibilityLabel={
        accessibilityLabel ??
        `Fiscal ${TrustEngine.fiscalLabel(level)}, ${points} pontos`
      }>
      <Text style={styles.fiscalChipLevel}>
        {TrustEngine.fiscalLabel(level)}
      </Text>
      <Text style={styles.fiscalChipPts}>{points} pts</Text>
    </View>
  );
}

export function SoftHeader({
  location,
  title,
  subtitle,
  leading,
  trailing,
}: {
  location?: string;
  title: string;
  subtitle?: string;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.header, {paddingTop: insets.top + space.sm}]}>
      <View style={styles.titleRow}>
        {leading}
        <View style={styles.titleBlock}>
          <Text style={styles.title} numberOfLines={2}>
            {title}
          </Text>
          {location ? (
            <Text style={styles.location} numberOfLines={1}>
              {location}
            </Text>
          ) : null}
          {subtitle ? (
            <Text style={styles.subtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
      </View>
    </View>
  );
}

export function BackCircleButton({
  onPress,
  children,
}: {
  onPress: () => void;
  children: React.ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={styles.circleBtn}
      hitSlop={8}
      accessibilityRole="button">
      {children}
    </Pressable>
  );
}

export function SavePill({
  label,
  tone = 'green',
}: {
  label: string;
  tone?: 'green' | 'orange';
}) {
  return (
    <View
      style={[
        styles.savePill,
        tone === 'orange' ? styles.savePillOrange : styles.savePillGreen,
      ]}>
      <Text
        style={[
          styles.savePillText,
          tone === 'orange' && styles.savePillTextOrange,
        ]}>
        {label}
      </Text>
    </View>
  );
}

export function ProgressBar({
  progress,
  height = 6,
  trackColor = colors.border,
  fillColor = colors.yellow,
}: {
  progress: number;
  height?: number;
  trackColor?: string;
  fillColor?: string;
}) {
  const pct = Math.min(1, Math.max(0, progress));
  return (
    <View style={[styles.progressTrack, {height, backgroundColor: trackColor}]}>
      <View
        style={[
          styles.progressFill,
          {width: `${pct * 100}%`, backgroundColor: fillColor, height},
        ]}
      />
    </View>
  );
}

export function ScreenScrollPad({
  children,
  /** Quando o rodapé da tela já reserva espaço (ex.: Como funciona sticky). */
  compactBottom,
}: {
  children: React.ReactNode;
  compactBottom?: boolean;
}) {
  return (
    <View
      style={{
        paddingBottom: compactBottom ? space.md : spacing.bottomNavClearance,
      }}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: space.md,
    paddingBottom: space.sm,
    backgroundColor: colors.bg,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.sm,
  },
  titleBlock: {flex: 1, minWidth: 0},
  trailing: {paddingTop: 4, alignItems: 'flex-end'},
  fiscalChip: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.yellow,
    borderRadius: radii.pill,
    paddingHorizontal: 14,
    paddingVertical: 8,
    minWidth: 88,
  },
  fiscalChipLevel: {
    fontWeight: '900',
    color: colors.navy,
    fontSize: 13,
    lineHeight: 16,
  },
  fiscalChipPts: {
    fontWeight: '700',
    color: colors.navy,
    fontSize: 11,
    opacity: 0.8,
    marginTop: 1,
  },
  location: {
    marginTop: 2,
    fontSize: 13,
    fontWeight: '600',
    color: colors.muted,
  },
  title: {
    ...typography.titleLg,
    color: colors.navy,
    lineHeight: 32,
  },
  subtitle: {
    marginTop: 2,
    fontSize: 14,
    fontWeight: '600',
    color: colors.muted,
  },
  circleBtn: {
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
  card: {
    backgroundColor: colors.white,
    borderRadius: radii.xl,
    padding: space.md,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: {width: 0, height: 2},
    elevation: 2,
  },
  cardMuted: {opacity: 0.55},
  savePill: {
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  savePillGreen: {backgroundColor: '#DCFCE7'},
  savePillOrange: {backgroundColor: '#FFEDD5'},
  savePillText: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.trustGreen,
  },
  savePillTextOrange: {color: '#C2410C'},
  progressTrack: {
    borderRadius: radii.pill,
    overflow: 'hidden',
    width: '100%',
  },
  progressFill: {borderRadius: radii.pill},
});

import React from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
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
  const titleBesideActions = !leading && !location && !!trailing;

  return (
    <View style={[styles.header, {paddingTop: insets.top + space.sm}]}>
      {location ? (
        <Text style={styles.location} numberOfLines={1}>
          {location}
        </Text>
      ) : null}
      {leading ? (
        <View style={styles.titleRow}>
          {leading}
          <View style={{flex: 1, minWidth: 0}}>
            <Text style={styles.title} numberOfLines={2}>
              {title}
            </Text>
            {subtitle ? (
              <Text style={styles.subtitle} numberOfLines={1}>
                {subtitle}
              </Text>
            ) : null}
          </View>
          {trailing}
        </View>
      ) : titleBesideActions ? (
        <View style={styles.titleRow}>
          <Text style={[styles.title, {flex: 1}]} numberOfLines={2}>
            {title}
          </Text>
          {trailing}
        </View>
      ) : (
        <>
          {trailing ? (
            <View style={[styles.headerRow, {marginBottom: space.xs}]}>
              <View style={{flex: 1}} />
              {trailing}
            </View>
          ) : null}
          <Text style={styles.title} numberOfLines={2}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={styles.subtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </>
      )}
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

export function ScreenScrollPad({children}: {children: React.ReactNode}) {
  return (
    <View style={{paddingBottom: spacing.bottomNavClearance}}>{children}</View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: space.md,
    paddingBottom: space.sm,
    backgroundColor: colors.bg,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: space.xs,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.sm,
  },
  location: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.muted,
    marginBottom: 4,
  },
  title: {
    ...typography.titleLg,
    color: colors.navy,
    lineHeight: 32,
  },
  subtitle: {
    marginTop: 4,
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

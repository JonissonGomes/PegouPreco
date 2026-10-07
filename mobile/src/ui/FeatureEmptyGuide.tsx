import React from 'react';
import {StyleSheet, Text, View, type StyleProp, type ViewStyle} from 'react-native';
import type {LucideIcon} from 'lucide-react-native';
import {AppButton} from '@/ui/chrome';
import {colors, radii, space} from '@/ui/theme';

export type EmptyGuideStep = {
  n: string;
  title: string;
  text: string;
  Icon: LucideIcon;
};

type Props = {
  HeroIcon: LucideIcon;
  title: string;
  subtitle: string;
  stepsLabel?: string;
  steps: EmptyGuideStep[];
  primaryLabel?: string;
  onPrimary?: () => void;
  PrimaryIcon?: LucideIcon;
  secondaryLabel?: string;
  onSecondary?: () => void;
  style?: StyleProp<ViewStyle>;
};

/** Empty state visual com passo a passo + CTA contextual. */
export function FeatureEmptyGuide({
  HeroIcon,
  title,
  subtitle,
  stepsLabel = 'Como funciona nesta tela',
  steps,
  primaryLabel,
  onPrimary,
  PrimaryIcon,
  secondaryLabel,
  onSecondary,
  style,
}: Props) {
  return (
    <View style={[styles.root, style]}>
      <View style={styles.hero}>
        <View style={styles.heroIcon}>
          <HeroIcon size={28} color={colors.navy} />
        </View>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.sub}>{subtitle}</Text>
      </View>

      {steps.length > 0 ? (
        <>
          <Text style={styles.stepsLabel}>{stepsLabel}</Text>
          {steps.map(s => (
            <View key={s.n} style={styles.step}>
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{s.n}</Text>
              </View>
              <View style={styles.stepIcon}>
                <s.Icon size={18} color={colors.navy} />
              </View>
              <View style={{flex: 1}}>
                <Text style={styles.stepTitle}>{s.title}</Text>
                <Text style={styles.stepText}>{s.text}</Text>
              </View>
            </View>
          ))}
        </>
      ) : null}

      {primaryLabel && onPrimary ? (
        <AppButton
          icon={
            PrimaryIcon ? <PrimaryIcon size={20} color="#fff" /> : undefined
          }
          label={primaryLabel}
          onPress={onPrimary}
        />
      ) : null}
      {secondaryLabel && onSecondary ? (
        <AppButton
          outlined
          label={secondaryLabel}
          onPress={onSecondary}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    paddingHorizontal: space.md,
    paddingTop: space.sm,
    paddingBottom: space.lg,
    gap: 10,
  },
  hero: {
    backgroundColor: colors.navy,
    borderRadius: radii.xl,
    padding: space.lg,
    gap: 8,
    marginBottom: space.sm,
    alignItems: 'center',
  },
  heroIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: colors.yellow,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  title: {
    fontSize: 22,
    fontWeight: '900',
    color: colors.white,
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  sub: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.88)',
    lineHeight: 20,
    textAlign: 'center',
  },
  stepsLabel: {
    marginTop: space.xs,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.5,
    color: colors.muted,
    textTransform: 'uppercase',
  },
  step: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    padding: space.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  badge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.navy,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {color: colors.white, fontWeight: '900', fontSize: 12},
  stepIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.yellow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepTitle: {fontWeight: '900', color: colors.navy, fontSize: 14},
  stepText: {
    marginTop: 2,
    fontWeight: '600',
    color: colors.muted,
    fontSize: 12,
    lineHeight: 16,
  },
});

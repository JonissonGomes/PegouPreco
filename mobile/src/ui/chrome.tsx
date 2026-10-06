import React from 'react';
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import {MapPin, TrendingDown} from 'lucide-react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {colors, spacing} from './theme';

const brandLogo = require('../../assets/brand/logo.png');
const brandIcon = require('../../assets/brand/app_icon.png');

export function BrandLogo({size = 28}: {size?: number}) {
  return (
    <Image
      source={brandLogo}
      style={{width: size, height: size, borderRadius: size > 32 ? 12 : 8}}
      resizeMode="contain"
      defaultSource={brandIcon}
    />
  );
}

/** Header amarelo: logo + título/subtítulo (pin) + actions. */
export function AppScreenHeader({
  title,
  subtitle,
  leading,
  actions,
  showLogo = true,
  stacked = false,
}: {
  title: string;
  subtitle?: string;
  leading?: React.ReactNode;
  actions?: React.ReactNode;
  showLogo?: boolean;
  /** Título grande abaixo da linha do logo (layout do carrinho / Lovable). */
  stacked?: boolean;
}) {
  const insets = useSafeAreaInsets();

  if (stacked) {
    return (
      <View style={[styles.header, styles.headerStacked, {paddingTop: insets.top + 8}]}>
        <View style={styles.headerTopRow}>
          {leading ?? (showLogo ? <BrandLogo size={36} /> : <View />)}
          <View style={styles.headerActions}>{actions}</View>
        </View>
        <Text style={styles.titleStacked} numberOfLines={2}>
          {title}
        </Text>
        {subtitle ? (
          <View style={styles.subtitleRow}>
            <MapPin size={15} color={colors.navy} />
            <Text style={styles.subtitleStacked} numberOfLines={1}>
              {subtitle.toUpperCase()}
            </Text>
          </View>
        ) : null}
      </View>
    );
  }

  return (
    <View style={[styles.header, {paddingTop: insets.top + 6}]}>
      <View style={styles.headerRow}>
        {leading ?? (showLogo ? <BrandLogo size={28} /> : null)}
        <View style={[styles.headerText, showLogo || leading ? {marginLeft: 10} : null]}>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <View style={styles.subtitleRowCompact}>
              <MapPin size={12} color={colors.navy} />
              <Text style={styles.subtitle} numberOfLines={1}>
                {subtitle.toUpperCase()}
              </Text>
            </View>
          ) : null}
        </View>
        {actions}
      </View>
    </View>
  );
}

/** Faixa navy compacta (value + label lado a lado). */
export function AppScreenNavyBar({
  value,
  label,
  trailing,
}: {
  value: string;
  label: string;
  trailing?: React.ReactNode;
}) {
  return (
    <View style={styles.navy}>
      <View style={styles.navyInline}>
        <Text style={styles.navyValue} numberOfLines={1}>
          {value}
        </Text>
        <Text style={styles.navyLabelInline} numberOfLines={2}>
          {label.toUpperCase()}
        </Text>
      </View>
      {trailing}
    </View>
  );
}

/** Faixa navy do carrinho: TOTAL DA LISTA + economia + contagem. */
export function AppCartTotalsBar({
  value,
  savingsLabel,
  itemsLabel,
}: {
  value: string;
  savingsLabel: string;
  itemsLabel: string;
}) {
  return (
    <View style={styles.navyTotals}>
      <View style={{flex: 1}}>
        <Text style={styles.navyTotalsLabel}>TOTAL DA LISTA</Text>
        <Text style={styles.navyTotalsValue}>{value}</Text>
      </View>
      <View style={styles.navyTotalsRight}>
        <View style={styles.pill}>
          <TrendingDown size={14} color={colors.navy} />
          <Text style={styles.pillText}>{savingsLabel}</Text>
        </View>
        <Text style={styles.navyItems}>{itemsLabel}</Text>
      </View>
    </View>
  );
}

export function AppListCard({
  children,
  onPress,
  style,
}: {
  children: React.ReactNode;
  onPress?: () => void;
  style?: ViewStyle;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.card, style]}>
      {children}
    </Pressable>
  );
}

export function AppButton({
  label,
  onPress,
  outlined,
  disabled,
  icon,
}: {
  label: string;
  onPress?: () => void;
  outlined?: boolean;
  disabled?: boolean;
  icon?: React.ReactNode;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.btn,
        outlined && styles.btnOutlined,
        disabled && {opacity: 0.5},
      ]}>
      {icon}
      <Text style={[styles.btnText, outlined && {color: colors.navy}]}>
        {label}
      </Text>
    </Pressable>
  );
}

export function AppField({
  label,
  compact,
  ...props
}: TextInputProps & {label?: string; compact?: boolean}) {
  return (
    <View style={{marginBottom: compact ? 8 : 12, flex: 1}}>
      {label ? <Text style={styles.fieldLabel}>{label}</Text> : null}
      <TextInput
        placeholderTextColor={colors.muted}
        style={[styles.input, compact && styles.inputCompact]}
        {...props}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: colors.yellowBright,
    paddingHorizontal: 14,
    paddingBottom: 10,
  },
  headerStacked: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  headerRow: {flexDirection: 'row', alignItems: 'center'},
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  headerActions: {flexDirection: 'row', alignItems: 'center'},
  headerText: {flex: 1},
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.navy,
    letterSpacing: -0.3,
  },
  titleStacked: {
    fontSize: 26,
    fontWeight: '800',
    color: colors.navy,
    letterSpacing: -0.4,
    lineHeight: 30,
  },
  subtitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
  },
  subtitleRowCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 2,
  },
  subtitle: {
    flex: 1,
    fontSize: 10,
    fontWeight: '700',
    color: colors.navy,
    letterSpacing: 0.2,
  },
  subtitleStacked: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    color: colors.navy,
    letterSpacing: 0.3,
  },
  navy: {
    backgroundColor: colors.navy,
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  navyInline: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  navyValue: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  navyLabelInline: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.4,
    flexShrink: 1,
  },
  navyTotals: {
    backgroundColor: colors.navy,
    paddingHorizontal: 20,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
  },
  navyTotalsLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  navyTotalsValue: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
    lineHeight: 32,
    marginTop: 2,
  },
  navyTotalsRight: {alignItems: 'flex-end', gap: 6},
  navyItems: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  pill: {
    backgroundColor: colors.yellowBright,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  pillText: {color: colors.navy, fontWeight: '800', fontSize: 10},
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    shadowOffset: {width: 0, height: 1},
    elevation: 1,
  },
  btn: {
    backgroundColor: colors.navy,
    borderRadius: 16,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  btnOutlined: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.border,
    height: 48,
    borderRadius: 14,
  },
  btnText: {color: '#fff', fontWeight: '800', fontSize: 15},
  fieldLabel: {
    fontWeight: '700',
    color: colors.ink,
    marginBottom: 4,
    fontSize: 12,
  },
  input: {
    height: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: spacing.controlRadius,
    paddingHorizontal: 12,
    backgroundColor: '#fff',
    color: colors.ink,
  },
  inputCompact: {height: 44},
});

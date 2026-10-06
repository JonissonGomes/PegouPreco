import React from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {colors, spacing} from './theme';

export function AppScreenHeader({
  title,
  subtitle,
  leading,
  actions,
}: {
  title: string;
  subtitle?: string;
  leading?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.header, {paddingTop: insets.top + 6}]}>
      <View style={styles.headerRow}>
        {leading ?? <View style={styles.logo} />}
        <View style={styles.headerText}>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={styles.subtitle} numberOfLines={1}>
              {subtitle.toUpperCase()}
            </Text>
          ) : null}
        </View>
        {actions}
      </View>
    </View>
  );
}

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
      <View style={{flex: 1}}>
        <Text style={styles.navyValue}>{value}</Text>
        <Text style={styles.navyLabel}>{label.toUpperCase()}</Text>
      </View>
      {trailing}
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
}: {
  label: string;
  onPress?: () => void;
  outlined?: boolean;
  disabled?: boolean;
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
  headerRow: {flexDirection: 'row', alignItems: 'center'},
  logo: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#111',
    marginRight: 10,
  },
  headerText: {flex: 1},
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.navy,
  },
  subtitle: {
    marginTop: 2,
    fontSize: 10,
    fontWeight: '700',
    color: colors.navy,
    letterSpacing: 0.2,
  },
  navy: {
    backgroundColor: colors.navy,
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  navyValue: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '800',
  },
  navyLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 10,
    fontWeight: '700',
    marginTop: 2,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: spacing.cardRadius,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    marginBottom: 10,
  },
  btn: {
    backgroundColor: colors.navy,
    borderRadius: 14,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnOutlined: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.border,
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

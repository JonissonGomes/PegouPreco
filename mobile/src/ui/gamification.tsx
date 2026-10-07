import React, {useEffect, useRef} from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {Check, Star, ThumbsDown, ThumbsUp, Zap} from 'lucide-react-native';
import {colors, radii, space} from './theme';

/** Seletor interativo de 1–5 estrelas (avaliação de mercado). */
export function StarPicker({
  value,
  onChange,
  size = 36,
}: {
  value: number;
  onChange: (stars: number) => void;
  size?: number;
}) {
  return (
    <View style={styles.starPicker}>
      {[1, 2, 3, 4, 5].map(i => {
        const on = i <= value;
        return (
          <Pressable
            key={i}
            onPress={() => onChange(i)}
            hitSlop={6}
            style={[styles.starHit, on && styles.starHitOn]}>
            <Star
              size={size}
              color={colors.navy}
              fill={on ? colors.yellowBright : 'transparent'}
            />
          </Pressable>
        );
      })}
    </View>
  );
}

export function ScoreMeter({
  confirm,
  reject,
}: {
  confirm: number;
  reject: number;
}) {
  const total = Math.max(confirm + reject, 1);
  const confPct = Math.min(100, (confirm / total) * 100);
  return (
    <View style={styles.meterWrap}>
      <View style={styles.meterTrack}>
        <View style={[styles.meterFill, {width: `${confPct}%`}]} />
      </View>
      <View style={styles.meterLabels}>
        <Text style={styles.meterOk}>✓ {confirm.toFixed(0)}</Text>
        <Text style={styles.meterBad}>✗ {reject.toFixed(0)}</Text>
      </View>
    </View>
  );
}

export function VoteButtons({
  busy,
  confirmPts,
  rejectPts,
  onConfirm,
  onReject,
}: {
  busy?: boolean;
  confirmPts: number;
  rejectPts: number;
  onConfirm: () => void;
  onReject: () => void;
}) {
  return (
    <View style={styles.voteRow}>
      <Pressable
        style={[styles.voteBtn, styles.voteOk, busy && styles.voteBusy]}
        onPress={onConfirm}
        disabled={busy}>
        <ThumbsUp size={18} color="#fff" />
        <View>
          <Text style={styles.voteLabel}>Confirmar</Text>
          <Text style={styles.votePts}>+{confirmPts} pts</Text>
        </View>
      </Pressable>
      <Pressable
        style={[styles.voteBtn, styles.voteNo, busy && styles.voteBusy]}
        onPress={onReject}
        disabled={busy}>
        <ThumbsDown size={18} color={colors.navy} />
        <View>
          <Text style={styles.voteLabelDark}>Rejeitar</Text>
          <Text style={styles.votePtsDark}>+{rejectPts} pts</Text>
        </View>
      </Pressable>
    </View>
  );
}

/** Celebração rápida de XP após voto/avaliação. */
export function XpBurst({
  visible,
  points,
  title,
  onDone,
}: {
  visible: boolean;
  points: number;
  title?: string;
  onDone?: () => void;
}) {
  const scale = useRef(new Animated.Value(0.6)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) return;
    scale.setValue(0.6);
    opacity.setValue(0);
    Animated.sequence([
      Animated.parallel([
        Animated.spring(scale, {
          toValue: 1,
          friction: 6,
          tension: 120,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 160,
          useNativeDriver: true,
        }),
      ]),
      Animated.delay(900),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 220,
        useNativeDriver: true,
      }),
    ]).start(({finished}) => {
      if (finished) onDone?.();
    });
  }, [visible, points, scale, opacity, onDone]);

  if (!visible) return null;

  return (
    <View style={styles.xpOverlay} pointerEvents="none">
      <Animated.View
        style={[styles.xpCard, {opacity, transform: [{scale}]}]}>
        <View style={styles.xpIcon}>
          <Zap size={22} color={colors.navy} fill={colors.navy} />
        </View>
        <Text style={styles.xpPts}>+{points} pts</Text>
        <Text style={styles.xpTitle}>{title ?? 'Missão cumprida!'}</Text>
      </Animated.View>
    </View>
  );
}

export function MissionHero({
  badge,
  title,
  subtitle,
  footer,
}: {
  badge?: React.ReactNode;
  title: string;
  subtitle: string;
  footer?: string;
}) {
  return (
    <View style={styles.missionHero}>
      {badge}
      <Text style={styles.missionTitle}>{title}</Text>
      <Text style={styles.missionSub}>{subtitle}</Text>
      {footer ? (
        <View style={styles.missionFooter}>
          <Check size={14} color={colors.navy} strokeWidth={3} />
          <Text style={styles.missionFooterText}>{footer}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  starPicker: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 8,
  },
  starHit: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  starHitOn: {
    backgroundColor: colors.yellowBright,
    borderColor: colors.navy,
  },
  meterWrap: {gap: 4, marginTop: 4},
  meterTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FEE2E2',
    overflow: 'hidden',
  },
  meterFill: {
    height: '100%',
    backgroundColor: colors.trustGreen,
    borderRadius: 4,
  },
  meterLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  meterOk: {fontSize: 11, fontWeight: '800', color: colors.trustGreen},
  meterBad: {fontSize: 11, fontWeight: '800', color: colors.danger},
  voteRow: {flexDirection: 'row', gap: 8, marginTop: 8},
  voteBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: radii.lg,
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  voteOk: {backgroundColor: colors.navy},
  voteNo: {
    backgroundColor: colors.yellowBright,
    borderWidth: 1,
    borderColor: colors.navy,
  },
  voteBusy: {opacity: 0.55},
  voteLabel: {color: '#fff', fontWeight: '800', fontSize: 13},
  votePts: {color: 'rgba(255,255,255,0.75)', fontWeight: '700', fontSize: 11},
  voteLabelDark: {color: colors.navy, fontWeight: '800', fontSize: 13},
  votePtsDark: {color: 'rgba(11,42,107,0.7)', fontWeight: '700', fontSize: 11},
  xpOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 50,
  },
  xpCard: {
    backgroundColor: colors.yellowBright,
    borderRadius: 24,
    paddingHorizontal: 28,
    paddingVertical: 22,
    alignItems: 'center',
    gap: 6,
    borderWidth: 3,
    borderColor: colors.navy,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 16,
    shadowOffset: {width: 0, height: 8},
    elevation: 10,
  },
  xpIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  xpPts: {fontSize: 28, fontWeight: '900', color: colors.navy},
  xpTitle: {fontSize: 14, fontWeight: '800', color: colors.navy},
  missionHero: {
    marginHorizontal: space.md,
    marginTop: space.sm,
    marginBottom: space.xs,
    padding: space.md,
    backgroundColor: '#fff',
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 8,
  },
  missionTitle: {fontSize: 18, fontWeight: '800', color: colors.navy},
  missionSub: {
    color: colors.muted,
    fontWeight: '600',
    fontSize: 13,
    lineHeight: 18,
  },
  missionFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
    backgroundColor: '#EEF2FF',
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignSelf: 'flex-start',
  },
  missionFooterText: {fontSize: 12, fontWeight: '800', color: colors.navy},
});

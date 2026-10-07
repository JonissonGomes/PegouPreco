import React from 'react';
import {
  Animated,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {create} from 'zustand';
import {AlertTriangle, CheckCircle2, Info, ShieldAlert} from 'lucide-react-native';
import {AppButton} from '@/ui/chrome';
import {colors, radii, space} from '@/ui/theme';
import {useAnimatedSheet} from '@/ui/useAnimatedSheet';

export type AppDialogAction = {
  label: string;
  /** primary = filled; cancel/default = outlined; destructive = filled danger-like via last primary */
  style?: 'default' | 'cancel' | 'destructive' | 'primary';
  onPress?: () => void;
};

export type AppDialogTone = 'info' | 'success' | 'warning' | 'danger';

type DialogState = {
  visible: boolean;
  title: string;
  message: string;
  tone: AppDialogTone;
  actions: AppDialogAction[];
  show: (opts: {
    title: string;
    message?: string;
    tone?: AppDialogTone;
    actions?: AppDialogAction[];
  }) => void;
  hide: () => void;
};

function toneFromTitle(title: string): AppDialogTone {
  const t = title.toLowerCase();
  if (t.includes('pronto') || t.includes('obrigado') || t.includes('salvo')) {
    return 'success';
  }
  if (
    t.includes('falha') ||
    t.includes('erro') ||
    t.includes('excluir') ||
    t.includes('limpar')
  ) {
    return 'danger';
  }
  if (
    t.includes('conta') ||
    t.includes('necessária') ||
    t.includes('sync') ||
    t.includes('verifique') ||
    t.includes('câmera') ||
    t.includes('lista')
  ) {
    return 'warning';
  }
  return 'info';
}

export const useAppDialog = create<DialogState>(set => ({
  visible: false,
  title: '',
  message: '',
  tone: 'info',
  actions: [{label: 'Entendi', style: 'primary'}],
  show: opts =>
    set({
      visible: true,
      title: opts.title,
      message: opts.message ?? '',
      tone: opts.tone ?? toneFromTitle(opts.title),
      actions:
        opts.actions?.length
          ? opts.actions
          : [{label: 'Entendi', style: 'primary'}],
    }),
  hide: () => set({visible: false}),
}));

/** API drop-in no espírito do Alert.alert, com UI do PegouPreço. */
export function appAlert(
  title: string,
  message?: string,
  actions?: AppDialogAction[],
  tone?: AppDialogTone,
) {
  useAppDialog.getState().show({title, message, actions, tone});
}

function ToneIcon({tone}: {tone: AppDialogTone}) {
  if (tone === 'success') {
    return <CheckCircle2 size={26} color={colors.navy} />;
  }
  if (tone === 'danger') {
    return <AlertTriangle size={26} color={colors.danger} />;
  }
  if (tone === 'warning') {
    return <ShieldAlert size={26} color={colors.navy} />;
  }
  return <Info size={26} color={colors.navy} />;
}

function toneBubble(tone: AppDialogTone) {
  if (tone === 'success') return styles.bubbleSuccess;
  if (tone === 'danger') return styles.bubbleDanger;
  if (tone === 'warning') return styles.bubbleWarning;
  return styles.bubbleInfo;
}

export function AppDialogHost() {
  const visible = useAppDialog(s => s.visible);
  const title = useAppDialog(s => s.title);
  const message = useAppDialog(s => s.message);
  const tone = useAppDialog(s => s.tone);
  const actions = useAppDialog(s => s.actions);
  const hide = useAppDialog(s => s.hide);
  const {mounted, backdropStyle, sheetStyle} = useAnimatedSheet(visible, {
    fromY: 24,
  });

  if (!mounted) return null;

  const run = (action: AppDialogAction) => {
    hide();
    setTimeout(() => action.onPress?.(), 40);
  };

  const hasPrimary = actions.some(a => a.style === 'primary');

  return (
    <Modal
      visible={mounted}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={hide}>
      <View style={styles.root}>
        <Pressable style={StyleSheet.absoluteFill} onPress={hide}>
          <Animated.View style={[styles.backdrop, backdropStyle]} />
        </Pressable>
        <Animated.View style={[styles.card, sheetStyle]}>
          <View style={[styles.bubble, toneBubble(tone)]}>
            <ToneIcon tone={tone} />
          </View>
          <Text style={styles.title}>{title}</Text>
          {message ? <Text style={styles.message}>{message}</Text> : null}
          <View style={styles.actions}>
            {actions.map((a, idx) => {
              const isLast = idx === actions.length - 1;
              const primary =
                a.style === 'primary' ||
                a.style === 'destructive' ||
                (!hasPrimary && isLast && a.style !== 'cancel');
              const outlined = !primary;
              return (
                <AppButton
                  key={`${a.label}-${idx}`}
                  label={a.label}
                  outlined={outlined}
                  onPress={() => run(a)}
                />
              );
            })}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: space.lg,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: radii.xl,
    borderWidth: 2,
    borderColor: colors.navy,
    padding: space.lg,
    gap: space.sm,
  },
  bubble: {
    width: 52,
    height: 52,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 4,
  },
  bubbleInfo: {backgroundColor: '#EEF2FF'},
  bubbleWarning: {backgroundColor: colors.yellowBright},
  bubbleSuccess: {backgroundColor: '#DCFCE7'},
  bubbleDanger: {backgroundColor: '#FEE2E2'},
  title: {
    textAlign: 'center',
    fontSize: 20,
    fontWeight: '900',
    color: colors.navy,
    letterSpacing: -0.3,
  },
  message: {
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '600',
    color: colors.muted,
    lineHeight: 20,
    marginBottom: 4,
  },
  actions: {gap: 8, marginTop: 8},
});

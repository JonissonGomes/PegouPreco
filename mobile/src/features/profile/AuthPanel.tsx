import React, {useEffect, useRef, useState} from 'react';
import {
  Animated,
  Easing,
  Keyboard,
  KeyboardAvoidingView,
  LayoutAnimation,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  UIManager,
  View,
  type TextInputProps,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {Mail, ShieldCheck} from 'lucide-react-native';
import {BrandLogo} from '@/ui/chrome';
import {Screen} from '@/ui/components';
import {colors, radii, space} from '@/ui/theme';
import {useAppStore} from '@/store/appStore';
import {syncApi, type AuthResponse} from '@/data/remote/syncApi';
import {apiErrorMessage} from '@/data/remote/apiError';
import {appAlert} from '@/ui/appDialog';
import {loginWithPasskey} from '@/data/remote/passkeyAuth';
import {sessionExpiresAt} from '@/domain/session';
import {
  isValidEmail,
  isValidOtp,
  isValidPassword,
  isValidPhoneBr,
  maskOtpTyping,
  maskPhoneBrTyping,
  normalizeDisplayName,
  normalizeEmail,
  phoneToApi,
} from '@/domain/authFields';

if (
  Platform.OS === 'android' &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type Mode = 'login' | 'register' | 'verify' | 'otp';

function sessionFrom(
  data: AuthResponse,
  fallback: {email: string; phone: string; name: string},
) {
  return {
    token: data.token!,
    email: data.email ?? fallback.email,
    phone: data.phone ?? (fallback.phone || null),
    displayName: data.displayName ?? (fallback.name || fallback.email),
    emailVerified: !!data.emailVerified,
    phoneVerified: !!data.phoneVerified,
    userId: String(data.userId ?? data.id ?? fallback.email),
    role: data.role,
    expiresAt: sessionExpiresAt(data.tokenExpiresAt),
  };
}

function animateLayout() {
  LayoutAnimation.configureNext({
    duration: 280,
    update: {type: LayoutAnimation.Types.easeInEaseOut},
    create: {
      type: LayoutAnimation.Types.easeInEaseOut,
      property: LayoutAnimation.Properties.opacity,
    },
    delete: {
      type: LayoutAnimation.Types.easeInEaseOut,
      property: LayoutAnimation.Properties.opacity,
    },
  });
}

function AuthInput({
  label,
  icon,
  style,
  onFocus,
  onBlur,
  ...props
}: TextInputProps & {label: string; icon?: React.ReactNode}) {
  const [focused, setFocused] = useState(false);
  const border = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(border, {
      toValue: focused ? 1 : 0,
      duration: 180,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [focused, border]);

  const borderColor = border.interpolate({
    inputRange: [0, 1],
    outputRange: [colors.border, colors.navy],
  });
  const bg = border.interpolate({
    inputRange: [0, 1],
    outputRange: [colors.bg, colors.white],
  });

  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Animated.View
        style={[styles.fieldBox, {borderColor, backgroundColor: bg}]}>
        {icon ? <View style={styles.fieldIcon}>{icon}</View> : null}
        <TextInput
          {...props}
          placeholderTextColor={colors.muted}
          style={[styles.fieldInput, style]}
          onFocus={e => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={e => {
            setFocused(false);
            onBlur?.(e);
          }}
        />
      </Animated.View>
    </View>
  );
}

function PulseCta({
  label,
  onPress,
  disabled,
  accent,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  accent?: boolean;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  return (
    <Pressable
      disabled={disabled}
      onPressIn={() =>
        Animated.spring(scale, {
          toValue: 0.97,
          useNativeDriver: true,
          friction: 6,
        }).start()
      }
      onPressOut={() =>
        Animated.spring(scale, {
          toValue: 1,
          useNativeDriver: true,
          friction: 6,
        }).start()
      }
      onPress={onPress}>
      <Animated.View
        style={[
          styles.cta,
          accent ? styles.ctaAccent : styles.ctaPrimary,
          disabled && {opacity: 0.55},
          {transform: [{scale}]},
        ]}>
        <Text style={[styles.ctaText, accent && styles.ctaTextAccent]}>
          {label}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

function ModeTabs({
  mode,
  onLogin,
  onRegister,
}: {
  mode: Mode;
  onLogin: () => void;
  onRegister: () => void;
}) {
  const slide = useRef(new Animated.Value(mode === 'register' ? 1 : 0)).current;
  const [width, setWidth] = useState(0);

  useEffect(() => {
    Animated.spring(slide, {
      toValue: mode === 'register' ? 1 : 0,
      friction: 8,
      tension: 90,
      useNativeDriver: true,
    }).start();
  }, [mode, slide]);

  const half = Math.max(width / 2 - 4, 0);
  const translateX = slide.interpolate({
    inputRange: [0, 1],
    outputRange: [0, half],
  });

  return (
    <View
      style={styles.tabs}
      onLayout={e => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 ? (
        <Animated.View
          style={[
            styles.tabThumb,
            {width: half, transform: [{translateX}]},
          ]}
        />
      ) : null}
      <Pressable style={styles.tabHit} onPress={onLogin}>
        <Text
          style={[styles.tabText, mode === 'login' && styles.tabTextOn]}>
          Entrar
        </Text>
      </Pressable>
      <Pressable style={styles.tabHit} onPress={onRegister}>
        <Text style={[styles.tabText, mode === 'register' && styles.tabTextOn]}>
          Criar conta
        </Text>
      </Pressable>
    </View>
  );
}

export function AuthPanel() {
  const insets = useSafeAreaInsets();
  const setAuth = useAppStore(s => s.setAuth);
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [mode, setMode] = useState<Mode>('login');
  const [busy, setBusy] = useState(false);
  const [devHint, setDevHint] = useState<string | null>(null);
  const [otpSent, setOtpSent] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [keyboardPad, setKeyboardPad] = useState(0);
  const scrollRef = useRef<ScrollView>(null);

  const heroOpacity = useRef(new Animated.Value(0)).current;
  const heroY = useRef(new Animated.Value(-18)).current;
  const sheetY = useRef(new Animated.Value(56)).current;
  const sheetOpacity = useRef(new Animated.Value(0)).current;
  const formOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(heroOpacity, {
        toValue: 1,
        duration: 420,
        useNativeDriver: true,
      }),
      Animated.timing(heroY, {
        toValue: 0,
        duration: 420,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.spring(sheetY, {
        toValue: 0,
        friction: 8,
        tension: 70,
        useNativeDriver: true,
      }),
      Animated.timing(sheetOpacity, {
        toValue: 1,
        duration: 320,
        delay: 80,
        useNativeDriver: true,
      }),
    ]).start();
  }, [heroOpacity, heroY, sheetY, sheetOpacity]);

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', e => {
      setKeyboardPad(e.endCoordinates.height);
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => {
      setKeyboardPad(0);
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  useEffect(() => {
    if (mode !== 'verify' && !(mode === 'otp' && otpSent)) return;
    const t = setTimeout(() => {
      scrollRef.current?.scrollToEnd({animated: true});
    }, 280);
    return () => clearTimeout(t);
  }, [mode, otpSent]);

  function switchMode(next: Mode) {
    animateLayout();
    formOpacity.setValue(0.35);
    Animated.timing(formOpacity, {
      toValue: 1,
      duration: 220,
      useNativeDriver: true,
    }).start();
    setMode(next);
  }

  function resetTransient() {
    setDevHint(null);
    setNotice(null);
    setCode('');
    setOtpSent(false);
  }

  function openCodeStep(message: string) {
    animateLayout();
    setOtpSent(true);
    setNotice(message);
    setMode('verify');
    Keyboard.dismiss();
  }

  async function withBusy(fn: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      const msg = apiErrorMessage(e);
      if (msg.includes('não confirmada') || msg.includes('código')) {
        const emailNorm = normalizeEmail(email);
        if (isValidEmail(emailNorm)) {
          try {
            const data = await syncApi.resendCode({
              email: emailNorm,
              channel: 'email',
            });
            noteDevCode(data);
          } catch {
            // A tela de código abre mesmo se o reenvio falhar.
          }
        }
        openCodeStep(
          'Sua conta ainda não foi confirmada. Digite o código de 6 dígitos enviado ao e-mail.',
        );
      } else {
        appAlert('PegouPreço', msg);
      }
    } finally {
      setBusy(false);
    }
  }

  function noteDevCode(data: AuthResponse) {
    if (data.devCode) {
      setDevHint(`Código (dev): ${data.devCode}`);
      setCode(data.devCode);
    } else {
      setDevHint(data.hint ?? null);
    }
  }

  const primaryLabel = busy
    ? 'Aguarde…'
    : mode === 'login'
      ? 'Entrar'
      : mode === 'register'
        ? 'Criar conta'
        : mode === 'otp' && !otpSent
          ? 'Enviar código no e-mail'
          : 'Verificar';

  return (
    <Screen style={styles.root}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior="padding"
        keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top : 0}>
        <Animated.View
          style={[
            styles.hero,
            {
              paddingTop: insets.top + (keyboardPad > 0 ? space.sm : space.md),
              paddingBottom: keyboardPad > 0 ? space.sm : space.xxl + 12,
              opacity: heroOpacity,
              transform: [{translateY: heroY}],
            },
          ]}>
          {keyboardPad === 0 ? (
            <>
              <View style={styles.logoRing}>
                <BrandLogo size={44} />
              </View>
              <Text style={styles.brand}>PegouPreço</Text>
            </>
          ) : null}
        </Animated.View>

        <Animated.View
          style={[
            styles.sheet,
            {
              opacity: sheetOpacity,
              transform: [{translateY: sheetY}],
              paddingBottom: Math.max(insets.bottom, space.md),
            },
          ]}>
          <View style={styles.sheetHandle} />
          <ScrollView
            ref={scrollRef}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={[
              styles.sheetBody,
              {paddingBottom: space.xl + (keyboardPad > 0 ? 24 : 88)},
            ]}>
            <Animated.View style={{opacity: formOpacity, gap: 14}}>
              {mode === 'login' || mode === 'register' ? (
                <ModeTabs
                  mode={mode}
                  onLogin={() => {
                    resetTransient();
                    switchMode('login');
                  }}
                  onRegister={() => {
                    resetTransient();
                    switchMode('register');
                  }}
                />
              ) : null}

              {mode === 'register' ? (
                <View style={styles.badgeRow}>
                  <ShieldCheck size={16} color={colors.navy} />
                  <Text style={styles.badgeText}>
                    Confirmação por e-mail · 6 dígitos
                  </Text>
                </View>
              ) : null}

              {mode === 'register' ? (
                <AuthInput
                  label="Como te chamamos"
                  value={name}
                  onChangeText={t => setName(t.slice(0, 60))}
                  placeholder="Seu nome ou apelido"
                  autoCapitalize="words"
                  textContentType="name"
                  autoComplete="name"
                  maxLength={60}
                />
              ) : null}

              {mode === 'login' || mode === 'register' || mode === 'otp' ? (
                <AuthInput
                  label="Seu e-mail"
                  icon={<Mail size={16} color={colors.muted} />}
                  value={email}
                  onChangeText={t => setEmail(normalizeEmail(t))}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  textContentType="emailAddress"
                  autoComplete="email"
                  placeholder="voce@email.com"
                  maxLength={120}
                />
              ) : null}

              {mode === 'register' ? (
                <AuthInput
                  label="Celular com DDD"
                  value={phone}
                  onChangeText={t => setPhone(maskPhoneBrTyping(t))}
                  keyboardType="phone-pad"
                  textContentType="telephoneNumber"
                  autoComplete="tel"
                  placeholder="(81) 99999-0000"
                  maxLength={15}
                />
              ) : null}

              {mode === 'login' || mode === 'register' ? (
                <AuthInput
                  label={mode === 'register' ? 'Crie uma senha' : 'Sua senha'}
                  value={password}
                  onChangeText={t => setPassword(t.slice(0, 72))}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                  textContentType={
                    mode === 'register' ? 'newPassword' : 'password'
                  }
                  autoComplete={
                    mode === 'register' ? 'password-new' : 'password'
                  }
                  placeholder="Mínimo 6 caracteres"
                  maxLength={72}
                />
              ) : null}

              {mode === 'verify' || (mode === 'otp' && otpSent) ? (
                <View style={styles.codeBlock}>
                  <Text style={styles.codeTitle}>Digite o código</Text>
                  <Text style={styles.hint}>
                    {email
                      ? `Enviamos 6 dígitos para ${email}.`
                      : 'Enviamos 6 dígitos para o e-mail da conta.'}{' '}
                    Confira também o spam.
                  </Text>
                  <View style={styles.codeRow}>
                    {Array.from({length: 6}, (_, i) => {
                      const digit = code[i] ?? '';
                      const filled = digit.length > 0;
                      return (
                        <View
                          key={i}
                          style={[styles.codeDot, filled && styles.codeDotOn]}>
                          <Text
                            style={[
                              styles.codeDigit,
                              filled && styles.codeDigitOn,
                            ]}>
                            {digit || ' '}
                          </Text>
                        </View>
                      );
                    })}
                    <TextInput
                      value={code}
                      onChangeText={t => setCode(maskOtpTyping(t))}
                      keyboardType="number-pad"
                      textContentType="oneTimeCode"
                      autoComplete="one-time-code"
                      maxLength={6}
                      autoFocus
                      caretHidden
                      style={styles.codeHidden}
                    />
                  </View>
                </View>
              ) : null}

              {notice ? <Text style={styles.notice}>{notice}</Text> : null}
              {devHint ? <Text style={styles.devHint}>{devHint}</Text> : null}

              <PulseCta
                label={primaryLabel}
                disabled={busy}
                accent
                onPress={() =>
                  withBusy(async () => {
                    const emailNorm = normalizeEmail(email);
                    const nameNorm = normalizeDisplayName(name);
                    const phoneApi = phoneToApi(phone);
                    const fallback = {
                      email: emailNorm,
                      phone: phoneApi ?? phone,
                      name: nameNorm,
                    };
                    if (mode === 'login') {
                      if (!isValidEmail(emailNorm)) {
                        appAlert('PegouPreço', 'Informe um e-mail válido.');
                        return;
                      }
                      if (!password) {
                        appAlert('PegouPreço', 'Informe a sua senha.');
                        return;
                      }
                      const data = await syncApi.login(emailNorm, password);
                      if (!data.token) throw new Error('Token ausente');
                      setAuth(sessionFrom(data, fallback));
                      return;
                    }
                    if (mode === 'register') {
                      if (!nameNorm) {
                        appAlert('PegouPreço', 'Como devemos te chamar?');
                        return;
                      }
                      if (!isValidEmail(emailNorm)) {
                        appAlert('PegouPreço', 'Informe um e-mail válido.');
                        return;
                      }
                      if (!isValidPhoneBr(phone)) {
                        appAlert(
                          'PegouPreço',
                          'Informe o celular com DDD, ex.: (81) 99999-0000.',
                        );
                        return;
                      }
                      if (!isValidPassword(password)) {
                        appAlert(
                          'PegouPreço',
                          'A senha precisa ter entre 6 e 72 caracteres.',
                        );
                        return;
                      }
                      const data = await syncApi.register({
                        email: emailNorm,
                        password,
                        displayName: nameNorm,
                        phone: phoneApi!,
                      });
                      noteDevCode(data);
                      if (data.token && !data.needsVerification) {
                        setAuth(sessionFrom(data, fallback));
                        return;
                      }
                      openCodeStep(
                        `Enviamos um código de 6 dígitos para ${emailNorm}. Digite abaixo para concluir o cadastro.`,
                      );
                      return;
                    }
                    if (mode === 'otp' && !otpSent) {
                      if (!isValidEmail(emailNorm)) {
                        appAlert('PegouPreço', 'Informe um e-mail válido.');
                        return;
                      }
                      const data = await syncApi.requestOtp({
                        email: emailNorm,
                      });
                      noteDevCode(data);
                      openCodeStep(
                        `Código enviado para ${emailNorm}. Digite os 6 dígitos abaixo para entrar.`,
                      );
                      return;
                    }
                    if (!isValidOtp(code)) {
                      appAlert(
                        'PegouPreço',
                        'Digite o código de 6 dígitos.',
                      );
                      return;
                    }
                    const data =
                      mode === 'otp'
                        ? await syncApi.verifyOtp({
                            email: emailNorm,
                            code: code.trim(),
                          })
                        : await syncApi.verify({
                            email: emailNorm || undefined,
                            code: code.trim(),
                          });
                    if (!data.token) throw new Error('Token ausente');
                    setNotice(null);
                    setAuth(sessionFrom(data, fallback));
                  })
                }
              />

              {mode === 'verify' || (mode === 'otp' && otpSent) ? (
                <Text style={styles.resendLine}>
                  Não recebeu o código?{' '}
                  <Text
                    style={styles.resendLink}
                    onPress={() => {
                      if (busy) return;
                      void withBusy(async () => {
                        const emailNorm = normalizeEmail(email);
                        if (!isValidEmail(emailNorm)) {
                          appAlert('PegouPreço', 'Informe um e-mail válido.');
                          return;
                        }
                        const data = await syncApi.resendCode({
                          email: emailNorm,
                          channel: 'email',
                        });
                        noteDevCode(data);
                        setNotice('Código reenviado. Confira a caixa de entrada.');
                      });
                    }}>
                    Reenviar
                  </Text>
                </Text>
              ) : null}

              {mode === 'login' ? (
                <Pressable
                  onPress={() => {
                    resetTransient();
                    switchMode('otp');
                  }}>
                  <Text style={styles.resendLine}>
                    Prefere entrar com código no e-mail?
                  </Text>
                </Pressable>
              ) : null}

              {mode === 'login' ? (
                <PulseCta
                  label="Entrar com passkey"
                  disabled={busy}
                  onPress={() =>
                    withBusy(async () => {
                      const data = await loginWithPasskey();
                      if (!data.token) throw new Error('Token ausente');
                      setAuth(
                        sessionFrom(data, {
                          email: data.email ?? '',
                          phone: data.phone ?? '',
                          name: data.displayName ?? '',
                        }),
                      );
                    })
                  }
                />
              ) : null}

              <Pressable
                style={styles.linkBtn}
                onPress={() => {
                  resetTransient();
                  if (mode === 'login' || mode === 'otp') {
                    switchMode('register');
                  } else {
                    switchMode('login');
                  }
                }}>
                <Text style={styles.linkText}>
                  {mode === 'login' || mode === 'otp'
                    ? 'Quero criar conta'
                    : mode === 'register'
                      ? 'Já tenho conta'
                      : 'Voltar ao início'}
                </Text>
              </Pressable>
            </Animated.View>
          </ScrollView>
        </Animated.View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  root: {backgroundColor: '#fff'},
  flex: {flex: 1},
  hero: {
    paddingHorizontal: space.xl,
    paddingBottom: space.md,
    alignItems: 'center',
    overflow: 'hidden',
  },
  blobA: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: colors.yellow,
    opacity: 0,
    top: -40,
    right: -50,
  },
  blobB: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: colors.cyan,
    opacity: 0,
    bottom: 20,
    left: -30,
  },
  logoRing: {
    padding: 4,
    borderRadius: 18,
    marginBottom: 8,
  },
  brand: {
    color: colors.navy,
    fontWeight: '900',
    fontSize: 18,
    letterSpacing: -0.3,
  },
  kicker: {
    color: colors.muted,
    fontWeight: '700',
    fontSize: 13,
    marginBottom: 4,
  },
  heroTitle: {
    color: colors.ink,
    fontWeight: '900',
    fontSize: 28,
    letterSpacing: -0.6,
    marginBottom: 6,
  },
  heroSub: {
    color: colors.muted,
    fontWeight: '600',
    fontSize: 14,
    lineHeight: 20,
    maxWidth: 320,
  },
  locChip: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: space.md,
    backgroundColor: colors.yellow,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radii.pill,
  },
  locText: {fontSize: 11, fontWeight: '800', color: colors.navy, maxWidth: 220},
  sheet: {
    flex: 1,
    marginTop: -18,
    backgroundColor: colors.white,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 10,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: {width: 0, height: -4},
    elevation: 12,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: 8,
  },
  sheetBody: {
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    paddingBottom: space.xl,
  },
  tabs: {
    flexDirection: 'row',
    backgroundColor: colors.bg,
    borderRadius: radii.pill,
    padding: 4,
    position: 'relative',
  },
  tabThumb: {
    position: 'absolute',
    top: 4,
    left: 4,
    bottom: 4,
    backgroundColor: colors.navy,
    borderRadius: radii.pill,
  },
  tabHit: {
    flex: 1,
    paddingVertical: 11,
    alignItems: 'center',
    zIndex: 1,
  },
  tabText: {fontWeight: '700', fontSize: 13, color: colors.muted},
  tabTextOn: {color: colors.white},
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#EEF2FF',
    borderRadius: radii.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  badgeText: {flex: 1, fontWeight: '700', fontSize: 12, color: colors.navy},
  fieldWrap: {gap: 6},
  fieldLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.navy,
    letterSpacing: 0.2,
  },
  fieldBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderRadius: radii.lg,
    paddingHorizontal: 12,
    minHeight: 52,
  },
  fieldIcon: {marginRight: 8},
  fieldInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: colors.ink,
    paddingVertical: 12,
  },
  otpInput: {
    letterSpacing: 8,
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
  },
  notice: {
    backgroundColor: '#EEF2FF',
    color: colors.navy,
    fontWeight: '700',
    fontSize: 13,
    lineHeight: 18,
    borderRadius: radii.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  hint: {color: colors.muted, fontSize: 13, fontWeight: '600', lineHeight: 18},
  devHint: {
    backgroundColor: '#FFF3C4',
    color: colors.navy,
    fontWeight: '800',
    padding: 10,
    borderRadius: 10,
    overflow: 'hidden',
  },
  cta: {
    borderRadius: radii.lg,
    minHeight: 54,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  ctaPrimary: {
    backgroundColor: colors.white,
    borderWidth: 1.5,
    borderColor: colors.navy,
  },
  ctaAccent: {
    backgroundColor: colors.navy,
    borderWidth: 0,
    borderRadius: radii.pill,
  },
  ctaText: {fontWeight: '900', fontSize: 15, color: colors.navy},
  ctaTextAccent: {color: colors.white},
  codeBlock: {alignItems: 'center', gap: 8, marginTop: 8},
  codeTitle: {fontSize: 22, fontWeight: '900', color: colors.ink},
  codeRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginTop: 8,
    position: 'relative',
  },
  codeDot: {
    width: 42,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  codeDotOn: {backgroundColor: colors.navy},
  codeDigit: {fontSize: 18, fontWeight: '800', color: colors.navy},
  codeDigitOn: {color: colors.white},
  codeHidden: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0,
  },
  resendLine: {
    textAlign: 'center',
    color: colors.muted,
    fontWeight: '600',
    fontSize: 13,
  },
  resendLink: {color: colors.navy, fontWeight: '900'},
  linkBtn: {alignItems: 'center', paddingVertical: 10},
  linkText: {
    fontWeight: '800',
    fontSize: 14,
    color: colors.navy,
    textDecorationLine: 'underline',
  },
});

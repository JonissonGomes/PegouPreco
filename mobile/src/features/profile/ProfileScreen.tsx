import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {useFocusEffect, useNavigation} from '@react-navigation/native';
import Geolocation from 'react-native-geolocation-service';
import {
  ChevronRight,
  Database,
  LogOut,
  Shield,
  Sparkles,
  TrendingDown,
} from 'lucide-react-native';
import {AppButton, AppField} from '@/ui/chrome';
import {Screen} from '@/ui/components';
import {FiscalChip, ScreenScrollPad, SoftHeader} from '@/ui/screenChrome';
import {colors, radii, space} from '@/ui/theme';
import {prefs, useAppStore} from '@/store/appStore';
import {syncApi, type AuthResponse, type ReputationRemote} from '@/data/remote/syncApi';
import {apiErrorMessage} from '@/data/remote/apiError';
import {reverseGeocode} from '@/data/remote/reverseGeocode';
import {runDemoSeed} from '@/data/seed/demoSeed';
import {badgeById} from '@/domain/badges';
import {TrustEngine} from '@/domain/trust';
import {formatBrl} from '@/domain/money';
import {
  lifetimeSavings,
  monthsAgo,
  savingsSince,
} from '@/domain/homeInsights';
import type {FiscalLevel} from '@/data/types';
import {MAPBOX_ACCESS_TOKEN} from '@/config/env';
import {refreshPermissionFlags} from '@/app/permissions';

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
  };
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0]?.toUpperCase() ?? '')
    .join('');
}

function ActionRow({
  icon,
  label,
  hint,
  danger,
  onPress,
}: {
  icon: React.ReactNode;
  label: string;
  hint?: string;
  danger?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.actionRow} onPress={onPress}>
      <View style={styles.actionIcon}>{icon}</View>
      <View style={{flex: 1}}>
        <Text style={[styles.actionLabel, danger && {color: colors.danger}]}>
          {label}
        </Text>
        {hint ? <Text style={styles.actionHint}>{hint}</Text> : null}
      </View>
      <ChevronRight size={18} color={colors.muted} />
    </Pressable>
  );
}

export function ProfileScreen() {
  const nav = useNavigation<any>();
  const auth = useAppStore(s => s.auth);
  const setAuth = useAppStore(s => s.setAuth);
  const refresh = useAppStore(s => s.refresh);
  const markets = useAppStore(s => s.markets);
  const lists = useAppStore(s => s.lists);
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [mode, setMode] = useState<Mode>('login');
  const [busy, setBusy] = useState(false);
  const [geoBusy, setGeoBusy] = useState(false);
  const geoBusyRef = useRef(false);
  const geoOnceRef = useRef(false);
  const [devHint, setDevHint] = useState<string | null>(null);
  const [otpSent, setOtpSent] = useState(false);
  const [city, setCity] = useState(() => prefs.getLocationPrefs().city);
  const [neighborhood, setNeighborhood] = useState(
    () => prefs.getLocationPrefs().neighborhood,
  );
  const [uf, setUf] = useState('');
  const [rep, setRep] = useState<ReputationRemote | null>(null);

  const savings3m = useMemo(
    () => savingsSince(lists, monthsAgo(3)),
    [lists],
  );
  const savingsRecent = useMemo(() => {
    const recent = [...lists]
      .sort(
        (a, b) =>
          new Date(b.finishedAt).getTime() - new Date(a.finishedAt).getTime(),
      )
      .slice(0, 5);
    return recent.reduce((s, l) => s + (l.savings ?? 0), 0);
  }, [lists]);
  const savingsAll = useMemo(() => lifetimeSavings(lists), [lists]);
  /** Minimal no header — mesmo padrão da Home/Comunidade. */
  const regionLabel = useMemo(() => {
    const base = [neighborhood, city].filter(Boolean).join(', ');
    if (!base) return '';
    return uf && !base.includes(uf) ? `${base} · ${uf}` : base;
  }, [neighborhood, city, uf]);
  const headerLocation = geoBusy
    ? 'Detectando região…'
    : regionLabel || 'Localização automática';

  const syncRegionToCloud = useCallback(
    async (nextCity: string, nextNeighborhood: string) => {
      const fav = prefs.getLocationPrefs().favoriteMarketIds;
      if (!auth?.token || !auth.emailVerified) return;
      try {
        await syncApi.putPrefs(auth.token, {
          city: nextCity,
          neighborhood: nextNeighborhood,
          favoriteMarketIds: fav
            .map(id => markets.find(m => m.id === id)?.remoteId)
            .filter(Boolean) as string[],
        });
      } catch {
        // offline ok
      }
    },
    [auth?.emailVerified, auth?.token, markets],
  );

  const applyRegion = useCallback(
    async (nextCity: string, nextNeighborhood: string, nextUf?: string) => {
      const fav = prefs.getLocationPrefs().favoriteMarketIds;
      prefs.setLocationPrefs({
        city: nextCity,
        neighborhood: nextNeighborhood,
        favoriteMarketIds: fav,
      });
      setCity(nextCity);
      setNeighborhood(nextNeighborhood);
      if (nextUf) setUf(nextUf);
      await syncRegionToCloud(nextCity, nextNeighborhood);
    },
    [syncRegionToCloud],
  );

  const detectRegion = useCallback(
    async (opts?: {silent?: boolean}) => {
      if (geoBusyRef.current) return;
      geoBusyRef.current = true;
      setGeoBusy(true);
      try {
        const flags = await refreshPermissionFlags();
        useAppStore.setState({permissions: flags});
        if (!flags.location) {
          if (!opts?.silent) {
            Alert.alert(
              'Localização',
              'Ative a permissão de GPS para detectar cidade e estado.',
            );
          }
          return;
        }
        await new Promise<void>((resolve, reject) => {
          Geolocation.getCurrentPosition(
            async pos => {
              try {
                prefs.setLastLocation(
                  pos.coords.latitude,
                  pos.coords.longitude,
                );
                const hit = await reverseGeocode(
                  pos.coords.latitude,
                  pos.coords.longitude,
                  MAPBOX_ACCESS_TOKEN,
                );
                if (hit?.city) {
                  await applyRegion(
                    hit.city,
                    hit.neighborhood || hit.city,
                    hit.uf,
                  );
                } else if (!opts?.silent) {
                  Alert.alert(
                    'Endereço',
                    'Não foi possível identificar a região.',
                  );
                }
                resolve();
              } catch (e) {
                reject(e);
              }
            },
            () => reject(new Error('GPS indisponível')),
            {enableHighAccuracy: true, timeout: 15000, maximumAge: 5000},
          );
        });
      } catch {
        if (!opts?.silent) {
          Alert.alert('GPS', 'Não foi possível usar sua localização agora.');
        }
      } finally {
        geoBusyRef.current = false;
        setGeoBusy(false);
      }
    },
    [applyRegion],
  );

  useFocusEffect(
    useCallback(() => {
      const loc = prefs.getLocationPrefs();
      setCity(loc.city);
      setNeighborhood(loc.neighborhood);
      // Detecta uma vez por sessão (ou se ainda não houver cidade).
      if (!geoOnceRef.current || !loc.city?.trim()) {
        geoOnceRef.current = true;
        void detectRegion({silent: true});
      }
    }, [detectRegion]),
  );

  useEffect(() => {
    if (!auth?.token) {
      setRep(null);
      return;
    }
    syncApi
      .reputation(auth.token)
      .then(setRep)
      .catch(() => setRep(null));
    syncApi
      .me(auth.token)
      .then(me => {
        const role = me.role as 'user' | 'admin' | undefined;
        if (!role || role === auth.role) return;
        setAuth({
          ...auth,
          role,
          emailVerified: !!me.emailVerified,
          phoneVerified: !!me.phoneVerified,
          displayName: String(me.displayName ?? auth.displayName),
        });
      })
      .catch(() => undefined);
  }, [auth?.token]);

  const title =
    mode === 'login'
      ? 'Entrar'
      : mode === 'register'
        ? 'Criar conta'
        : mode === 'otp'
          ? 'Entrar com SMS'
          : 'Confirmar código';

  async function withBusy(fn: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      const msg = apiErrorMessage(e);
      if (msg.includes('não confirmada') || msg.includes('código OTP')) {
        setMode('verify');
        Alert.alert('Confirme a conta', msg);
      } else {
        Alert.alert('Auth', msg);
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

  return (
    <Screen>
      <SoftHeader
        location={headerLocation}
        title={auth ? 'Perfil' : title}
        subtitle={
          !auth && mode === 'login' ? 'Acesse sua conta' : undefined
        }
        trailing={
          auth ? (
            <FiscalChip
              level={
                (rep?.level as FiscalLevel) ??
                TrustEngine.levelForPoints(rep?.points ?? 0)
              }
              points={rep?.points ?? 0}
            />
          ) : undefined
        }
      />
      <KeyboardAvoidingView
        style={{flex: 1}}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={8}>
        <ScrollView
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled">
          <ScreenScrollPad>
          {auth ? (
            <>
              <View style={styles.profileHead}>
                <View style={styles.profileRow}>
                  <View style={styles.avatarWrap}>
                    <View style={styles.avatar}>
                      <Text style={styles.avatarText}>
                        {initials(auth.displayName || auth.email)}
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.verifyChip,
                        auth.emailVerified || auth.phoneVerified
                          ? styles.verifyOk
                          : styles.verifyPending,
                      ]}>
                      <Text
                        style={[
                          styles.verifyChipText,
                          auth.emailVerified || auth.phoneVerified
                            ? styles.verifyOkText
                            : styles.verifyPendingText,
                        ]}
                        numberOfLines={2}>
                        {auth.emailVerified || auth.phoneVerified
                          ? 'Conta verificada'
                          : 'Confirme a conta'}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.profileMeta}>
                    <Text style={styles.displayName} numberOfLines={1}>
                      {auth.displayName}
                    </Text>
                    {auth.email ? (
                      <Text style={styles.contactLine} numberOfLines={1}>
                        {auth.email}
                      </Text>
                    ) : null}
                    {auth.phone ? (
                      <Text style={styles.contactLine} numberOfLines={1}>
                        {auth.phone}
                      </Text>
                    ) : null}
                    {!auth.emailVerified && !auth.phoneVerified ? (
                      <Pressable
                        style={styles.linkBtn}
                        onPress={() =>
                          withBusy(async () => {
                            const data = await syncApi.resendCode({
                              email: auth.email,
                              channel: 'email',
                            });
                            noteDevCode(data);
                            setMode('verify');
                            setEmail(auth.email);
                            Alert.alert('Código', data.hint ?? 'Enviado');
                          })
                        }>
                        <Text style={styles.linkBtnText}>Reenviar código</Text>
                      </Pressable>
                    ) : null}
                  </View>
                </View>
                {rep?.badges?.length ? (
                  <View style={styles.badgeWrap}>
                    {rep.badges.map(id => {
                      const b = badgeById(id);
                      return (
                        <View key={id} style={styles.badgeChip}>
                          <Text style={styles.badgeChipText}>
                            {b?.title ?? id}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                ) : null}
              </View>

              <Pressable
                style={styles.savingsCard}
                onPress={() => nav.navigate('Insights')}>
                <View style={styles.cardHead}>
                  <TrendingDown size={18} color={colors.trustGreen} />
                  <Text style={styles.cardTitle}>Sua economia</Text>
                </View>
                <Text style={styles.savingsHero}>
                  {formatBrl(savings3m)}
                </Text>
                <Text style={styles.savingsHeroLabel}>
                  nos últimos 3 meses
                </Text>
                <View style={styles.savingsRow}>
                  <View style={styles.savingsCell}>
                    <Text style={styles.savingsCellValue}>
                      {formatBrl(savingsRecent)}
                    </Text>
                    <Text style={styles.savingsCellLabel}>
                      últimas 5 compras
                    </Text>
                  </View>
                  <View style={styles.savingsDivider} />
                  <View style={styles.savingsCell}>
                    <Text style={styles.savingsCellValue}>
                      {formatBrl(savingsAll)}
                    </Text>
                    <Text style={styles.savingsCellLabel}>no total</Text>
                  </View>
                </View>
                <View style={styles.insightsCta}>
                  <Sparkles size={14} color={colors.navy} />
                  <Text style={styles.insightsCtaText}>
                    Ver insights de mercados e categorias
                  </Text>
                  <ChevronRight size={16} color={colors.navy} />
                </View>
              </Pressable>

              <View style={styles.actionsCard}>
                {auth.role === 'admin' ? (
                  <ActionRow
                    icon={<Shield size={20} color={colors.navy} />}
                    label="Admin · Mercados"
                    hint="Cadastrar mercados na nuvem"
                    onPress={() => nav.navigate('AdminMarkets')}
                  />
                ) : null}
                {__DEV__ ? (
                  <ActionRow
                    icon={<Database size={20} color={colors.navy} />}
                    label="Recarregar seed demo"
                    onPress={() => {
                      runDemoSeed();
                      refresh();
                      Alert.alert('Seed', 'Banco demo recarregado');
                    }}
                  />
                ) : null}
                <ActionRow
                  icon={<LogOut size={20} color={colors.danger} />}
                  label="Sair"
                  danger
                  onPress={() => setAuth(null)}
                />
              </View>
            </>
          ) : (
            <>

              {mode === 'login' || mode === 'register' ? (
                <View style={styles.tabs}>
                  <Pressable
                    style={[styles.tab, mode === 'login' && styles.tabOn]}
                    onPress={() => setMode('login')}>
                    <Text
                      style={[
                        styles.tabText,
                        mode === 'login' && styles.tabTextOn,
                      ]}>
                      Senha
                    </Text>
                  </Pressable>
                  <Pressable
                    style={styles.tab}
                    onPress={() => {
                      setMode('otp');
                      setDevHint(null);
                    }}>
                    <Text style={styles.tabText}>SMS / OTP</Text>
                  </Pressable>
                </View>
              ) : null}

              {mode === 'register' ? (
                <AppField label="Nome" value={name} onChangeText={setName} />
              ) : null}

              {mode === 'login' || mode === 'register' ? (
                <>
                  <AppField
                    label="E-mail"
                    value={email}
                    onChangeText={setEmail}
                    autoCapitalize="none"
                    keyboardType="email-address"
                  />
                  {mode === 'register' ? (
                    <AppField
                      label="Telefone"
                      value={phone}
                      onChangeText={setPhone}
                      keyboardType="phone-pad"
                      placeholder="(11) 99999-0000"
                    />
                  ) : null}
                  <AppField
                    label="Senha"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry
                  />
                </>
              ) : null}

              {mode === 'otp' ? (
                <AppField
                  label="Telefone"
                  value={phone}
                  onChangeText={setPhone}
                  keyboardType="phone-pad"
                  placeholder="(11) 99999-0000"
                />
              ) : null}

              {mode === 'verify' || (mode === 'otp' && otpSent) ? (
                <AppField
                  label="Código OTP"
                  value={code}
                  onChangeText={setCode}
                  keyboardType="number-pad"
                  maxLength={6}
                />
              ) : null}

              {mode === 'verify' ? (
                <Text style={styles.hint}>
                  Enviamos um código para {phone || email}. Em dev, o código
                  pode aparecer abaixo.
                </Text>
              ) : null}

              {devHint ? <Text style={styles.devHint}>{devHint}</Text> : null}

              <AppButton
                disabled={busy}
                label={
                  busy
                    ? 'Aguarde…'
                    : mode === 'login'
                      ? 'Entrar'
                      : mode === 'register'
                        ? 'Registrar'
                        : mode === 'otp' && !otpSent
                          ? 'Enviar código SMS'
                          : 'Confirmar código'
                }
                onPress={() =>
                  withBusy(async () => {
                    const fallback = {
                      email: email.trim(),
                      phone: phone.trim(),
                      name: name.trim(),
                    };
                    if (mode === 'login') {
                      const data = await syncApi.login(
                        email.trim(),
                        password,
                      );
                      if (!data.token) throw new Error('Token ausente');
                      setAuth(sessionFrom(data, fallback));
                      return;
                    }
                    if (mode === 'register') {
                      if (!phone.trim()) {
                        Alert.alert('Informe o telefone');
                        return;
                      }
                      const data = await syncApi.register({
                        email: email.trim(),
                        password,
                        displayName: name.trim() || email.trim(),
                        phone: phone.trim(),
                      });
                      noteDevCode(data);
                      if (data.token && !data.needsVerification) {
                        setAuth(sessionFrom(data, fallback));
                        return;
                      }
                      setOtpSent(true);
                      setMode('verify');
                      Alert.alert(
                        'Código enviado',
                        data.otpChannel === 'phone'
                          ? 'Confirme o SMS (ou use o código de dev).'
                          : 'Confirme o e-mail (ou use o código de dev).',
                      );
                      return;
                    }
                    if (mode === 'otp' && !otpSent) {
                      if (!phone.trim()) {
                        Alert.alert('Informe o telefone');
                        return;
                      }
                      const data = await syncApi.requestOtp({
                        phone: phone.trim(),
                      });
                      noteDevCode(data);
                      setOtpSent(true);
                      Alert.alert(
                        'Código enviado',
                        'Digite o OTP recebido por SMS.',
                      );
                      return;
                    }
                    const data =
                      mode === 'otp'
                        ? await syncApi.verifyOtp({
                            phone: phone.trim(),
                            code: code.trim(),
                          })
                        : await syncApi.verify({
                            email: email.trim() || undefined,
                            phone: phone.trim() || undefined,
                            code: code.trim(),
                          });
                    if (!data.token) throw new Error('Token ausente');
                    setAuth(sessionFrom(data, fallback));
                  })
                }
              />

              {mode === 'verify' || (mode === 'otp' && otpSent) ? (
                <AppButton
                  label="Reenviar código"
                  outlined
                  disabled={busy}
                  onPress={() =>
                    withBusy(async () => {
                      const data = await syncApi.resendCode({
                        email: email.trim() || undefined,
                        phone: phone.trim() || undefined,
                        channel: phone.trim() ? 'phone' : 'email',
                      });
                      noteDevCode(data);
                      Alert.alert('Código reenviado');
                    })
                  }
                />
              ) : null}

              <AppButton
                label={
                  mode === 'login'
                    ? 'Criar conta'
                    : mode === 'register'
                      ? 'Já tenho conta'
                      : 'Voltar'
                }
                outlined
                onPress={() => {
                  setDevHint(null);
                  setCode('');
                  setOtpSent(false);
                  if (mode === 'login') setMode('register');
                  else setMode('login');
                }}
              />
            </>
          )}
          </ScreenScrollPad>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: {
    paddingHorizontal: space.md,
    gap: space.xxl,
    alignItems: 'stretch',
  },
  profileHead: {
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.md,
    paddingBottom: space.lg,
    gap: space.sm,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.md,
  },
  profileMeta: {
    flex: 1,
    minWidth: 0,
    gap: 3,
    paddingTop: 4,
    paddingBottom: 14,
  },
  avatarWrap: {
    width: 118,
    alignItems: 'center',
    paddingBottom: 14,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.yellow,
    borderWidth: 3,
    borderColor: colors.navy,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {fontSize: 22, fontWeight: '900', color: colors.navy},
  displayName: {fontSize: 17, fontWeight: '800', color: colors.navy},
  contactLine: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.muted,
  },
  verifyChip: {
    position: 'absolute',
    bottom: 2,
    zIndex: 2,
    maxWidth: 118,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radii.pill,
    borderWidth: 1.5,
    borderColor: colors.white,
  },
  verifyOk: {backgroundColor: '#DCFCE7'},
  verifyPending: {backgroundColor: '#FEF9C3'},
  verifyChipText: {fontSize: 11, fontWeight: '800', textAlign: 'center'},
  verifyOkText: {color: colors.trustGreen},
  verifyPendingText: {color: colors.trustYellow},
  linkBtn: {paddingVertical: 2, alignSelf: 'flex-start', marginTop: 2},
  linkBtnText: {
    color: colors.navy,
    fontWeight: '800',
    fontSize: 12,
    textDecorationLine: 'underline',
  },
  badgeWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  badgeChip: {
    backgroundColor: colors.yellow,
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: colors.navy,
  },
  badgeChipText: {fontSize: 10, fontWeight: '800', color: colors.navy},
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'stretch',
    justifyContent: 'center',
  },
  cardTitle: {fontWeight: '800', fontSize: 15, color: colors.navy},
  savingsCard: {
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.md,
    gap: 6,
    alignItems: 'center',
  },
  savingsHero: {
    fontSize: 28,
    fontWeight: '900',
    color: colors.trustGreen,
    marginTop: 4,
  },
  savingsHeroLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.muted,
    marginBottom: 8,
  },
  savingsRow: {
    flexDirection: 'row',
    alignSelf: 'stretch',
    alignItems: 'center',
    backgroundColor: colors.bg,
    borderRadius: radii.md,
    paddingVertical: 12,
  },
  savingsCell: {flex: 1, alignItems: 'center', gap: 2},
  savingsDivider: {
    width: 1,
    alignSelf: 'stretch',
    backgroundColor: colors.border,
  },
  savingsCellValue: {fontWeight: '800', fontSize: 15, color: colors.navy},
  savingsCellLabel: {fontWeight: '600', fontSize: 11, color: colors.muted},
  insightsCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#EEF2FF',
    borderRadius: radii.pill,
  },
  insightsCtaText: {
    fontWeight: '800',
    fontSize: 12,
    color: colors.navy,
  },
  actionsCard: {
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: space.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: 12,
  },
  actionIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: {fontWeight: '800', color: colors.navy, fontSize: 14},
  actionHint: {fontWeight: '600', color: colors.muted, fontSize: 11},
  tabs: {flexDirection: 'row', gap: 8},
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    alignItems: 'center',
  },
  tabOn: {backgroundColor: colors.navy, borderColor: colors.navy},
  tabText: {fontWeight: '700', color: colors.muted, fontSize: 13},
  tabTextOn: {color: colors.white},
  hint: {color: colors.muted, fontSize: 13, fontWeight: '600'},
  devHint: {
    backgroundColor: '#FFF3C4',
    color: colors.navy,
    fontWeight: '800',
    padding: 10,
    borderRadius: 10,
    overflow: 'hidden',
  },
});

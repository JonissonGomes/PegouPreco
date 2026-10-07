import React, {useEffect, useState} from 'react';
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
import {useNavigation} from '@react-navigation/native';
import Geolocation from 'react-native-geolocation-service';
import {
  ChevronRight,
  Database,
  LogOut,
  MapPin,
  RefreshCw,
  Save,
  Shield,
} from 'lucide-react-native';
import {AppButton, AppField, AppScreenHeader} from '@/ui/chrome';
import {FiscalBadge} from '@/ui/components';
import {colors, radii, space} from '@/ui/theme';
import {prefs, useAppStore} from '@/store/appStore';
import {syncApi, type AuthResponse, type ReputationRemote} from '@/data/remote/syncApi';
import {apiErrorMessage} from '@/data/remote/apiError';
import {reverseGeocode} from '@/data/remote/reverseGeocode';
import {runFullSync} from '@/data/syncWorker';
import {runDemoSeed} from '@/data/seed/demoSeed';
import {badgeById} from '@/domain/badges';
import {TrustEngine} from '@/domain/trust';
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
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [mode, setMode] = useState<Mode>('login');
  const [busy, setBusy] = useState(false);
  const [geoBusy, setGeoBusy] = useState(false);
  const [devHint, setDevHint] = useState<string | null>(null);
  const [otpSent, setOtpSent] = useState(false);
  const loc = prefs.getLocationPrefs();
  const [city, setCity] = useState(loc.city);
  const [neighborhood, setNeighborhood] = useState(loc.neighborhood);
  const [favorites, setFavorites] = useState<number[]>(loc.favoriteMarketIds);
  const [rep, setRep] = useState<ReputationRemote | null>(null);
  const [showManualLoc, setShowManualLoc] = useState(false);

  useEffect(() => {
    if (!auth?.token) {
      setRep(null);
      return;
    }
    syncApi
      .reputation(auth.token)
      .then(setRep)
      .catch(() => setRep(null));
    // Atualiza role (admin) se a sessão local for antiga.
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

  async function saveRegion() {
    prefs.setLocationPrefs({
      city,
      neighborhood,
      favoriteMarketIds: favorites,
    });
    if (auth?.token && auth.emailVerified) {
      try {
        await syncApi.putPrefs(auth.token, {
          city,
          neighborhood,
          favoriteMarketIds: favorites
            .map(id => markets.find(m => m.id === id)?.remoteId)
            .filter(Boolean) as string[],
        });
      } catch {
        // offline ok
      }
    }
    Alert.alert('Salvo', 'Preferências de região atualizadas');
  }

  async function useMyLocation() {
    if (geoBusy) return;
    setGeoBusy(true);
    try {
      const flags = await refreshPermissionFlags();
      useAppStore.setState({permissions: flags});
      if (!flags.location) {
        Alert.alert(
          'Localização',
          'Ative a permissão de GPS para detectar cidade e bairro.',
        );
        return;
      }
      await new Promise<void>((resolve, reject) => {
        Geolocation.getCurrentPosition(
          async pos => {
            try {
              const hit = await reverseGeocode(
                pos.coords.latitude,
                pos.coords.longitude,
                MAPBOX_ACCESS_TOKEN,
              );
              if (hit) {
                setCity(hit.city);
                setNeighborhood(hit.neighborhood);
              } else {
                Alert.alert('Endereço', 'Não foi possível identificar a região.');
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
      Alert.alert('GPS', 'Não foi possível usar sua localização agora.');
    } finally {
      setGeoBusy(false);
    }
  }

  return (
    <View style={styles.root}>
      <AppScreenHeader showLogo={false} title="Perfil" />
      <KeyboardAvoidingView
        style={{flex: 1}}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={8}>
        <ScrollView
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled">
          {auth ? (
            <>
              <View style={styles.profileHead}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>
                    {initials(auth.displayName || auth.email)}
                  </Text>
                </View>
                <Text style={styles.displayName}>{auth.displayName}</Text>
                <Text style={styles.contactLine} numberOfLines={1}>
                  {[auth.email, auth.phone].filter(Boolean).join(' · ')}
                </Text>
                <View
                  style={[
                    styles.verifyChip,
                    auth.emailVerified
                      ? styles.verifyOk
                      : styles.verifyPending,
                  ]}>
                  <Text
                    style={[
                      styles.verifyChipText,
                      auth.emailVerified
                        ? styles.verifyOkText
                        : styles.verifyPendingText,
                    ]}>
                    {auth.emailVerified
                      ? 'Conta verificada'
                      : 'Verifique o e-mail para votar'}
                  </Text>
                </View>
                {!auth.emailVerified ? (
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
                <View style={styles.fiscalRow}>
                  <FiscalBadge
                    level={
                      (rep?.level as FiscalLevel) ??
                      TrustEngine.levelForPoints(rep?.points ?? 0)
                    }
                    points={rep?.points ?? 0}
                  />
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

              <Text style={styles.sectionTitle}>Sua região</Text>
              <View style={styles.locCard}>
                <AppButton
                  disabled={geoBusy}
                  label={geoBusy ? 'Detectando…' : 'Usar minha localização'}
                  accent
                  icon={<MapPin size={18} color={colors.navy} />}
                  onPress={() => void useMyLocation()}
                />
                <View style={styles.locChips}>
                  {city ? (
                    <View style={styles.locChip}>
                      <Text style={styles.locChipText}>{city}</Text>
                    </View>
                  ) : null}
                  {neighborhood && neighborhood !== city ? (
                    <View style={[styles.locChip, styles.locChipAlt]}>
                      <Text style={styles.locChipText}>{neighborhood}</Text>
                    </View>
                  ) : null}
                  {!city && !neighborhood ? (
                    <Text style={styles.locEmpty}>
                      Nenhuma região definida ainda
                    </Text>
                  ) : null}
                </View>
                <Pressable onPress={() => setShowManualLoc(v => !v)}>
                  <Text style={styles.manualToggle}>
                    {showManualLoc ? 'Ocultar ajuste manual' : 'Ajustar manualmente'}
                  </Text>
                </Pressable>
                {showManualLoc ? (
                  <>
                    <AppField
                      label="Cidade"
                      value={city}
                      onChangeText={setCity}
                      compact
                    />
                    <AppField
                      label="Bairro"
                      value={neighborhood}
                      onChangeText={setNeighborhood}
                      compact
                    />
                  </>
                ) : null}
              </View>

              <Text style={styles.sectionTitle}>Mercados favoritos</Text>
              <Text style={styles.sectionHint}>Até 8 · toque para marcar</Text>
              <View style={styles.favWrap}>
                {markets.slice(0, 24).map(m => {
                  const on = favorites.includes(m.id);
                  return (
                    <Pressable
                      key={m.id}
                      style={[styles.favChip, on && styles.favChipOn]}
                      onPress={() =>
                        setFavorites(prev =>
                          on
                            ? prev.filter(x => x !== m.id)
                            : [...prev, m.id].slice(0, 8),
                        )
                      }>
                      <Text
                        style={[styles.favChipText, on && styles.favChipTextOn]}
                        numberOfLines={1}>
                        {m.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <View style={styles.actionsCard}>
                <ActionRow
                  icon={<Save size={20} color={colors.navy} />}
                  label="Salvar região"
                  hint="Cidade, bairro e favoritos"
                  onPress={() => void saveRegion()}
                />
                <ActionRow
                  icon={<RefreshCw size={20} color={colors.navy} />}
                  label="Sincronizar"
                  hint="Enviar e baixar dados"
                  onPress={async () => {
                    const r = await runFullSync();
                    Alert.alert(r.ok ? 'Sync' : 'Falha', r.message);
                    if (r.ok && auth.token) {
                      try {
                        setRep(await syncApi.reputation(auth.token));
                      } catch {
                        // ignore
                      }
                    }
                  }}
                />
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
              <Text style={styles.sectionTitle}>{title}</Text>

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
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: colors.bg},
  body: {padding: space.md, gap: 10, paddingBottom: 120},
  profileHead: {
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.lg,
    gap: 6,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.yellow,
    borderWidth: 3,
    borderColor: colors.navy,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {fontSize: 26, fontWeight: '900', color: colors.navy},
  displayName: {fontSize: 20, fontWeight: '800', color: colors.navy},
  contactLine: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.muted,
    maxWidth: '100%',
  },
  verifyChip: {
    marginTop: 4,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: radii.pill,
  },
  verifyOk: {backgroundColor: '#DCFCE7'},
  verifyPending: {backgroundColor: '#FEF9C3'},
  verifyChipText: {fontSize: 11, fontWeight: '800'},
  verifyOkText: {color: colors.trustGreen},
  verifyPendingText: {color: colors.trustYellow},
  linkBtn: {paddingVertical: 4},
  linkBtnText: {
    color: colors.navy,
    fontWeight: '800',
    fontSize: 12,
    textDecorationLine: 'underline',
  },
  fiscalRow: {marginTop: space.sm, width: '100%'},
  badgeWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: space.xs,
    justifyContent: 'center',
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
  sectionTitle: {
    fontWeight: '800',
    fontSize: 16,
    color: colors.navy,
    marginTop: 4,
  },
  sectionHint: {fontSize: 12, fontWeight: '600', color: colors.muted},
  locCard: {
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.md,
    gap: 8,
  },
  locChips: {flexDirection: 'row', flexWrap: 'wrap', gap: 6},
  locChip: {
    backgroundColor: colors.navy,
    borderRadius: radii.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  locChipAlt: {backgroundColor: colors.cyan},
  locChipText: {color: colors.white, fontWeight: '800', fontSize: 12},
  locEmpty: {fontWeight: '600', color: colors.muted, fontSize: 13},
  manualToggle: {
    fontWeight: '700',
    color: colors.navy,
    fontSize: 12,
    textAlign: 'center',
  },
  favWrap: {flexDirection: 'row', flexWrap: 'wrap', gap: 8},
  favChip: {
    maxWidth: '48%',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  favChipOn: {backgroundColor: colors.navy, borderColor: colors.navy},
  favChipText: {fontWeight: '700', color: colors.navy, fontSize: 12},
  favChipTextOn: {color: colors.white},
  actionsCard: {
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    marginTop: space.xs,
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

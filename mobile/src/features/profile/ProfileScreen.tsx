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
import {AppButton, AppField, AppScreenHeader} from '@/ui/chrome';
import {FiscalBadge} from '@/ui/components';
import {colors, space} from '@/ui/theme';
import {prefs, useAppStore} from '@/store/appStore';
import {syncApi, type AuthResponse, type ReputationRemote} from '@/data/remote/syncApi';
import {apiErrorMessage} from '@/data/remote/apiError';
import {runFullSync} from '@/data/syncWorker';
import {runDemoSeed} from '@/data/seed/demoSeed';
import {badgeById} from '@/domain/badges';
import {TrustEngine} from '@/domain/trust';
import type {FiscalLevel} from '@/data/types';

type Mode = 'login' | 'register' | 'verify' | 'otp';

function sessionFrom(data: AuthResponse, fallback: {
  email: string;
  phone: string;
  name: string;
}) {
  return {
    token: data.token!,
    email: data.email ?? fallback.email,
    phone: data.phone ?? (fallback.phone || null),
    displayName: data.displayName ?? (fallback.name || fallback.email),
    emailVerified: !!data.emailVerified,
    phoneVerified: !!data.phoneVerified,
    userId: String(data.userId ?? data.id ?? fallback.email),
  };
}

export function ProfileScreen() {
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
  const [devHint, setDevHint] = useState<string | null>(null);
  const [otpSent, setOtpSent] = useState(false);
  const loc = prefs.getLocationPrefs();
  const [city, setCity] = useState(loc.city);
  const [neighborhood, setNeighborhood] = useState(loc.neighborhood);
  const [favorites, setFavorites] = useState<number[]>(loc.favoriteMarketIds);
  const [rep, setRep] = useState<ReputationRemote | null>(null);

  useEffect(() => {
    if (!auth?.token) {
      setRep(null);
      return;
    }
    syncApi
      .reputation(auth.token)
      .then(setRep)
      .catch(() => setRep(null));
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
    <View style={styles.root}>
      <AppScreenHeader title="Perfil" subtitle="Conta e sincronização" />
      <KeyboardAvoidingView
        style={{flex: 1}}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={8}>
        <ScrollView
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled">
          {auth ? (
            <>
              <View style={styles.card}>
                <Text style={styles.name}>{auth.displayName}</Text>
                <Text style={styles.muted}>{auth.email}</Text>
                {auth.phone ? (
                  <Text style={styles.muted}>{auth.phone}</Text>
                ) : null}
                <Text
                  style={{
                    marginTop: 8,
                    fontWeight: '700',
                    color: auth.emailVerified
                      ? colors.trustGreen
                      : colors.trustYellow,
                  }}>
                  {auth.emailVerified
                    ? 'E-mail verificado — pode contribuir'
                    : 'Verifique o e-mail para contribuir/votar'}
                </Text>
                {!auth.emailVerified ? (
                  <AppButton
                    label="Reenviar código de e-mail"
                    outlined
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
                    }
                  />
                ) : null}
                <View style={{marginTop: 12}}>
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

              <Text style={styles.section}>Região e favoritos</Text>
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
              <Text style={styles.muted}>
                Toque para marcar favoritos (até 8)
              </Text>
              {markets.slice(0, 16).map(m => {
                const on = favorites.includes(m.id);
                return (
                  <Pressable
                    key={m.id}
                    style={[styles.favRow, on && styles.favOn]}
                    onPress={() =>
                      setFavorites(prev =>
                        on
                          ? prev.filter(x => x !== m.id)
                          : [...prev, m.id].slice(0, 8),
                      )
                    }>
                    <Text style={[styles.favText, on && {color: '#fff'}]}>
                      {m.name}
                    </Text>
                  </Pressable>
                );
              })}
              <AppButton
                label="Salvar região"
                onPress={async () => {
                  prefs.setLocationPrefs({
                    city,
                    neighborhood,
                    favoriteMarketIds: favorites,
                  });
                  if (auth.token && auth.emailVerified) {
                    try {
                      await syncApi.putPrefs(auth.token, {
                        city,
                        neighborhood,
                        favoriteMarketIds: favorites
                          .map(
                            id =>
                              markets.find(m => m.id === id)?.remoteId,
                          )
                          .filter(Boolean) as string[],
                      });
                    } catch {
                      // offline ok
                    }
                  }
                  Alert.alert('Salvo', 'Preferências de região atualizadas');
                }}
              />

              <AppButton
                label="Sincronizar agora"
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
              <AppButton
                label="Recarregar seed demo"
                outlined
                onPress={() => {
                  runDemoSeed();
                  refresh();
                  Alert.alert('Seed', 'Banco demo recarregado');
                }}
              />
              <AppButton label="Sair" outlined onPress={() => setAuth(null)} />
            </>
          ) : (
            <>
              <Text style={styles.section}>{title}</Text>

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
  body: {padding: 16, gap: 10, paddingBottom: 140},
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
  },
  name: {fontSize: 22, fontWeight: '800', color: colors.navy},
  muted: {color: colors.muted, marginTop: 4},
  section: {fontWeight: '800', fontSize: 18, color: colors.navy},
  tabs: {flexDirection: 'row', gap: 8},
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#fff',
    alignItems: 'center',
  },
  tabOn: {backgroundColor: colors.navy, borderColor: colors.navy},
  tabText: {fontWeight: '700', color: colors.muted, fontSize: 13},
  tabTextOn: {color: '#fff'},
  hint: {color: colors.muted, fontSize: 13, fontWeight: '600'},
  devHint: {
    backgroundColor: '#FFF3C4',
    color: colors.navy,
    fontWeight: '800',
    padding: 10,
    borderRadius: 10,
    overflow: 'hidden',
  },
  badgeWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: space.sm,
  },
  badgeChip: {
    backgroundColor: colors.bg,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: colors.border,
  },
  badgeChipText: {fontSize: 11, fontWeight: '800', color: colors.navy},
  favRow: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#fff',
    marginBottom: 6,
  },
  favOn: {backgroundColor: colors.navy, borderColor: colors.navy},
  favText: {fontWeight: '700', color: colors.navy},
});

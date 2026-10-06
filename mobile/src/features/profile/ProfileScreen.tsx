import React, {useState} from 'react';
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
import {colors} from '@/ui/theme';
import {useAppStore} from '@/store/appStore';
import {syncApi, type AuthResponse} from '@/data/remote/syncApi';
import {apiErrorMessage} from '@/data/remote/apiError';
import {runFullSync} from '@/data/syncWorker';
import {runDemoSeed} from '@/data/seed/demoSeed';

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
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [mode, setMode] = useState<Mode>('login');
  const [busy, setBusy] = useState(false);
  const [devHint, setDevHint] = useState<string | null>(null);
  const [otpSent, setOtpSent] = useState(false);

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
                    color:
                      auth.emailVerified || auth.phoneVerified
                        ? colors.trustGreen
                        : colors.trustYellow,
                  }}>
                  {auth.emailVerified || auth.phoneVerified
                    ? 'Conta confirmada'
                    : 'Confirmação pendente'}
                </Text>
              </View>
              <AppButton
                label="Sincronizar agora"
                onPress={async () => {
                  const r = await runFullSync();
                  Alert.alert(r.ok ? 'Sync' : 'Falha', r.message);
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
});

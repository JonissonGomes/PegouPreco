import React, {useState} from 'react';
import {Alert, ScrollView, StyleSheet, Text, View} from 'react-native';
import {AppButton, AppField, AppScreenHeader} from '@/ui/chrome';
import {colors} from '@/ui/theme';
import {useAppStore} from '@/store/appStore';
import {syncApi} from '@/data/remote/syncApi';
import {runFullSync} from '@/data/syncWorker';
import {runDemoSeed} from '@/data/seed/demoSeed';

export function ProfileScreen() {
  const auth = useAppStore(s => s.auth);
  const setAuth = useAppStore(s => s.setAuth);
  const refresh = useAppStore(s => s.refresh);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [mode, setMode] = useState<'login' | 'register' | 'verify'>('login');

  return (
    <View style={styles.root}>
      <AppScreenHeader title="Perfil" subtitle="Conta e sincronização" />
      <ScrollView contentContainerStyle={styles.body}>
        {auth ? (
          <>
            <View style={styles.card}>
              <Text style={styles.name}>{auth.displayName}</Text>
              <Text style={styles.muted}>{auth.email}</Text>
              <Text
                style={{
                  marginTop: 8,
                  fontWeight: '700',
                  color: auth.emailVerified
                    ? colors.trustGreen
                    : colors.trustYellow,
                }}>
                {auth.emailVerified
                  ? 'E-mail confirmado'
                  : 'E-mail pendente de confirmação'}
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
            <AppButton
              label="Sair"
              outlined
              onPress={() => setAuth(null)}
            />
          </>
        ) : (
          <>
            <Text style={styles.section}>
              {mode === 'login'
                ? 'Entrar'
                : mode === 'register'
                  ? 'Criar conta'
                  : 'Confirmar e-mail'}
            </Text>
            {mode === 'register' ? (
              <AppField label="Nome" value={name} onChangeText={setName} />
            ) : null}
            {mode !== 'verify' ? (
              <>
                <AppField
                  label="E-mail"
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                />
                <AppField
                  label="Senha"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                />
              </>
            ) : (
              <AppField label="Código" value={code} onChangeText={setCode} />
            )}
            <AppButton
              label={
                mode === 'login'
                  ? 'Entrar'
                  : mode === 'register'
                    ? 'Registrar'
                    : 'Verificar'
              }
              onPress={async () => {
                try {
                  if (mode === 'login') {
                    const data = await syncApi.login(email.trim(), password);
                    setAuth({
                      token: data.token,
                      email: data.email ?? email,
                      displayName: data.displayName ?? email,
                      emailVerified: !!data.emailVerified,
                      userId: data.userId ?? data.id ?? email,
                    });
                  } else if (mode === 'register') {
                    await syncApi.register({
                      email: email.trim(),
                      password,
                      displayName: name.trim() || email.trim(),
                    });
                    setMode('verify');
                    Alert.alert('Código enviado', 'Confirme o e-mail');
                  } else {
                    const data = await syncApi.verify(email.trim(), code.trim());
                    setAuth({
                      token: data.token,
                      email: data.email ?? email,
                      displayName:
                        data.displayName ?? (name.trim() || email.trim()),
                      emailVerified: true,
                      userId: data.userId ?? data.id ?? email,
                    });
                  }
                } catch (e) {
                  Alert.alert(
                    'Auth',
                    e instanceof Error ? e.message : 'Falha',
                  );
                }
              }}
            />
            <AppButton
              label={
                mode === 'login' ? 'Criar conta' : 'Já tenho conta'
              }
              outlined
              onPress={() =>
                setMode(mode === 'login' ? 'register' : 'login')
              }
            />
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: colors.bg},
  body: {padding: 16, gap: 10, paddingBottom: 120},
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
});

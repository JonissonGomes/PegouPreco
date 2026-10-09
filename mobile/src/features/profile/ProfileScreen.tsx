import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
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
  ClipboardList,
  History,
  Fingerprint,
  LogOut,
  Map,
  ScanLine,
  Shield,
  Sparkles,
  Store,
  TrendingDown,
  UsersRound,
} from 'lucide-react-native';
import {Screen} from '@/ui/components';
import {FiscalChip, ScreenScrollPad, SoftHeader} from '@/ui/screenChrome';
import {colors, radii, space} from '@/ui/theme';
import {prefs, useAppStore} from '@/store/appStore';
import {syncApi, type ReputationRemote} from '@/data/remote/syncApi';
import {registerPasskey} from '@/data/remote/passkeyAuth';
import {apiErrorMessage} from '@/data/remote/apiError';
import {appAlert} from '@/ui/appDialog';
import {reverseGeocode} from '@/data/remote/reverseGeocode';
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
import {AuthPanel} from './AuthPanel';

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
  const lists = useAppStore(s => s.lists);
  const [, setGeoBusy] = useState(false);
  const geoBusyRef = useRef(false);
  const geoOnceRef = useRef(false);
  const [city, setCity] = useState(() => prefs.getLocationPrefs().city);
  const [neighborhood, setNeighborhood] = useState(
    () => prefs.getLocationPrefs().neighborhood,
  );
  const [uf, setUf] = useState('');
  const [rep, setRep] = useState<ReputationRemote | null>(null);
  const [passkeyOn, setPasskeyOn] = useState(false);

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

  const headerLocation = useMemo(() => {
    const parts = [neighborhood, city, uf].filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0]}, ${parts[1]}${uf ? ` · ${uf}` : ''}`;
    }
    return city || neighborhood || undefined;
  }, [city, neighborhood, uf]);

  const detectRegion = useCallback(
    async (opts?: {silent?: boolean}) => {
      if (geoBusyRef.current) return;
      geoBusyRef.current = true;
      setGeoBusy(true);
      try {
        await refreshPermissionFlags();
        await new Promise<void>((resolve, reject) => {
          Geolocation.getCurrentPosition(
            async pos => {
              try {
                const geo = await reverseGeocode(
                  pos.coords.latitude,
                  pos.coords.longitude,
                  MAPBOX_ACCESS_TOKEN,
                );
                const nextCity = geo.city || city;
                const nextNb = geo.neighborhood || neighborhood;
                const nextUf = geo.region || uf;
                if (nextCity) setCity(nextCity);
                if (nextNb) setNeighborhood(nextNb);
                if (nextUf) setUf(nextUf);
                prefs.setLocationPrefs({
                  city: nextCity,
                  neighborhood: nextNb,
                });
                if (auth?.token && auth.emailVerified) {
                  try {
                    await syncApi.putPrefs(auth.token, {
                      city: nextCity,
                      neighborhood: nextNb,
                      uf: nextUf || undefined,
                    });
                  } catch {
                    /* offline ok */
                  }
                }
                resolve();
              } catch (e) {
                reject(e);
              }
            },
            err => reject(err),
            {enableHighAccuracy: true, timeout: 12000, maximumAge: 60_000},
          );
        });
      } catch (e) {
        if (!opts?.silent) {
          appAlert('Localização', apiErrorMessage(e));
        }
      } finally {
        geoBusyRef.current = false;
        setGeoBusy(false);
      }
    },
    [auth?.emailVerified, auth?.token, city, neighborhood, uf],
  );

  useFocusEffect(
    useCallback(() => {
      const loc = prefs.getLocationPrefs();
      setCity(loc.city);
      setNeighborhood(loc.neighborhood);
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
        setPasskeyOn(!!me.hasPasskey);
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

  if (!auth) {
    return <AuthPanel location={headerLocation} />;
  }

  return (
    <Screen>
      <SoftHeader
        location={headerLocation}
        title="Perfil"
        trailing={
          <FiscalChip
            level={
              (rep?.level as FiscalLevel) ??
              TrustEngine.levelForPoints(rep?.points ?? 0)
            }
            points={rep?.points ?? 0}
          />
        }
      />
      <ScrollView
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled">
        <ScreenScrollPad>
          <View style={styles.stack}>
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
                      onPress={async () => {
                        try {
                          const data = await syncApi.resendCode({
                            email: auth.email,
                            channel: 'email',
                          });
                          appAlert(
                            'Código no e-mail',
                            data.hint ??
                              (data.devCode
                                ? `Código (dev): ${data.devCode}`
                                : 'Enviamos um novo código para o seu e-mail.'),
                          );
                        } catch (e) {
                          appAlert('PegouPreço', apiErrorMessage(e));
                        }
                      }}>
                      <Text style={styles.linkBtnText}>
                        Reenviar código no e-mail
                      </Text>
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
              <Text style={styles.savingsHero}>{formatBrl(savings3m)}</Text>
              <Text style={styles.savingsHeroLabel}>nos últimos 3 meses</Text>
              <View style={styles.savingsRow}>
                <View style={styles.savingsCell}>
                  <Text style={styles.savingsCellValue}>
                    {formatBrl(savingsRecent)}
                  </Text>
                  <Text style={styles.savingsCellLabel}>últimas 5 compras</Text>
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
              <ActionRow
                icon={<TrendingDown size={20} color={colors.navy} />}
                label="Insights"
                hint="Rankings e economia por mercado"
                onPress={() => nav.navigate('Insights')}
              />
              <ActionRow
                icon={<Map size={20} color={colors.navy} />}
                label="Mapa"
                hint="Mercados perto de você"
                onPress={() => nav.navigate('Map')}
              />
              <ActionRow
                icon={<Store size={20} color={colors.navy} />}
                label="Compras"
                hint="Registrar itens no mercado"
                onPress={() => nav.navigate('Lists')}
              />
              <ActionRow
                icon={<ClipboardList size={20} color={colors.navy} />}
                label="Listas salvas"
                hint="Compras finalizadas"
                onPress={() => nav.navigate('ShoppingLists')}
              />
              <ActionRow
                icon={<History size={20} color={colors.navy} />}
                label="Histórico"
                hint="Evolução de preços dos produtos"
                onPress={() => nav.navigate('History')}
              />
              <ActionRow
                icon={<UsersRound size={20} color={colors.navy} />}
                label="Comunidade"
                hint="Validar preços perto de você"
                onPress={() => nav.navigate('Community')}
              />
              <ActionRow
                icon={<ScanLine size={20} color={colors.navy} />}
                label="Capturar"
                hint="Foto de etiqueta ou NFC-e"
                onPress={() => nav.navigate('Capture')}
              />
              {auth.role === 'admin' ? (
                <ActionRow
                  icon={<Shield size={20} color={colors.navy} />}
                  label="Admin · Mercados"
                  hint="Cadastrar mercados na nuvem"
                  onPress={() => nav.navigate('AdminMarkets')}
                />
              ) : null}
              <ActionRow
                icon={<Fingerprint size={20} color={colors.navy} />}
                label={passkeyOn ? 'Desabilitar passkey' : 'Ativar passkey'}
                hint={
                  passkeyOn
                    ? 'Biometria já está ativa neste aparelho'
                    : 'Entrar neste aparelho com biometria'
                }
                onPress={() => {
                  if (passkeyOn) {
                    appAlert(
                      'Desabilitar passkey',
                      'Este aparelho deixa de entrar com biometria.',
                      [
                        {label: 'Cancelar', style: 'cancel'},
                        {
                          label: 'Desabilitar',
                          style: 'destructive',
                          onPress: () => {
                            void syncApi
                              .disablePasskey(auth.token)
                              .then(() => {
                                setPasskeyOn(false);
                                appAlert(
                                  'Passkey',
                                  'Passkey desabilitada neste aparelho.',
                                );
                              })
                              .catch(e =>
                                appAlert('PegouPreço', apiErrorMessage(e)),
                              );
                          },
                        },
                      ],
                    );
                    return;
                  }
                  void registerPasskey(auth.token)
                    .then(() => {
                      setPasskeyOn(true);
                      appAlert(
                        'PegouPreço',
                        'Passkey ativada. Na próxima vez use Entrar com passkey.',
                      );
                    })
                    .catch(e => appAlert('PegouPreço', apiErrorMessage(e)));
                }}
              />
              <ActionRow
                icon={<LogOut size={20} color={colors.danger} />}
                label="Sair"
                danger
                onPress={() => setAuth(null)}
              />
            </View>
          </View>
        </ScreenScrollPad>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: {
    paddingHorizontal: space.md,
    alignItems: 'stretch',
  },
  stack: {
    gap: 28,
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
});

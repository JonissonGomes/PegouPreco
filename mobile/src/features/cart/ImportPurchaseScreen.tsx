import React, {useCallback, useEffect, useRef, useState} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {Camera, useCameraDevice, useCodeScanner} from 'react-native-vision-camera';
import {ArrowLeft} from 'lucide-react-native';
import {AppButton, AppField} from '@/ui/chrome';
import {appAlert} from '@/ui/appDialog';
import {KeyboardSafeSheet} from '@/ui/keyboardSheet';
import {BackCircleButton, SoftHeader} from '@/ui/screenChrome';
import {colors, space} from '@/ui/theme';
import {nfceConsultUrl} from '@/domain/nfceScan';
import {
  archiveNfcePurchase,
  previewPastNfce,
  type NfceDraft,
} from '@/data/archivePurchase';
import {NfceReviewSheet} from '@/features/cart/NfceReviewSheet';
import {refreshPermissionFlags} from '@/app/permissions';
import {useAppStore} from '@/store/appStore';
import {requestAutoSync} from '@/data/syncWorker';

export function ImportPurchaseScreen() {
  const nav = useNavigation<any>();
  const refresh = useAppStore(s => s.refresh);
  const device = useCameraDevice('back');
  const cameraGranted = useAppStore(s => s.permissions.camera);
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [draft, setDraft] = useState<NfceDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const lock = useRef<string | null>(null);

  const ensureCamera = useCallback(async () => {
    const flags = await refreshPermissionFlags();
    useAppStore.setState({permissions: flags});
    if (flags.camera) return;
    const status = await Camera.requestCameraPermission();
    useAppStore.setState({
      permissions: {...flags, camera: status === 'granted'},
    });
  }, []);

  useEffect(() => {
    void ensureCamera();
  }, [ensureCamera]);

  const run = useCallback(
    async (raw: string) => {
      const target = nfceConsultUrl(raw.trim());
      if (!target) {
        appAlert(
          'Nota fiscal',
          'Não reconheci o QR da NFC-e. Cole o link da consulta ou enquadre o código do rodapé.',
        );
        return;
      }
      if (lock.current === target) return;
      lock.current = target;
      setBusy(true);
      try {
        const preview = await previewPastNfce(target);
        if ('ok' in preview) {
          lock.current = null;
          appAlert(
            'Nota fiscal',
            preview.reason === 'duplicate'
              ? 'Essa nota já está no histórico.'
              : 'A consulta não trouxe itens. Tente o QR do rodapé.',
          );
          return;
        }
        setDraft(preview);
      } catch (e) {
        lock.current = null;
        appAlert('SEFAZ', e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  const saveDraft = async (purchasedAt: string) => {
    if (!draft) return;
    setSaving(true);
    try {
      const outcome = await archiveNfcePurchase(
        draft.parsed,
        draft.qrUrl,
        purchasedAt,
      );
      if (!outcome.ok) {
        appAlert(
          'Nota fiscal',
          outcome.reason === 'duplicate'
            ? 'Essa nota já está no histórico.'
            : 'A consulta não trouxe itens.',
        );
        return;
      }
      refresh();
      requestAutoSync('nfce');
      setDraft(null);
      const mapNote = outcome.placedOnMap
        ? ' O mercado foi cadastrado no mapa.'
        : outcome.mapKnown
          ? ''
          : ' Se o mercado não aparecer no mapa, segure o local para adicionar.';
      appAlert(
        'Compra salva',
        `${outcome.itemCount} itens de ${outcome.marketName} entraram no histórico.${mapNote}`,
        [{label: 'Ver listas', style: 'primary', onPress: () => nav.goBack()}],
      );
    } catch (e) {
      appAlert('SEFAZ', e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const codeScanner = useCodeScanner({
    codeTypes: ['qr', 'pdf-417'],
    onCodeScanned: codes => {
      if (busy) return;
      const value = codes.map(c => c.value).find((v): v is string => !!v);
      if (!value || !nfceConsultUrl(value)) return;
      void run(value);
    },
  });

  return (
    <View style={styles.root}>
      <SoftHeader
        title="Cadastrar nota"
        subtitle="O QR da NFC-e alimenta o comparador"
        leading={
          <BackCircleButton onPress={() => nav.goBack()}>
            <ArrowLeft color={colors.navy} size={22} />
          </BackCircleButton>
        }
      />
      <View style={styles.stage}>
        {cameraGranted && device ? (
          <Camera
            style={StyleSheet.absoluteFill}
            device={device}
            isActive={!pasteOpen && !busy && draft == null}
            codeScanner={codeScanner}
          />
        ) : (
          <View style={styles.idle}>
            <Text style={styles.idleText}>
              {cameraGranted
                ? 'Preparando a câmera…'
                : 'Libere a câmera para ler o QR da nota.'}
            </Text>
            {!cameraGranted ? (
              <AppButton label="Liberar câmera" onPress={() => void ensureCamera()} />
            ) : null}
          </View>
        )}
        {busy ? <Text style={styles.badge}>Lendo a nota…</Text> : null}
      </View>
      <View style={styles.footer}>
        <Text style={styles.hint}>
          Aponte para o QR do rodapé. Você vê o resumo e decide se salva no histórico.
        </Text>
        <AppButton label="Colar link da consulta" outlined onPress={() => setPasteOpen(true)} />
      </View>
      <KeyboardSafeSheet visible={pasteOpen} onClose={() => setPasteOpen(false)}>
        <Text style={styles.sheetTitle}>Link da NFC-e</Text>
        <AppField
          value={url}
          onChangeText={setUrl}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="https://…nfce…"
        />
        <AppButton
          label={busy ? 'Importando…' : 'Importar'}
          disabled={busy || !url.trim()}
          onPress={() => {
            setPasteOpen(false);
            void run(url);
          }}
        />
      </KeyboardSafeSheet>
      <NfceReviewSheet
        draft={draft}
        saving={saving}
        onClose={() => {
          lock.current = null;
          setDraft(null);
        }}
        onSave={purchasedAt => void saveDraft(purchasedAt)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: colors.bg},
  stage: {flex: 1, backgroundColor: '#111', overflow: 'hidden'},
  idle: {flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.lg, gap: 16},
  idleText: {color: '#fff', fontWeight: '700', textAlign: 'center'},
  badge: {
    position: 'absolute',
    alignSelf: 'center',
    bottom: 16,
    backgroundColor: colors.yellowBright,
    color: colors.navy,
    fontWeight: '800',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    overflow: 'hidden',
  },
  footer: {padding: space.md, gap: 12},
  hint: {color: colors.muted, fontWeight: '600', lineHeight: 20},
  sheetTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: colors.navy,
    marginBottom: 12,
  },
});

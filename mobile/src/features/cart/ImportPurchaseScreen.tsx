import React, {useCallback, useEffect, useRef, useState} from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {useNavigation, useRoute} from '@react-navigation/native';
import {Camera} from 'react-native-vision-camera';
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
import {SavedMarketReview} from '@/features/cart/SavedMarketReview';
import {useReceiptCamera} from '@/features/cart/useReceiptCamera';
import {useAppStore} from '@/store/appStore';
import {requestAutoSync} from '@/data/syncWorker';

export function ImportPurchaseScreen() {
  const nav = useNavigation<any>();
  const route = useRoute<any>();
  const refresh = useAppStore(s => s.refresh);
  const lists = useAppStore(s => s.lists);
  const [replaceListId, setReplaceListId] = useState<number | null>(
    () => {
      const id = Number(route.params?.replaceListId);
      return Number.isFinite(id) && id > 0 ? id : null;
    },
  );
  const replacing = lists.find(list => list.id === replaceListId) ?? null;

  useEffect(() => {
    const id = Number(route.params?.replaceListId);
    setReplaceListId(Number.isFinite(id) && id > 0 ? id : null);
  }, [route.params?.replaceListId]);
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [draft, setDraft] = useState<NfceDraft | null>(null);
  const [rateMarket, setRateMarket] = useState<{
    id: number | null;
    name: string;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const lock = useRef<string | null>(null);

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

  const cam = useReceiptCamera(
    value => void run(value),
    busy || pasteOpen || draft != null,
  );

  const saveDraft = async (purchasedAt: string) => {
    if (!draft) return;
    setSaving(true);
    try {
      const outcome = await archiveNfcePurchase(
        draft.parsed,
        draft.qrUrl,
        purchasedAt,
        replaceListId,
      );
      if (!outcome.ok) {
        appAlert(
          'Nota fiscal',
          outcome.reason === 'duplicate'
            ? 'Essa nota já está no histórico.'
            : outcome.reason === 'missing'
              ? 'A lista que seria substituída não está mais salva.'
              : 'A consulta não trouxe itens.',
        );
        return;
      }
      refresh();
      requestAutoSync('nfce');
      setDraft(null);
      lock.current = null;
      setReplaceListId(null);
      nav.setParams({replaceListId: undefined});
      setRateMarket({
        id: outcome.marketId,
        name: outcome.marketName,
      });
    } catch (e) {
      appAlert('SEFAZ', e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.root}>
      <SoftHeader
        title={replacing ? 'Ler nota da lista' : 'Cadastrar nota'}
        subtitle={
          replacing
            ? `Substitui “${replacing.name}” pelos itens da nota`
            : 'O QR da NFC-e alimenta o comparador'
        }
        leading={
          <BackCircleButton onPress={() => nav.goBack()}>
            <ArrowLeft color={colors.navy} size={22} />
          </BackCircleButton>
        }
      />
      <View
        style={styles.stage}
        onLayout={e =>
          cam.onLayout(e.nativeEvent.layout.width, e.nativeEvent.layout.height)
        }>
        {cam.cameraGranted && cam.device ? (
          <>
          <Camera
            ref={cam.cameraRef}
            style={StyleSheet.absoluteFill}
            device={cam.device}
            isActive={!pasteOpen && !busy && draft == null}
            codeScanner={cam.codeScanner}
            zoom={cam.zoom}
            enableZoomGesture
            onInitialized={() => cam.focusCenter()}
          />
          <Pressable
            style={styles.frameHit}
            onPress={e => cam.focusTap(e.nativeEvent.locationX, e.nativeEvent.locationY)}>
            <View style={styles.frame} pointerEvents="none" />
            <Text style={styles.frameHint}>
              Enquadre o QR do rodapé. A câmera aproxima e foca sozinha.
            </Text>
          </Pressable>
          <View style={styles.zoomRow}>
            <Pressable
              style={styles.zoomBtn}
              onPress={() => cam.nudgeZoom(-0.4)}>
              <Text style={styles.zoomText}>−</Text>
            </Pressable>
            <Pressable
              style={styles.zoomBtn}
              onPress={() => cam.nudgeZoom(0.4)}>
              <Text style={styles.zoomText}>+</Text>
            </Pressable>
          </View>
          </>
        ) : (
          <View style={styles.idle}>
            <Text style={styles.idleText}>
              {cam.cameraGranted
                ? 'Preparando a câmera…'
                : 'Libere a câmera para ler o QR da nota.'}
            </Text>
            {!cam.cameraGranted ? (
              <AppButton label="Liberar câmera" onPress={() => void cam.ensureCamera()} />
            ) : null}
          </View>
        )}
        {busy ? <Text style={styles.badge}>Lendo a nota…</Text> : null}
      </View>
      <View style={styles.footer}>
        <Text style={styles.hint}>
          {replacing
            ? 'Aponte para o QR do rodapé. A nota substitui os itens e os valores desta lista.'
            : 'Aponte para o QR do rodapé. Você vê o resumo e decide se salva no histórico.'}
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
        saveLabel={replacing ? 'Confirmar nota fiscal' : 'Salvar no histórico'}
        hint={
          replacing
            ? 'Os itens, os preços e o mercado da nota passam a ser esta lista.'
            : 'Confira os itens antes de salvar no histórico.'
        }
        onClose={() => {
          lock.current = null;
          setDraft(null);
        }}
        onSave={purchasedAt => void saveDraft(purchasedAt)}
      />
      <SavedMarketReview
        visible={rateMarket != null}
        marketId={rateMarket?.id ?? null}
        marketName={rateMarket?.name ?? 'Mercado'}
        onClose={() => setRateMarket(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: colors.bg},
  stage: {flex: 1, backgroundColor: '#111', overflow: 'hidden'},
  frameHit: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  frame: {
    width: 220,
    height: 220,
    borderRadius: 24,
    borderWidth: 3,
    borderColor: colors.yellow,
    backgroundColor: 'transparent',
  },
  frameHint: {
    marginTop: 16,
    color: '#fff',
    fontWeight: '800',
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  zoomRow: {
    position: 'absolute',
    right: 16,
    top: 16,
    gap: 8,
  },
  zoomBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomText: {color: '#fff', fontSize: 22, fontWeight: '800'},
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

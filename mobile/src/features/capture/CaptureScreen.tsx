import React, {useCallback, useState} from 'react';
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {Camera, useCameraDevice} from 'react-native-vision-camera';
import {FileText, QrCode, ScanLine} from 'lucide-react-native';
import {AppButton, AppField, AppScreenHeader} from '@/ui/chrome';
import {KeyboardSafeSheet} from '@/ui/keyboardSheet';
import {colors} from '@/ui/theme';
import {parseLabel, type LabelFields} from '@/domain/labelParser';
import {formatBrl, parseBrl} from '@/domain/money';
import {refreshPermissionFlags} from '@/app/permissions';
import {
  cartRepo,
  marketRepo,
  prefs,
  priceLogRepo,
  productRepo,
  useAppStore,
  useMarketName,
} from '@/store/appStore';
import {fetchAndParseNfce} from '@/data/remote/sefazClient';

type ExtraMode = 'none' | 'text' | 'nfce';

export function CaptureScreen() {
  const activeListName = useAppStore(s => s.activeListName);
  const activeMarketId = useAppStore(s => s.activeMarketId);
  const refresh = useAppStore(s => s.refresh);
  const cameraGranted = useAppStore(s => s.permissions.camera);
  const marketName = useMarketName(activeMarketId);
  const device = useCameraDevice('back');
  const [cameraOn, setCameraOn] = useState(false);
  const [fields, setFields] = useState<LabelFields | null>(null);
  const [raw, setRaw] = useState('');
  const [qrUrl, setQrUrl] = useState('');
  const [extra, setExtra] = useState<ExtraMode>('none');

  const ensureList = () => {
    if (!activeListName || !activeMarketId) {
      Alert.alert(
        'Lista necessária',
        'Inicie uma lista no Carrinho antes de capturar.',
      );
      return false;
    }
    return true;
  };

  const applyFields = (f: LabelFields) => {
    setFields({...f});
    setRaw(f.rawText);
  };

  const runOcrFromText = (text: string) => {
    const parsed = parseLabel(text);
    if (!parsed) {
      Alert.alert('Etiqueta', 'Não foi possível ler o preço. Ajuste e tente de novo.');
      return;
    }
    applyFields(parsed);
  };

  const onCapturePhoto = useCallback(async () => {
    if (!ensureList()) return;
    try {
      if (!device) {
        runOcrFromText(
          'Cerveja Spaten 350ml c/12\nVarejo R$ 47,90\nAtacado a partir de 2 R$ 42,90',
        );
        return;
      }
      Alert.alert('Ler etiqueta', 'Como deseja continuar?', [
        {
          text: 'Usar exemplo',
          onPress: () =>
            runOcrFromText(
              'Arroz Tipo 1 Camil 5kg\nPreço varejo R$ 24,90\nAtacado a partir de 3 R$ 21,90',
            ),
        },
        {
          text: 'Colar texto',
          onPress: () => setExtra('text'),
        },
        {text: 'Cancelar', style: 'cancel'},
      ]);
    } catch (e) {
      Alert.alert('Erro', e instanceof Error ? e.message : String(e));
    }
  }, [device, activeListName, activeMarketId]);

  const ensureCamera = async () => {
    const flags = await refreshPermissionFlags();
    useAppStore.setState({permissions: flags});
    if (flags.camera) {
      setCameraOn(true);
      return true;
    }
    const status = await Camera.requestCameraPermission();
    const granted = status === 'granted';
    useAppStore.setState({permissions: {...flags, camera: granted}});
    if (!granted) {
      Alert.alert(
        'Câmera necessária',
        'Ative a permissão de câmera nas configurações para ler etiquetas.',
      );
      return false;
    }
    setCameraOn(true);
    return true;
  };

  const saveToCart = () => {
    if (!fields?.productName || fields.retailPrice == null) {
      Alert.alert('Preencha produto e preço varejo');
      return;
    }
    const product = productRepo.resolveOrCreate(fields.productName);
    const marketId = prefs.getActiveMarketId();
    const now = new Date().toISOString();
    priceLogRepo.insert({
      productId: product.id,
      marketId,
      retailPrice: fields.retailPrice,
      wholesalePrice: fields.wholesalePrice,
      minWholesaleQty: fields.minWholesaleQty,
      source: 'label',
      capturedAt: now,
      remoteId: null,
      nfceKey: null,
      confirmScore: 0,
      rejectScore: 0,
      trustLevel: 'suspect',
      lastConfirmedAt: null,
      contributorId: prefs.getLocalUserId(),
      updatedAt: now,
      synced: 0,
    });
    cartRepo.upsert({
      productId: product.id,
      productName: fields.productName,
      quantity: 1,
      retailPrice: fields.retailPrice,
      wholesalePrice: fields.wholesalePrice,
      minWholesaleQty: fields.minWholesaleQty,
    });
    refresh();
    setFields(null);
    Alert.alert('Salvo', 'Item adicionado ao carrinho');
  };

  const fetchNfce = async () => {
    if (!ensureList() || !qrUrl.trim()) return;
    try {
      const parsed = await fetchAndParseNfce(qrUrl.trim());
      if (parsed.marketName) {
        const m = marketRepo.resolveOrCreate(
          parsed.marketName,
          parsed.marketCnpj,
        );
        prefs.setCurrentMarketId(m.id);
      }
      if (!parsed.items.length) {
        Alert.alert('NFC-e', 'Nenhum item encontrado');
        return;
      }
      for (const it of parsed.items) {
        const product = productRepo.resolveOrCreate(it.description);
        const now = new Date().toISOString();
        priceLogRepo.insert({
          productId: product.id,
          marketId: prefs.getActiveMarketId(),
          retailPrice: it.unitPrice,
          wholesalePrice: null,
          minWholesaleQty: null,
          source: 'nfce',
          capturedAt: now,
          remoteId: null,
          nfceKey: null,
          confirmScore: 0,
          rejectScore: 0,
          trustLevel: 'suspect',
          lastConfirmedAt: null,
          contributorId: prefs.getLocalUserId(),
          updatedAt: now,
          synced: 0,
        });
        cartRepo.upsert({
          productId: product.id,
          productName: it.description,
          quantity: it.quantity,
          retailPrice: it.unitPrice,
        });
      }
      refresh();
      setExtra('none');
      setQrUrl('');
      Alert.alert('NFC-e', `${parsed.items.length} itens adicionados`);
    } catch (e) {
      Alert.alert('SEFAZ', e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <View style={styles.root}>
      <AppScreenHeader
        title="Capturar"
        subtitle={marketName || activeListName || 'Aponte para a etiqueta'}
      />

      <View style={styles.stage}>
        {cameraOn && cameraGranted && device ? (
          <Camera style={StyleSheet.absoluteFill} device={device} isActive />
        ) : (
          <View style={styles.stageIdle}>
            <ScanLine size={36} color={colors.yellowBright} strokeWidth={2} />
            <Text style={styles.stageTitle}>Enquadre a etiqueta</Text>
            <Text style={styles.stageHint}>
              Centralize o nome do produto e o preço no quadro
            </Text>
          </View>
        )}
        <View style={styles.frame} pointerEvents="none">
          <View style={[styles.corner, styles.tl]} />
          <View style={[styles.corner, styles.tr]} />
          <View style={[styles.corner, styles.bl]} />
          <View style={[styles.corner, styles.br]} />
        </View>
      </View>

      <View style={styles.dock}>
        <AppButton
          icon={<ScanLine size={20} color="#fff" />}
          label={cameraOn ? 'Ler etiqueta' : 'Abrir câmera'}
          onPress={async () => {
            if (!cameraOn) {
              const ok = await ensureCamera();
              if (!ok) return;
            }
            onCapturePhoto();
          }}
        />
        <View style={styles.altRow}>
          <Pressable
            style={[styles.altBtn, extra === 'text' && styles.altOn]}
            onPress={() => setExtra(e => (e === 'text' ? 'none' : 'text'))}>
            <FileText
              size={16}
              color={extra === 'text' ? colors.navy : '#E5E7EB'}
            />
            <Text
              style={[
                styles.altText,
                extra === 'text' ? styles.altTextOn : null,
              ]}>
              Texto
            </Text>
          </Pressable>
          <Pressable
            style={[styles.altBtn, extra === 'nfce' && styles.altOn]}
            onPress={() => setExtra(e => (e === 'nfce' ? 'none' : 'nfce'))}>
            <QrCode
              size={16}
              color={extra === 'nfce' ? colors.navy : '#E5E7EB'}
            />
            <Text
              style={[
                styles.altText,
                extra === 'nfce' ? styles.altTextOn : null,
              ]}>
              NFC-e
            </Text>
          </Pressable>
        </View>
      </View>

      <KeyboardSafeSheet
        visible={extra === 'text'}
        onClose={() => setExtra('none')}>
        <Text style={styles.modalTitle}>Colar texto da etiqueta</Text>
        <AppField
          multiline
          numberOfLines={5}
          value={raw}
          onChangeText={setRaw}
          placeholder="Cole o texto lido da etiqueta…"
          style={{height: 120, textAlignVertical: 'top'}}
        />
        <AppButton
          label="Mapear preço"
          onPress={() => {
            runOcrFromText(raw);
            setExtra('none');
          }}
        />
      </KeyboardSafeSheet>

      <KeyboardSafeSheet
        visible={extra === 'nfce'}
        onClose={() => setExtra('none')}>
        <Text style={styles.modalTitle}>QR NFC-e</Text>
        <Text style={styles.hint}>Cole a URL do cupom fiscal</Text>
        <AppField
          value={qrUrl}
          onChangeText={setQrUrl}
          placeholder="https://…nfce…"
          autoCapitalize="none"
          compact
        />
        <AppButton label="Buscar na SEFAZ" onPress={fetchNfce} />
      </KeyboardSafeSheet>

      <KeyboardSafeSheet visible={!!fields} onClose={() => setFields(null)}>
        <Text style={styles.modalTitle}>Confirmar leitura</Text>
        <Text style={styles.hint}>Revise antes de salvar no carrinho</Text>
        <AppField
          label="Produto"
          compact
          value={fields?.productName ?? ''}
          onChangeText={t =>
            setFields(f => (f ? {...f, productName: t} : f))
          }
        />
        <View style={{flexDirection: 'row', gap: 10}}>
          <View style={[styles.fieldAccent, styles.retail]}>
            <AppField
              label="Varejo"
              compact
              keyboardType="decimal-pad"
              value={
                fields?.retailPrice != null ? String(fields.retailPrice) : ''
              }
              onChangeText={t =>
                setFields(f => (f ? {...f, retailPrice: parseBrl(t)} : f))
              }
            />
          </View>
          <View style={[styles.fieldAccent, styles.wholesale]}>
            <AppField
              label="Atacado"
              compact
              keyboardType="decimal-pad"
              value={
                fields?.wholesalePrice != null
                  ? String(fields.wholesalePrice)
                  : ''
              }
              onChangeText={t =>
                setFields(f =>
                  f ? {...f, wholesalePrice: parseBrl(t)} : f,
                )
              }
            />
          </View>
        </View>
        <AppField
          label="Qtd mín. atacado"
          compact
          keyboardType="decimal-pad"
          value={
            fields?.minWholesaleQty != null
              ? String(fields.minWholesaleQty)
              : ''
          }
          onChangeText={t =>
            setFields(f =>
              f
                ? {
                    ...f,
                    minWholesaleQty: t
                      ? Number.parseFloat(t.replace(',', '.'))
                      : null,
                  }
                : f,
            )
          }
        />
        {fields?.retailPrice != null ? (
          <Text style={styles.preview}>
            Varejo {formatBrl(fields.retailPrice)}
            {fields.wholesalePrice != null
              ? ` · Atacado ${formatBrl(fields.wholesalePrice)}`
              : ''}
          </Text>
        ) : null}
        <AppButton label="Salvar no carrinho" onPress={saveToCart} />
        <AppButton
          label="Cancelar"
          outlined
          onPress={() => setFields(null)}
        />
      </KeyboardSafeSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: '#0B1220'},
  stage: {
    flex: 1,
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: '#111827',
  },
  stageIdle: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    padding: 24,
  },
  stageTitle: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 18,
    textAlign: 'center',
  },
  stageHint: {
    color: 'rgba(255,255,255,0.65)',
    fontWeight: '600',
    fontSize: 13,
    textAlign: 'center',
    maxWidth: 260,
  },
  frame: {
    ...StyleSheet.absoluteFillObject,
    margin: 28,
  },
  corner: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderColor: colors.yellowBright,
  },
  tl: {top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 10},
  tr: {top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 10},
  bl: {bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: 10},
  br: {bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 10},
  dock: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 28,
    gap: 12,
    backgroundColor: '#0B1220',
  },
  altRow: {flexDirection: 'row', gap: 10},
  altBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  altOn: {
    backgroundColor: colors.yellowBright,
    borderColor: colors.yellowBright,
  },
  altText: {color: '#E5E7EB', fontWeight: '800', fontSize: 13},
  altTextOn: {color: colors.navy},
  modalTitle: {fontSize: 18, fontWeight: '800', color: colors.navy},
  hint: {color: colors.muted, marginBottom: 4, fontWeight: '600'},
  fieldAccent: {flex: 1, borderRadius: 12, padding: 4},
  retail: {backgroundColor: '#EFF6FF'},
  wholesale: {backgroundColor: '#FFFBEB'},
  preview: {fontWeight: '700', color: colors.navy},
});

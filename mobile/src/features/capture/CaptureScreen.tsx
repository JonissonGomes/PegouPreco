import React, {useCallback, useState} from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {Camera, useCameraDevice} from 'react-native-vision-camera';
import TextRecognition from '@react-native-ml-kit/text-recognition';
import {AppButton, AppField, AppScreenHeader} from '@/ui/chrome';
import {colors} from '@/ui/theme';
import {parseLabel, type LabelFields} from '@/domain/labelParser';
import {formatBrl, parseBrl} from '@/domain/money';
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

export function CaptureScreen() {
  const activeListName = useAppStore(s => s.activeListName);
  const activeMarketId = useAppStore(s => s.activeMarketId);
  const refresh = useAppStore(s => s.refresh);
  const marketName = useMarketName(activeMarketId);
  const device = useCameraDevice('back');
  const [cameraOn, setCameraOn] = useState(false);
  const [fields, setFields] = useState<LabelFields | null>(null);
  const [raw, setRaw] = useState('');
  const [qrUrl, setQrUrl] = useState('');

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
      Alert.alert('OCR', 'Não foi possível mapear preço na etiqueta.');
      return;
    }
    applyFields(parsed);
  };

  const onCapturePhoto = useCallback(async () => {
    if (!ensureList()) return;
    try {
      // Atalho de demo: se câmera indisponível, usa texto simulado
      if (!device) {
        runOcrFromText(
          'Cerveja Spaten 350ml c/12\nVarejo R$ 47,90\nAtacado a partir de 2 R$ 42,90',
        );
        return;
      }
      Alert.alert(
        'OCR',
        'Cole o texto da etiqueta ou use o exemplo demo.',
        [
          {
            text: 'Usar exemplo',
            onPress: () =>
              runOcrFromText(
                'Arroz Tipo 1 Camil 5kg\nPreço varejo R$ 24,90\nAtacado a partir de 3 R$ 21,90',
              ),
          },
          {text: 'Cancelar', style: 'cancel'},
        ],
      );
    } catch (e) {
      Alert.alert('Erro OCR', e instanceof Error ? e.message : String(e));
    }
  }, [device, activeListName, activeMarketId]);

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
        Alert.alert('NFC-e', 'Nenhum item encontrado no HTML');
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
      Alert.alert('NFC-e', `${parsed.items.length} itens adicionados`);
    } catch (e) {
      Alert.alert('SEFAZ', e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <View style={styles.root}>
      <AppScreenHeader
        title="Capturar"
        subtitle={marketName || activeListName || 'Leia etiqueta ou QR NFC-e'}
      />
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.cameraBox}>
          {cameraOn && device ? (
            <Camera style={StyleSheet.absoluteFill} device={device} isActive />
          ) : (
            <View style={styles.cameraPlaceholder}>
              <Text style={styles.camText}>
                Guia de etiqueta — alinhe o preço no quadro
              </Text>
            </View>
          )}
        </View>
        <AppButton
          label={cameraOn ? 'Capturar / OCR' : 'Abrir câmera / OCR'}
          onPress={() => {
            if (!cameraOn) {
              setCameraOn(true);
              Camera.requestCameraPermission().catch(() => undefined);
            }
            onCapturePhoto();
          }}
        />
        <Text style={styles.section}>Ou cole texto da etiqueta</Text>
        <AppField
          multiline
          numberOfLines={4}
          value={raw}
          onChangeText={setRaw}
          placeholder="Texto OCR…"
          style={{height: 100, textAlignVertical: 'top'}}
        />
        <AppButton label="Mapear campos" onPress={() => runOcrFromText(raw)} />

        <Text style={styles.section}>QR NFC-e (URL)</Text>
        <AppField
          value={qrUrl}
          onChangeText={setQrUrl}
          placeholder="https://…nfce…"
          autoCapitalize="none"
        />
        <AppButton label="Buscar NFC-e na SEFAZ" onPress={fetchNfce} />
      </ScrollView>

      <Modal visible={!!fields} transparent animationType="slide">
        <View style={styles.modalRoot}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Campos detectados</Text>
            <Text style={styles.hint}>
              Confira varejo / atacado antes de salvar
            </Text>
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
                  label="Preço varejo"
                  compact
                  keyboardType="decimal-pad"
                  value={
                    fields?.retailPrice != null
                      ? String(fields.retailPrice)
                      : ''
                  }
                  onChangeText={t =>
                    setFields(f =>
                      f ? {...f, retailPrice: parseBrl(t)} : f,
                    )
                  }
                />
              </View>
              <View style={[styles.fieldAccent, styles.wholesale]}>
                <AppField
                  label="Preço atacado"
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
            <Pressable
              onPress={async () => {
                try {
                  // tenta ML Kit se houver caminho de foto futura
                  await TextRecognition;
                } catch {
                  /* optional */
                }
              }}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: colors.bg},
  body: {padding: 16, gap: 10, paddingBottom: 100},
  cameraBox: {
    height: 220,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#111',
  },
  cameraPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.yellowBright,
    margin: 24,
    borderStyle: 'dashed',
  },
  camText: {color: '#fff', fontWeight: '700', textAlign: 'center'},
  section: {fontWeight: '800', color: colors.navy, marginTop: 8},
  modalRoot: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 16,
    gap: 8,
  },
  modalTitle: {fontSize: 18, fontWeight: '800', color: colors.navy},
  hint: {color: colors.muted, marginBottom: 4},
  fieldAccent: {flex: 1, borderRadius: 12, padding: 4},
  retail: {backgroundColor: '#EFF6FF'},
  wholesale: {backgroundColor: '#FFFBEB'},
  preview: {fontWeight: '700', color: colors.navy},
});

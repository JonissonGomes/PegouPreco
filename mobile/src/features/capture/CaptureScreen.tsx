import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {useFocusEffect, useNavigation, useRoute} from '@react-navigation/native';
import {
  Camera,
  useCameraDevice,
  useCodeScanner,
} from 'react-native-vision-camera';
import {ChevronRight, FileText, QrCode, ScanLine, X} from 'lucide-react-native';
import {AppButton, AppField, AppScreenHeader} from '@/ui/chrome';
import {appAlert} from '@/ui/appDialog';
import {KeyboardSafeSheet} from '@/ui/keyboardSheet';
import {colors} from '@/ui/theme';
import {parseLabel, type LabelFields} from '@/domain/labelParser';
import {
  formatBrl,
  formatMoneyInput,
  formatQty,
  maskMoneyTyping,
  parseBrl,
} from '@/domain/money';
import {effectiveUnitPrice, lineTotal} from '@/domain/pricing';
import {recognizeLabelFromPhoto} from '@/data/ocr/labelOcr';
import {refreshPermissionFlags} from '@/app/permissions';
import {
  cartRepo,
  prefs,
  priceLogRepo,
  productRepo,
  useAppStore,
  useMarketName,
} from '@/store/appStore';
import {fetchAndParseNfce} from '@/data/remote/sefazClient';
import {requestAutoSync} from '@/data/syncWorker';
import {
  archiveNfcePurchase,
  previewPastNfce,
  type NfceDraft,
} from '@/data/archivePurchase';
import {NfceReviewSheet} from '@/features/cart/NfceReviewSheet';
import {extractAccessKey, looksLikeReceipt, nfceConsultUrl} from '@/domain/nfceScan';
import {ensureMarketOnMap} from '@/data/archivePurchase';

type ExtraMode = 'none' | 'text' | 'nfce';

const LIVE_SCAN_MS = 1800;

function fingerprint(f: LabelFields) {
  return `${(f.productName ?? '').toLowerCase()}|${f.retailPrice ?? ''}`;
}

function LabelHitPreview({
  fields,
  onPress,
  onDismiss,
}: {
  fields: LabelFields;
  onPress: () => void;
  onDismiss: () => void;
}) {
  const enter = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    enter.setValue(0);
    Animated.spring(enter, {
      toValue: 1,
      friction: 7,
      tension: 90,
      useNativeDriver: true,
    }).start();
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1.08,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [enter, pulse, fields.productName, fields.retailPrice]);

  return (
    <Animated.View
      style={[
        styles.hitWrap,
        {
          opacity: enter,
          transform: [
            {
              translateY: enter.interpolate({
                inputRange: [0, 1],
                outputRange: [28, 0],
              }),
            },
            {
              scale: enter.interpolate({
                inputRange: [0, 1],
                outputRange: [0.94, 1],
              }),
            },
          ],
        },
      ]}
      pointerEvents="box-none">
      <Pressable style={styles.hitCard} onPress={onPress}>
        <Animated.View style={[styles.hitDot, {transform: [{scale: pulse}]}]} />
        <View style={{flex: 1, minWidth: 0}}>
          <Text style={styles.hitName} numberOfLines={1}>
            {fields.productName || 'Etiqueta detectada'}
          </Text>
          <Text style={styles.hitPrice}>
            {fields.retailPrice != null
              ? `Varejo ${formatBrl(fields.retailPrice)}`
              : 'Preço ?'}
            {fields.wholesalePrice != null
              ? ` · Atacado ${formatBrl(fields.wholesalePrice)}`
              : ''}
          </Text>
        </View>
        <ChevronRight size={20} color={colors.navy} />
      </Pressable>
      <Pressable
        style={styles.hitClose}
        onPress={onDismiss}
        hitSlop={10}
        accessibilityLabel="Dispensar">
        <X size={14} color="#fff" />
      </Pressable>
    </Animated.View>
  );
}

function PriceQuote({
  fields,
  qtyText,
}: {
  fields: LabelFields;
  qtyText: string;
}) {
  if (fields.retailPrice == null) return null;
  const quantity = Number.parseFloat(qtyText.replace(',', '.'));
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return <Text style={styles.preview}>Informe a quantidade.</Text>;
  }
  const line = {
    quantity,
    retailPrice: fields.retailPrice,
    wholesalePrice: fields.wholesalePrice,
    minWholesaleQty: fields.minWholesaleQty,
  };
  const unit = effectiveUnitPrice(line);
  const atacado =
    fields.wholesalePrice != null &&
    fields.minWholesaleQty != null &&
    quantity >= fields.minWholesaleQty;
  const falta =
    fields.wholesalePrice != null &&
    fields.minWholesaleQty != null &&
    !atacado
      ? ` Faltam ${formatQty(fields.minWholesaleQty - quantity)} para o atacado.`
      : '';
  return (
    <Text style={styles.preview}>
      {formatQty(quantity)} un · {atacado ? 'atacado' : 'varejo'}{' '}
      {formatBrl(unit)} · total {formatBrl(lineTotal(line))}
      {falta}
    </Text>
  );
}

export function CaptureScreen() {
  const nav = useNavigation<any>();
  const route = useRoute<any>();
  const activeListName = useAppStore(s => s.activeListName);
  const activeMarketId = useAppStore(s => s.activeMarketId);
  const refresh = useAppStore(s => s.refresh);
  const cameraGranted = useAppStore(s => s.permissions.camera);
  const marketName = useMarketName(
    activeListName ? activeMarketId : null,
  );
  const device = useCameraDevice('back');
  const cameraRef = useRef<Camera>(null);
  const busyRef = useRef(false);
  const lastFpRef = useRef<string | null>(null);
  const lastNfceRef = useRef<string | null>(null);
  const importNfceRef = useRef<(url: string) => Promise<boolean>>(
    async () => false,
  );

  const [cameraOn, setCameraOn] = useState(false);
  const [fields, setFields] = useState<LabelFields | null>(null);
  const [hit, setHit] = useState<LabelFields | null>(null);
  const [raw, setRaw] = useState('');
  const [qrUrl, setQrUrl] = useState('');
  const [extra, setExtra] = useState<ExtraMode>('none');
  const [pastMode, setPastMode] = useState(false);
  const [pastDraft, setPastDraft] = useState<NfceDraft | null>(null);
  const [pastSaving, setPastSaving] = useState(false);
  const pastModeRef = useRef(false);
  pastModeRef.current = pastMode;
  const [scanning, setScanning] = useState(false);
  const [status, setStatus] = useState('Aponte para a etiqueta');
  const [qtyText, setQtyText] = useState('1');

  const auth = useAppStore(s => s.auth);

  const ensureList = () => {
    if (!activeListName || !activeMarketId) {
      appAlert(
        'Lista necessária',
        'Inicie uma compra na aba Compras antes de capturar.',
        [
          {label: 'Cancelar', style: 'cancel'},
          {
            label: 'Ir para Compras',
            style: 'primary',
            onPress: () => nav.navigate('Lists'),
          },
        ],
      );
      return false;
    }
    return true;
  };

  const openConfirm = (f: LabelFields) => {
    setHit(null);
    setFields({...f});
    setRaw(f.rawText);
    const targetId = route.params?.cartItemId as number | undefined;
    const current = targetId
      ? cartRepo.all().find(c => c.id === targetId)
      : undefined;
    setQtyText(formatQty(current?.quantity ?? 1));
  };

  const runOcrFromText = (text: string) => {
    const parsed = parseLabel(text);
    if (!parsed) {
      appAlert(
        'Etiqueta',
        'Não foi possível ler o preço. Ajuste o enquadramento.',
      );
      return;
    }
    openConfirm(parsed);
  };

  const scanFrame = useCallback(
    async (opts?: {manual?: boolean}) => {
      if (busyRef.current) return null;
      if (!cameraRef.current || !device) {
        if (opts?.manual) {
          appAlert('Câmera', 'Câmera indisponível neste aparelho.');
        }
        return null;
      }
      busyRef.current = true;
      if (opts?.manual) setScanning(true);
      try {
        const photo = await cameraRef.current.takePhoto({
          flash: 'off',
          enableShutterSound: false,
        });
        const {fields: parsed, rawText} = await recognizeLabelFromPhoto(
          photo.path,
        );
        if (rawText) setRaw(rawText);
        if (rawText && looksLikeReceipt(rawText)) {
          const url = nfceConsultUrl(rawText);
          if (url && url !== lastNfceRef.current) {
            lastNfceRef.current = url;
            setStatus('Lendo a nota fiscal…');
            const ok = await importNfceRef.current(url);
            if (!ok) lastNfceRef.current = null;
            return null;
          }
          if (!url) {
            setStatus('Aponte para o QR da nota, no rodapé');
            if (opts?.manual) {
              appAlert(
                'Nota fiscal',
                'Reconheci a nota, mas só a chave impressa não abre a consulta. Enquadre o QR do rodapé.',
              );
            }
            return null;
          }
        }
        if (parsed?.retailPrice != null) {
          const fp = fingerprint(parsed);
          if (fp !== lastFpRef.current || opts?.manual) {
            lastFpRef.current = fp;
            setHit(parsed);
            setStatus('Etiqueta encontrada — toque para adicionar');
          }
          return parsed;
        }
        if (opts?.manual) {
          setStatus('Nenhum preço legível');
          appAlert(
            'Não li a etiqueta',
            rawText
              ? 'Vi texto, mas não achei um preço claro. Aproxime e tente de novo.'
              : 'Não reconheci texto. Melhore a luz e enquadre nome + preço.',
          );
        }
        return null;
      } catch (e) {
        if (opts?.manual) {
          appAlert(
            'OCR',
            e instanceof Error ? e.message : 'Falha ao ler a foto',
          );
        }
        return null;
      } finally {
        busyRef.current = false;
        if (opts?.manual) setScanning(false);
      }
    },
    [device],
  );

  const ensureCamera = useCallback(async () => {
    const flags = await refreshPermissionFlags();
    useAppStore.setState({permissions: flags});
    if (flags.camera) {
      setCameraOn(true);
      return true;
    }
    const statusPerm = await Camera.requestCameraPermission();
    const granted = statusPerm === 'granted';
    useAppStore.setState({permissions: {...flags, camera: granted}});
    if (!granted) {
      appAlert(
        'Câmera necessária',
        'Ative a permissão de câmera nas configurações para ler etiquetas.',
      );
      return false;
    }
    setCameraOn(true);
    return true;
  }, []);

  useFocusEffect(
    useCallback(() => {
      void ensureCamera();
      return () => {
        // Mantém permissão; preview pode pausar via isActive
      };
    }, [ensureCamera]),
  );

  const liveScanActive =
    cameraOn &&
    cameraGranted &&
    !!device &&
    !fields &&
    !hit &&
    extra === 'none';

  useEffect(() => {
    if (!liveScanActive) return;
    setStatus('Buscando etiqueta…');
    const id = setInterval(() => {
      void scanFrame();
    }, LIVE_SCAN_MS);
    // primeira tentativa um pouco depois do preview estabilizar
    const first = setTimeout(() => {
      void scanFrame();
    }, 700);
    return () => {
      clearInterval(id);
      clearTimeout(first);
    };
  }, [liveScanActive, scanFrame]);

  const saveToCart = () => {
    if (!ensureList()) return;
    if (!fields?.productName || fields.retailPrice == null) {
      appAlert('Falta preencher', 'Informe produto e preço de varejo.');
      return;
    }
    const quantity = Number.parseFloat(qtyText.replace(',', '.'));
    if (!Number.isFinite(quantity) || quantity <= 0) {
      appAlert('Quantidade', 'Informe quantas unidades vão para o carrinho.');
      return;
    }
    if (auth && !auth.emailVerified) {
      appAlert(
        'Conta sem verificação',
        'O preço será salvo na lista local. Verifique o e-mail no Perfil para alimentar o comparador comunitário.',
        [
          {label: 'Continuar', style: 'cancel'},
          {
            label: 'Ir ao Perfil',
            style: 'primary',
            onPress: () => nav.navigate('Profile'),
          },
        ],
      );
    }
    const targetId = route.params?.cartItemId as number | undefined;
    if (targetId) {
      const current = cartRepo.all().find(c => c.id === targetId);
      cartRepo.updateItem(targetId, {
        productName: fields.productName,
        quantity,
        retailPrice: fields.retailPrice,
        wholesalePrice: fields.wholesalePrice,
        minWholesaleQty: fields.minWholesaleQty,
        useWholesale:
          fields.wholesalePrice != null &&
          fields.minWholesaleQty != null &&
          quantity >= fields.minWholesaleQty
            ? 1
            : 0,
      });
      if (current) productRepo.rename(current.productId, fields.productName);
      if (current && !current.checkedOff) cartRepo.toggleChecked(targetId);
      nav.setParams({cartItemId: undefined});
    } else {
      const product = productRepo.resolveOrCreate(fields.productName);
      cartRepo.upsert({
        productId: product.id,
        productName: fields.productName,
        quantity,
        retailPrice: fields.retailPrice,
        wholesalePrice: fields.wholesalePrice,
        minWholesaleQty: fields.minWholesaleQty,
      });
    }
    refresh();
    setFields(null);
    lastFpRef.current = null;
    setStatus('Item salvo — aponte para a próxima etiqueta');
  };

  const fetchNfce = async (explicit?: string): Promise<boolean> => {
    const target = (explicit ?? qrUrl).trim();
    if (!ensureList() || !target) return false;
    const nfceKey = extractAccessKey(target);
    try {
      const parsed = await fetchAndParseNfce(target);
      let marketNotice: string | null = null;
      if (parsed.marketName) {
        const placed = await ensureMarketOnMap(
          parsed.marketName,
          parsed.marketCnpj,
          parsed.marketAddress,
        );
        if (placed.marketId != null) {
          const prevActive = prefs.getActiveMarketId();
          prefs.setCurrentMarketId(placed.marketId);
          if (prefs.getActiveListName()) {
            prefs.setActiveMarketId(placed.marketId);
            if (prevActive != null && prevActive !== placed.marketId) {
              marketNotice = `Mercado da lista atualizado para ${placed.marketName}`;
            }
          }
        }
      }
      if (!parsed.items.length) {
        appAlert('NFC-e', 'Nenhum item encontrado');
        return false;
      }
      const marketId = prefs.getActiveMarketId();
      for (const it of parsed.items) {
        const product = productRepo.resolveOrCreate(it.description);
        const now = new Date().toISOString();
        priceLogRepo.insert({
          productId: product.id,
          marketId,
          retailPrice: it.unitPrice,
          wholesalePrice: null,
          minWholesaleQty: null,
          source: 'nfce',
          capturedAt: now,
          remoteId: null,
          nfceKey,
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
      appAlert(
        'NFC-e',
        marketNotice
          ? `${parsed.items.length} itens adicionados.\n${marketNotice}`
          : `${parsed.items.length} itens adicionados`,
      );
      return true;
    } catch (e) {
      appAlert('SEFAZ', e instanceof Error ? e.message : String(e));
      return false;
    }
  };
  const savePast = async (url: string): Promise<boolean> => {
    try {
      const preview = await previewPastNfce(url);
      if ('ok' in preview) {
        appAlert(
          'Cadastrar nota',
          preview.reason === 'duplicate'
            ? 'Essa nota já está no histórico.'
            : 'A consulta não trouxe itens. Enquadre o QR do rodapé.',
        );
        return false;
      }
      setPastDraft(preview);
      return true;
    } catch (e) {
      appAlert('SEFAZ', e instanceof Error ? e.message : String(e));
      return false;
    }
  };
  const confirmPast = async (purchasedAt: string) => {
    if (!pastDraft) return;
    setPastSaving(true);
    try {
      const outcome = await archiveNfcePurchase(
        pastDraft.parsed,
        pastDraft.qrUrl,
        purchasedAt,
      );
      if (!outcome.ok) {
        appAlert('Cadastrar nota', 'Não foi possível salvar esta nota.');
        return;
      }
      refresh();
      setPastDraft(null);
      requestAutoSync('nfce');
      appAlert(
        'Compra salva',
        outcome.placedOnMap
          ? `${outcome.itemCount} itens de ${outcome.marketName} no histórico. Mercado cadastrado no mapa.`
          : outcome.mapKnown
            ? `${outcome.itemCount} itens de ${outcome.marketName} no histórico.`
            : `${outcome.itemCount} itens de ${outcome.marketName} no histórico. Se o mercado não aparecer, segure o local no mapa.`,
      );
    } catch (e) {
      appAlert('SEFAZ', e instanceof Error ? e.message : String(e));
    } finally {
      setPastSaving(false);
    }
  };
  importNfceRef.current = pastModeRef.current ? savePast : fetchNfce;

  const codeScanner = useCodeScanner({
    codeTypes: ['qr', 'pdf-417'],
    onCodeScanned: codes => {
      const value = codes.map(c => c.value).find((v): v is string => !!v);
      if (!value || busyRef.current) return;
      const url = nfceConsultUrl(value);
      if (!url || url === lastNfceRef.current) return;
      lastNfceRef.current = url;
      busyRef.current = true;
      setStatus('Nota fiscal encontrada');
      void importNfceRef.current(url).then(ok => {
        if (!ok) lastNfceRef.current = null;
        busyRef.current = false;
      });
    },
  });

  const onShutter = async () => {
    if (!pastMode && !ensureList()) return;
    if (!cameraOn || !cameraGranted) {
      const ok = await ensureCamera();
      if (!ok) return;
    }
    await scanFrame({manual: true});
  };

  const subtitle = activeListName
    ? marketName
      ? `${activeListName} · ${marketName}`
      : activeListName
    : status;

  return (
    <View style={styles.root}>
      <AppScreenHeader title="Capturar" subtitle={subtitle} />

      <View style={styles.stage}>
        {cameraOn && cameraGranted && device ? (
          <Camera
            ref={cameraRef}
            style={StyleSheet.absoluteFill}
            device={device}
            isActive={cameraOn && !fields && extra === 'none'}
            photo
            codeScanner={codeScanner}
            enableZoomGesture
          />
        ) : (
          <View style={styles.stageIdle}>
            <ScanLine size={36} color={colors.yellowBright} strokeWidth={2} />
            <Text style={styles.stageTitle}>
              {cameraGranted ? 'Preparando câmera…' : 'Permissão de câmera'}
            </Text>
            <Text style={styles.stageHint}>
              {cameraGranted
                ? 'Abrindo o preview para enquadrar a etiqueta'
                : 'Toque em Capturar agora para liberar a câmera'}
            </Text>
            {!cameraGranted ? (
              <AppButton label="Liberar câmera" onPress={() => void ensureCamera()} />
            ) : null}
          </View>
        )}

        <View style={styles.frame} pointerEvents="none">
          <View style={[styles.corner, styles.tl]} />
          <View style={[styles.corner, styles.tr]} />
          <View style={[styles.corner, styles.bl]} />
          <View style={[styles.corner, styles.br]} />
        </View>

        {scanning ? (
          <View style={styles.scanBadge} pointerEvents="none">
            <ActivityIndicator color={colors.navy} size="small" />
            <Text style={styles.scanBadgeText}>Lendo…</Text>
          </View>
        ) : null}

        {hit && !fields ? (
          <LabelHitPreview
            fields={hit}
            onPress={() => {
              if (!ensureList()) return;
              openConfirm(hit);
            }}
            onDismiss={() => {
              setHit(null);
              lastFpRef.current = null;
              setStatus('Buscando etiqueta…');
            }}
          />
        ) : null}
      </View>

      <View style={styles.dock}>
        <AppButton
          icon={
            scanning ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <ScanLine size={20} color="#fff" />
            )
          }
          label={
            !cameraOn
              ? 'Abrir câmera'
              : scanning
                ? 'Lendo etiqueta…'
                : 'Capturar agora'
          }
          onPress={onShutter}
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
            style={[styles.altBtn, pastMode && styles.altOn]}
            onPress={() => {
              setPastMode(on => {
                const next = !on;
                setStatus(
                  next
                    ? 'Cadastrar nota: aponte para o QR do rodapé'
                    : 'Aponte para a etiqueta',
                );
                return next;
              });
            }}>
            <QrCode size={16} color={pastMode ? colors.navy : '#E5E7EB'} />
            <Text style={[styles.altText, pastMode ? styles.altTextOn : null]}>
              Cadastrar nota
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
        <Text style={styles.modalTitle}>
          {pastMode ? 'Cadastrar nota' : 'QR NFC-e'}
        </Text>
        <Text style={styles.hint}>
          {pastMode
            ? 'A nota entra em Listas salvas, sem mexer na compra aberta.'
            : 'Cole a URL do cupom para somar na compra aberta.'}
        </Text>
        <AppField
          value={qrUrl}
          onChangeText={setQrUrl}
          placeholder="https://…nfce…"
          autoCapitalize="none"
          compact
        />
        <AppButton
          label={pastMode ? 'Guardar compra passada' : 'Buscar na SEFAZ'}
          onPress={() => {
            if (!qrUrl.trim()) return;
            void (pastMode ? savePast(qrUrl) : fetchNfce());
          }}
        />
      </KeyboardSafeSheet>

      <KeyboardSafeSheet
        visible={!!fields}
        onClose={() => {
          setFields(null);
          setStatus('Buscando etiqueta…');
        }}>
        <Text style={styles.modalTitle}>Confirmar leitura</Text>
        <Text style={styles.hint}>
          Confira a quantidade. Se ela atingir a mínima, o total usa o atacado.
        </Text>
        <AppField
          label="Produto"
          compact
          value={fields?.productName ?? ''}
          onChangeText={t =>
            setFields(f => (f ? {...f, productName: t} : f))
          }
        />
        {fields?.barcode ? (
          <Text style={styles.barcodeHint}>EAN {fields.barcode}</Text>
        ) : null}
        <View style={{flexDirection: 'row', gap: 10}}>
          <AppField
            label="Qtd no carrinho"
            compact
            keyboardType="decimal-pad"
            placeholder="1"
            value={qtyText}
            onChangeText={setQtyText}
          />
          <AppField
            label="Qtd mín. atacado"
            compact
            keyboardType="number-pad"
            placeholder="ex.: 2"
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
                        ? Number.parseInt(t.replace(/\D/g, ''), 10) || null
                        : null,
                    }
                  : f,
              )
            }
          />
        </View>
        <View style={{flexDirection: 'row', gap: 10}}>
          <View style={[styles.fieldAccent, styles.retail]}>
            <AppField
              label="Preço varejo"
              compact
              keyboardType="number-pad"
              placeholder="0,00"
              value={formatMoneyInput(fields?.retailPrice)}
              onChangeText={t => {
                const masked = maskMoneyTyping(t);
                setFields(f =>
                  f ? {...f, retailPrice: parseBrl(masked)} : f,
                );
              }}
            />
          </View>
          <View style={[styles.fieldAccent, styles.wholesale]}>
            <AppField
              label="Preço atacado"
              compact
              keyboardType="number-pad"
              placeholder="0,00"
              value={formatMoneyInput(fields?.wholesalePrice)}
              onChangeText={t => {
                const masked = maskMoneyTyping(t);
                setFields(f =>
                  f
                    ? {
                        ...f,
                        wholesalePrice: masked ? parseBrl(masked) : null,
                      }
                    : f,
                );
              }}
            />
          </View>
        </View>
        {fields?.retailPrice != null ? (
          <PriceQuote fields={fields} qtyText={qtyText} />
        ) : null}
        <AppButton label="Salvar no carrinho" onPress={saveToCart} />
        <AppButton
          label="Cancelar"
          outlined
          onPress={() => {
            setFields(null);
            setStatus('Buscando etiqueta…');
          }}
        />
      </KeyboardSafeSheet>
      <NfceReviewSheet
        draft={pastDraft}
        saving={pastSaving}
        onClose={() => {
          lastNfceRef.current = null;
          setPastDraft(null);
        }}
        onSave={purchasedAt => void confirmPast(purchasedAt)}
      />
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
    maxWidth: 280,
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
  tl: {
    top: 0,
    left: 0,
    borderTopWidth: 3,
    borderLeftWidth: 3,
    borderTopLeftRadius: 10,
  },
  tr: {
    top: 0,
    right: 0,
    borderTopWidth: 3,
    borderRightWidth: 3,
    borderTopRightRadius: 10,
  },
  bl: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 3,
    borderLeftWidth: 3,
    borderBottomLeftRadius: 10,
  },
  br: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 3,
    borderRightWidth: 3,
    borderBottomRightRadius: 10,
  },
  scanBadge: {
    position: 'absolute',
    top: 14,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.yellowBright,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  scanBadgeText: {fontWeight: '800', color: colors.navy, fontSize: 12},
  hitWrap: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  hitCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.yellowBright,
    borderRadius: 18,
    paddingVertical: 12,
    paddingHorizontal: 14,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: {width: 0, height: 4},
    elevation: 6,
  },
  hitDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.navy,
  },
  hitName: {fontWeight: '800', color: colors.navy, fontSize: 14},
  hitPrice: {
    marginTop: 2,
    fontWeight: '700',
    color: 'rgba(11,42,107,0.75)',
    fontSize: 12,
  },
  hitClose: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
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
  barcodeHint: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.muted,
    marginBottom: 8,
  },
  fieldAccent: {flex: 1, borderRadius: 12, padding: 4},
  retail: {backgroundColor: '#EFF6FF'},
  wholesale: {backgroundColor: '#FFFBEB'},
  preview: {fontWeight: '700', color: colors.navy},
});

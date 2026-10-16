import {useCallback, useEffect, useRef, useState} from 'react';
import {Camera, useCameraDevice, useCodeScanner} from 'react-native-vision-camera';
import {nfceConsultUrl} from '@/domain/nfceScan';
import {refreshPermissionFlags} from '@/app/permissions';
import {useAppStore} from '@/store/appStore';
import {focusPoint, huntZoom, zoomForCodeBox} from '@/features/cart/nfceZoom';

/** Câmera da NFC-e: aproxima sozinha quando o QR está pequeno e busca foco no centro. */
export function useReceiptCamera(onScan: (value: string) => void, paused: boolean) {
  const device = useCameraDevice('back');
  const cameraRef = useRef<Camera>(null);
  const cameraGranted = useAppStore(s => s.permissions.camera);
  const [zoom, setZoom] = useState(1);
  const zoomRef = useRef(1);
  const pauseAuto = useRef(0);
  const viewSize = useRef({w: 0, h: 0});
  const onScanRef = useRef(onScan);
  const pausedRef = useRef(paused);
  const boosted = useRef<string | null>(null);
  zoomRef.current = zoom;
  onScanRef.current = onScan;
  pausedRef.current = paused;

  const ensureCamera = useCallback(async () => {
    const flags = await refreshPermissionFlags();
    useAppStore.setState({permissions: flags});
    if (flags.camera) return;
    const status = await Camera.requestCameraPermission();
    useAppStore.setState({
      permissions: {...flags, camera: status === 'granted'},
    });
  }, []);

  const limits = useCallback(() => {
    return {
      min: device?.minZoom ?? 1,
      max: device?.maxZoom ?? zoomRef.current,
    };
  }, [device]);

  const focusCenter = useCallback(() => {
    const point = focusPoint(undefined, viewSize.current);
    cameraRef.current?.focus(point).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!device) return;
    const closer = Math.min(
      device.maxZoom ?? 1,
      Math.max(device.neutralZoom ?? 1, 1.8),
    );
    setZoom(closer);
  }, [device]);

  useEffect(() => {
    void ensureCamera();
  }, [ensureCamera]);

  useEffect(() => {
    if (!device || !cameraGranted || paused) return;
    const timer = setInterval(() => {
      if (Date.now() < pauseAuto.current) return;
      const {min, max} = limits();
      const next = huntZoom(
        zoomRef.current,
        Math.max(min, device.neutralZoom ?? 1),
        max,
      );
      if (Math.abs(next - zoomRef.current) < 0.05) return;
      setZoom(next);
      focusCenter();
    }, 1100);
    return () => clearInterval(timer);
  }, [device, cameraGranted, paused, limits, focusCenter]);

  const codeScanner = useCodeScanner({
    codeTypes: ['qr', 'pdf-417'],
    onCodeScanned: (codes, scan) => {
      if (pausedRef.current) return;
      const code = codes.find(c => !!c.value && !!nfceConsultUrl(c.value));
      if (!code?.value) return;
      const {min, max} = limits();
      const next = zoomForCodeBox(zoomRef.current, code.frame, scan, min, max);
      if (next != null && boosted.current !== code.value) {
        boosted.current = code.value;
        pauseAuto.current = Date.now() + 1800;
        setZoom(next);
        const point = focusPoint(code.frame, viewSize.current, scan);
        cameraRef.current?.focus(point).catch(() => undefined);
        return;
      }
      boosted.current = null;
      pauseAuto.current = Date.now() + 1800;
      onScanRef.current(code.value);
    },
  });

  const nudgeZoom = useCallback(
    (delta: number) => {
      pauseAuto.current = Date.now() + 5000;
      const {min, max} = limits();
      setZoom(z => Math.min(max, Math.max(min, Math.round((z + delta) * 10) / 10)));
    },
    [limits],
  );

  return {
    device,
    cameraRef,
    cameraGranted,
    ensureCamera,
    zoom,
    codeScanner,
    focusCenter,
    nudgeZoom,
    onLayout: (width: number, height: number) => {
      viewSize.current = {w: width, h: height};
    },
    focusTap: (x: number, y: number) => {
      pauseAuto.current = Date.now() + 2500;
      cameraRef.current?.focus({x, y}).catch(() => undefined);
    },
  };
}

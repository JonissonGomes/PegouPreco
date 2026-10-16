export type CodeBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

/**
 * QR pequeno na imagem significa que a nota está longe.
 * A caixa vem na mesma unidade do quadro da câmera (pixels ou dp).
 * Devolve o próximo zoom, ou null quando o código já ocupa ~20% do quadro.
 */
export function zoomForCodeBox(
  zoom: number,
  box: CodeBox | undefined,
  scan: {width: number; height: number} | undefined,
  minZoom: number,
  maxZoom: number,
): number | null {
  if (!box) return null;
  const span = Math.max(box.width, box.height);
  if (!Number.isFinite(span) || span <= 0) return null;
  const scanSpan =
    scan && scan.width > 0 && scan.height > 0
      ? Math.min(scan.width, scan.height)
      : 0;
  const ratio = scanSpan > 0 ? span / scanSpan : span < 1.5 ? span : span / 360;
  if (ratio >= 0.2) return null;
  const factor = Math.min(0.2 / Math.max(ratio, 0.02), 2);
  const next = round2(clamp(zoom * factor, minZoom, maxZoom));
  if (next <= zoom + 0.12) return null;
  return next;
}

/** Sobe o zoom aos poucos enquanto nenhum QR válido aparece. Volta ao início no teto. */
export function huntZoom(zoom: number, minZoom: number, maxZoom: number): number {
  const floor = Math.max(minZoom, 1);
  const cap = Math.min(maxZoom, Math.max(floor + 0.4, 4));
  if (zoom >= cap - 0.05) return round2(floor);
  return round2(Math.min(cap, zoom + 0.4));
}

export function focusPoint(
  box: CodeBox | undefined,
  view: {w: number; h: number},
  scan?: {width: number; height: number},
): {x: number; y: number} {
  const cx = view.w / 2;
  const cy = view.h / 2;
  if (!box || view.w <= 0 || view.h <= 0) return {x: cx, y: cy};
  const rawX = box.x + box.width / 2;
  const rawY = box.y + box.height / 2;
  const buffer =
    scan &&
    scan.width > 0 &&
    scan.height > 0 &&
    (scan.width > view.w * 1.5 || scan.height > view.h * 1.5);
  if (buffer && scan) {
    return {
      x: clamp((rawX / scan.width) * view.w, 0, view.w),
      y: clamp((rawY / scan.height) * view.h, 0, view.h),
    };
  }
  if (rawX >= 0 && rawY >= 0 && rawX <= view.w && rawY <= view.h) {
    return {x: rawX, y: rawY};
  }
  return {x: cx, y: cy};
}

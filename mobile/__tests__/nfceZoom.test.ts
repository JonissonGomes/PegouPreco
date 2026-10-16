import {focusPoint, huntZoom, zoomForCodeBox} from '../src/features/cart/nfceZoom';

describe('nfceZoom', () => {
  it('aproxima quando o QR ocupa pouco do quadro', () => {
    const next = zoomForCodeBox(
      1.8,
      {x: 100, y: 100, width: 40, height: 40},
      {width: 1280, height: 720},
      1,
      8,
    );
    expect(next).toBe(3.6);
  });

  it('mantém o zoom quando o QR já está grande', () => {
    const next = zoomForCodeBox(
      2,
      {x: 0, y: 0, width: 300, height: 300},
      {width: 1280, height: 720},
      1,
      8,
    );
    expect(next).toBeNull();
  });

  it('sobe o zoom de busca e volta ao piso no teto', () => {
    expect(huntZoom(1.8, 1, 8)).toBe(2.2);
    expect(huntZoom(4, 1, 8)).toBe(1);
  });

  it('foca no centro do QR convertido para a tela', () => {
    const point = focusPoint(
      {x: 640, y: 360, width: 80, height: 80},
      {w: 360, h: 640},
      {width: 1280, height: 720},
    );
    expect(point.x).toBeCloseTo(191.25);
    expect(point.y).toBeCloseTo(355.56, 1);
  });
});

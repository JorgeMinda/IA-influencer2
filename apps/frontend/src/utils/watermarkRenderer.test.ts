import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWatermarkedImage, downloadBlob } from './watermarkRenderer';
import type { BrandProfile } from '../types';

const mockCtx = {
  drawImage: vi.fn(),
  fillText: vi.fn(),
  fillRect: vi.fn(),
  globalAlpha: 1,
  font: '',
  fillStyle: '',
  textBaseline: 'alphabetic',
};

const mockCanvas = {
  width: 0,
  height: 0,
  getContext: vi.fn(() => mockCtx),
  toBlob: vi.fn((cb: (b: Blob | null) => void) => cb(new Blob(['x'], { type: 'image/png' }))),
};

beforeEach(() => {
  vi.clearAllMocks();
  mockCtx.globalAlpha = 1;
  mockCanvas.width = 0;
  mockCanvas.height = 0;
  vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
    if (tag === 'canvas') return mockCanvas as unknown as HTMLCanvasElement;
    if (tag === 'a') {
      const a = { href: '', download: '', click: vi.fn(), remove: vi.fn() } as unknown as HTMLAnchorElement;
      return a;
    }
    return document.createElement(tag);
  });
  // Mock Image
  window.Image = class {
    crossOrigin = '';
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    naturalWidth = 512;
    naturalHeight = 512;
    src = '';
    constructor() {
      setTimeout(() => {
        if (this.onload) this.onload();
      }, 0);
    }
  } as unknown as typeof Image;
  // Mock document.fonts
  (document as unknown as { fonts: { load: () => Promise<void>; ready: Promise<void> } }).fonts = {
    load: vi.fn(() => Promise.resolve()),
    ready: Promise.resolve(),
  };
});

describe('renderWatermarkedImage', () => {
  const brand: BrandProfile = {
    watermark_url: null,
    watermark_position: 'bottom-right',
    watermark_opacity: 40,
    watermark_size: 'md',
    palette: { primary: '#6366f1', secondary: '#1e293b', accent: '#f59e0b' },
    typography: 'sans',
    style_guide: '',
  };

  it('sin brand_profile devuelve blob sin modificar', async () => {
    const blob = await renderWatermarkedImage('http://example.com/img.png', null, 'Jade');
    expect(blob).toBeInstanceOf(Blob);
    expect(mockCtx.drawImage).toHaveBeenCalled();
  });

  it('con brand_profile sin watermark_url dibuja texto (fillText)', async () => {
    const blob = await renderWatermarkedImage('http://example.com/img.png', brand, 'Jade');
    expect(blob).toBeInstanceOf(Blob);
    expect(mockCtx.fillText).toHaveBeenCalled();
    expect(mockCtx.fillText).toHaveBeenCalledWith('Jade', expect.any(Number), expect.any(Number));
  });

  it('con watermark_url dibuja imagen (drawImage dos veces: base + watermark)', async () => {
    const brandWithWm: BrandProfile = { ...brand, watermark_url: 'data:image/png;base64,AAAA' };
    const blob = await renderWatermarkedImage('http://example.com/img.png', brandWithWm, 'Jade');
    expect(blob).toBeInstanceOf(Blob);
    // drawImage called at least twice (base + watermark)
    expect(mockCtx.drawImage.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('usa canvas.toBlob (no toDataURL)', async () => {
    await renderWatermarkedImage('http://example.com/img.png', brand, 'Jade');
    expect(mockCanvas.toBlob).toHaveBeenCalled();
  });

  it('escala proporcionalmente (targetWidth = naturalWidth * 0.20 para md)', async () => {
    // Verificamos que drawImage se llama con dimensiones proporcionales (no fijas)
    await renderWatermarkedImage('http://example.com/img.png', { ...brand, watermark_url: 'data:image/png;base64,AAAA' }, 'Jade');
    // El watermark (path imagen) se dibuja con targetWidth = 512 * 0.20 = 102.4 → 102
    const calls = mockCtx.drawImage.mock.calls;
    // al menos una llamada con width ~102
    const hasProportional = calls.some((c: unknown[]) => typeof c[3] === 'number' && c[3] > 90 && c[3] < 110);
    expect(hasProportional).toBe(true);
  });
});

describe('downloadBlob', () => {
  it('crea un link y revoca el object URL', () => {
    const revoke = vi.fn();
    const create = vi.fn(() => 'blob:fake');
    (URL as unknown as { createObjectURL: typeof create; revokeObjectURL: typeof revoke }).createObjectURL = create;
    (URL as unknown as { createObjectURL: typeof create; revokeObjectURL: typeof revoke }).revokeObjectURL = revoke;
    const append = vi.spyOn(document.body, 'appendChild').mockImplementation(() => null as unknown as Node);
    const remove = vi.spyOn(document.body, 'removeChild').mockImplementation(() => null as unknown as Node);
    downloadBlob(new Blob(['x']), 'test.png');
    expect(create).toHaveBeenCalled();
    expect(revoke).toHaveBeenCalledWith('blob:fake');
    append.mockRestore();
    remove.mockRestore();
  });
});
import type { BrandProfile } from '../types';

const FONT_FAMILY_MAP: Record<string, string> = {
  sans: 'Inter, system-ui, sans-serif',
  serif: 'Georgia, "Times New Roman", serif',
  mono: '"Courier New", monospace',
  display: '"Playfair Display", Georgia, serif',
};

const SIZE_RATIO: Record<string, number> = { sm: 0.12, md: 0.20, lg: 0.30 };

function isDataUrl(url: string): boolean {
  return url.startsWith('data:');
}

function loadImage(src: string, crossOrigin = false): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (crossOrigin && !isDataUrl(src)) {
      img.crossOrigin = 'anonymous';
    }
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('No se pudo cargar la imagen.'));
    img.src = src;
  });
}

function svgHasDimensions(svgText: string): boolean {
  return /width\s*=\s*["']?\d/.test(svgText) && /height\s*=\s*["']?\d/.test(svgText);
}

async function loadImageSafe(src: string): Promise<HTMLImageElement | null> {
  // Si es SVG data URL sin dimensiones explícitas, rechazar para fallback a texto.
  if (isDataUrl(src) && src.includes('image/svg+xml')) {
    try {
      const b64 = src.split(',')[1] ?? '';
      const text = atob(b64);
      if (!svgHasDimensions(text)) return null;
    } catch {
      return null;
    }
  }
  try {
    return await loadImage(src, !isDataUrl(src));
  } catch {
    return null;
  }
}

function fontFor(typography: string): string {
  return FONT_FAMILY_MAP[typography] ?? FONT_FAMILY_MAP.sans;
}

function colorFor(brand: BrandProfile): string {
  return brand.palette.text ?? brand.palette.primary ?? '#000000';
}

/**
 * Renderiza una imagen con watermark (imagen o texto) y devuelve un Blob PNG.
 * Función pura respecto a los parámetros; depende del DOM (canvas, fonts).
 */
export async function renderWatermarkedImage(
  imageUrl: string,
  brand: BrandProfile | null | undefined,
  characterName: string,
): Promise<Blob> {
  if (!brand) {
    // Sin brand profile, devolver la imagen original sin modificar.
    const img = await loadImage(imageUrl, !isDataUrl(imageUrl));
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas no disponible.');
    ctx.drawImage(img, 0, 0);
    return canvasToBlob(canvas);
  }

  const baseImg = await loadImage(imageUrl, !isDataUrl(imageUrl));
  const canvas = document.createElement('canvas');
  canvas.width = baseImg.naturalWidth;
  canvas.height = baseImg.naturalHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas no disponible.');

  ctx.drawImage(baseImg, 0, 0);

  const sizeRatio = SIZE_RATIO[brand.watermark_size] ?? SIZE_RATIO.md;
  const targetWidth = Math.round(baseImg.naturalWidth * sizeRatio);
  const padding = Math.round(baseImg.naturalWidth * 0.03);

  const pos = brand.watermark_position;
  let x = padding;
  let y = padding;
  if (pos === 'top-right' || pos === 'bottom-right') x = baseImg.naturalWidth - targetWidth - padding;
  if (pos === 'bottom-left' || pos === 'bottom-right') y = baseImg.naturalHeight - Math.round(targetWidth * 0.4) - padding;
  if (pos === 'center') {
    x = (baseImg.naturalWidth - targetWidth) / 2;
    y = (baseImg.naturalHeight - Math.round(targetWidth * 0.4)) / 2;
  }

  ctx.globalAlpha = brand.watermark_opacity / 100;

  // Path 1: imagen watermark
  if (brand.watermark_url) {
    const wmImg = await loadImageSafe(brand.watermark_url);
    if (wmImg) {
      const aspect = wmImg.naturalHeight / wmImg.naturalWidth;
      const h = Math.round(targetWidth * aspect);
      ctx.drawImage(wmImg, x, y, targetWidth, h);
      ctx.globalAlpha = 1;
      return canvasToBlob(canvas);
    }
    // fallback to text if image failed to load
  }

  // Path 2: texto watermark (fallback o sin watermark_url)
  const fontFamily = fontFor(brand.typography);
  const fontSize = Math.max(12, Math.round(baseImg.naturalWidth * 0.035));
  await document.fonts.load(`600 ${fontSize}px ${fontFamily}`);
  await document.fonts.ready;
  ctx.font = `600 ${fontSize}px ${fontFamily}`;
  ctx.fillStyle = colorFor(brand);
  ctx.textBaseline = 'top';
  ctx.fillText(characterName, x, y);

  ctx.globalAlpha = 1;
  return canvasToBlob(canvas);
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('No se pudo generar la imagen.'));
    }, 'image/png');
  });
}

/**
 * Descarga un Blob como archivo.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
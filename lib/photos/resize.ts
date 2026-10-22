/**
 * Photos are shrunk in the browser before upload (long side 1600 px, WebP or JPEG at 0.8), so
 * the 1 GB of free storage lasts. `fitWithin` is the pure math; `prepareImage` runs in the browser.
 * public/sw.js repeats the same formula for images shared from Android (keep them in step).
 */

export const MAX_PHOTO_SIDE = 1600;
export const PHOTO_QUALITY = 0.8;
/** Same limit as the `photos` bucket (0005_photos.sql). */
export const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
export const PHOTO_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'] as const;

export type Size = { width: number; height: number };

/** Scales (width, height) so the long side is at most `max`, keeping the ratio. Never enlarges. */
export function fitWithin(width: number, height: number, max = MAX_PHOTO_SIDE): Size {
  if (!(width > 0) || !(height > 0) || !Number.isFinite(width) || !Number.isFinite(height)) {
    throw new Error('Dimensiones de imagen no válidas');
  }
  const scale = Math.min(1, max / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export type PreparedImage = { blob: Blob; type: string; ext: string; width: number | null; height: number | null };

const EXT: Record<string, string> = { 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/heic': 'heic' };

export function extensionFor(type: string): string {
  return EXT[type] ?? 'jpg';
}

function encode(canvas: HTMLCanvasElement, type: string): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, PHOTO_QUALITY));
}

/**
 * Browser only. Decodes the image (EXIF rotation applied), draws it at `fitWithin` size and
 * encodes WebP (JPEG where the browser cannot encode WebP, e.g. Safari). If the browser cannot
 * decode it (HEIC on Chrome), the original goes up as is, if the bucket accepts it.
 * Throws an Error with a Spanish message when the file cannot be used.
 */
export async function prepareImage(file: File): Promise<PreparedImage> {
  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    bitmap = null;
  }
  if (bitmap) {
    try {
      const size = fitWithin(bitmap.width, bitmap.height);
      const canvas = document.createElement('canvas');
      canvas.width = size.width;
      canvas.height = size.height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(bitmap, 0, 0, size.width, size.height);
        let blob = await encode(canvas, 'image/webp');
        if (!blob || blob.type !== 'image/webp') blob = await encode(canvas, 'image/jpeg');
        if (blob) return { blob, type: blob.type, ext: extensionFor(blob.type), ...size };
      }
    } finally {
      bitmap.close();
    }
  }
  if ((PHOTO_MIME_TYPES as readonly string[]).includes(file.type) && file.size <= MAX_PHOTO_BYTES) {
    return { blob: file, type: file.type, ext: extensionFor(file.type), width: null, height: null };
  }
  throw new Error('No se ha podido leer la imagen. Prueba con una foto JPEG o PNG.');
}

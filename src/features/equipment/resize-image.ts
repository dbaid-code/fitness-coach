// On-phone resize and re-encode (D-01, FR-24): ≤ 1568 px long edge, JPEG 0.85, EXIF stripped by re-encoding.
import { PHOTO_JPEG_QUALITY, PHOTO_MAX_LONG_EDGE_PX } from '@/shared/constants';

export async function resizeForUpload(file: Blob): Promise<{ blob: Blob; width: number; height: number }> {
  const bitmap = await createImageBitmap(file); // throws on undecodable files (e.g. HEIC on Android)
  const scale = Math.min(1, PHOTO_MAX_LONG_EDGE_PX / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  let blob: Blob;
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(width, height);
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, width, height);
    blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: PHOTO_JPEG_QUALITY });
  } else {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, width, height);
    blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('encode failed'))), 'image/jpeg', PHOTO_JPEG_QUALITY),
    );
  }
  bitmap.close();
  return { blob, width, height };
}

/** Widest a logo is kept: the dots of a 58 mm head, so it prints sharp on either roll. */
export const LOGO_MAX_WIDTH = 384;

/** A picture bigger than this is not a logo; it is refused before it is even decoded. */
export const LOGO_MAX_BYTES = 4 * 1024 * 1024;

/**
 * An image file as a logo: scaled down to the width of a roll, in grey tones on white (a thermal
 * head prints no colour and a transparent background would print black). Returns a PNG data URL,
 * small enough to keep in the browser's storage.
 */
export async function imageToLogo(file: Blob, maxWidth: number = LOGO_MAX_WIDTH): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('El archivo no es una imagen.');
  if (file.size > LOGO_MAX_BYTES) throw new Error('La imagen es demasiado grande (máximo 4 MB).');

  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error('No se pudo leer la imagen.');
  });
  try {
    const scale = Math.min(1, maxWidth / bitmap.width);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('No se pudo preparar la imagen.');
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.filter = 'grayscale(1)';
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/png');
  } finally {
    bitmap.close();
  }
}

/**
 * Digital seal / signature stamping.
 *
 * The seal is an ordinary PNG or JPEG picked by the office worker. Its bytes
 * stay in memory for the session only - like the PDFs, they are never stored
 * or uploaded - and the finished package gets the image stamped onto the
 * pages the user chose.
 */

export const SEAL_MAX_BYTES = 5 * 1024 * 1024;
export const SEAL_MAX_MB = 5;

/** Where the seal is stamped. Stored as strings so the UI and the PDF agree. */
export const SEAL_SCOPES = ['cover', 'docFirst', 'everyPage'];
export const SEAL_DEFAULT_SCOPE = 'cover';
export const SEAL_DEFAULT_WIDTH_MM = 45;
export const SEAL_WIDTHS_MM = [30, 45, 60];

/** Gap between the page edge and the seal, and between seal and footer. */
export const SEAL_INSET = 16;
export const MM_TO_PT = 72 / 25.4;

function toBytes(value) {
  if (!value) return null;
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  return null;
}

/**
 * 'png' | 'jpg' | null, decided by the magic bytes: a renamed file must not
 * reach pdf-lib, which would only fail much later during the build.
 */
export function classifySealBytes(value) {
  const head = toBytes(value);
  if (!head || head.length < 8) return null;
  if (
    head[0] === 0x89 &&
    head[1] === 0x50 && // P
    head[2] === 0x4e && // N
    head[3] === 0x47 && // G
    head[4] === 0x0d &&
    head[5] === 0x0a &&
    head[6] === 0x1a &&
    head[7] === 0x0a
  ) {
    return 'png';
  }
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return 'jpg';
  return null;
}

export function normalizeSealScope(scope) {
  return SEAL_SCOPES.includes(scope) ? scope : SEAL_DEFAULT_SCOPE;
}

export function normalizeSealWidth(widthMm) {
  const value = Number(widthMm);
  return Number.isFinite(value) && value > 0 ? value : SEAL_DEFAULT_WIDTH_MM;
}

/**
 * Top-right corner is never used: the seal sits at the bottom-right, above the
 * footer strip, and shrinks instead of running off the page. Returns PDF points.
 *
 * `footerHeight` is passed in (rather than imported) so this stays a pure,
 * dependency-free function that tests can drive directly.
 */
export function sealPlacement({
  pageWidth,
  pageHeight,
  imageWidth,
  imageHeight,
  widthMm,
  footerHeight = 0,
  inset = SEAL_INSET,
}) {
  const sourceWidth = Math.max(1, Number(imageWidth) || 1);
  const sourceHeight = Math.max(1, Number(imageHeight) || 1);

  let width = Number(widthMm) * MM_TO_PT;
  if (!Number.isFinite(width) || width <= 0) width = SEAL_DEFAULT_WIDTH_MM * MM_TO_PT;
  let height = width * (sourceHeight / sourceWidth);

  const floor = footerHeight + inset;
  const maxWidth = Math.max(1, pageWidth - inset * 2);
  const maxHeight = Math.max(1, pageHeight - floor - inset);
  const scale = Math.min(1, maxWidth / width, maxHeight / height);
  width *= scale;
  height *= scale;

  return {
    x: pageWidth - inset - width,
    y: floor,
    width,
    height,
  };
}

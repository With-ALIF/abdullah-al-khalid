import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

// Vite gives us a hashed URL for the worker bundle, so there is no CDN and no
// extra network request. Everything stays local.
pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export const READ_ERROR = {
  ENCRYPTED: 'encrypted',
  BROKEN: 'broken',
  UNKNOWN: 'unknown',
};

export function classifyError(error) {
  const name = error && error.name ? error.name : '';
  const message = String((error && error.message) || error || '');
  if (name === 'PasswordException' || /password/i.test(message)) return READ_ERROR.ENCRYPTED;
  if (name === 'InvalidPDFException' || /invalid pdf|structure|xref|damaged/i.test(message)) {
    return READ_ERROR.BROKEN;
  }
  return READ_ERROR.UNKNOWN;
}

/**
 * Read a PDF once to get its page count and first page size.
 * pdfjs is happy with damaged or password-protected files, but it reports them
 * as rejections, so we classify instead of crashing.
 */
export async function inspectPdf(data) {
  let task = null;
  try {
    // pdfjs may take ownership (transfer) of the buffer, so always hand it a copy.
    task = pdfjs.getDocument({
      data: new Uint8Array(data),
      isEvalSupported: false,
      useSystemFonts: true,
      disableAutoFetch: false,
    });
    const doc = await task.promise;
    const pageCount = doc.numPages;
    let firstPage = null;
    try {
      const page = await doc.getPage(1);
      const viewport = page.getViewport({ scale: 1 });
      firstPage = { width: viewport.width, height: viewport.height, rotation: page.rotate || 0 };
      page.cleanup();
    } catch {
      firstPage = null;
    }
    await doc.destroy();
    return { ok: true, pageCount, firstPage };
  } catch (error) {
    if (task) {
      try {
        await task.destroy();
      } catch {
        /* ignore */
      }
    }
    return { ok: false, kind: classifyError(error), detail: String((error && error.message) || error) };
  }
}

/**
 * Render page 1 of a PDF into a canvas for the preview thumbnail.
 * Returns a data URL, or null when the page cannot be rendered.
 */
export async function renderFirstPage(data, maxWidth = 240) {
  let doc = null;
  try {
    const task = pdfjs.getDocument({
      data: new Uint8Array(data),
      isEvalSupported: false,
      useSystemFonts: true,
    });
    doc = await task.promise;
    const page = await doc.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(1.6, maxWidth / base.width);
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.floor(viewport.width));
    canvas.height = Math.max(1, Math.floor(viewport.height));
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: context, viewport }).promise;
    page.cleanup();
    return canvas.toDataURL('image/png');
  } catch {
    return null;
  } finally {
    if (doc) {
      try {
        await doc.destroy();
      } catch {
        /* ignore */
      }
    }
  }
}

/** SHA-256 of raw bytes, as lowercase hex. Used for duplicate detection. */
export async function sha256Hex(data) {
  const digest = await crypto.subtle.digest('SHA-256', data);
  const bytes = new Uint8Array(digest);
  let out = '';
  for (let i = 0; i < bytes.length; i += 1) {
    out += bytes[i].toString(16).padStart(2, '0');
  }
  return out;
}

export function looksLikePdfName(name, type) {
  if (type === 'application/pdf') return true;
  return /\.pdf$/i.test(name || '');
}

/**
 * True when the first KB of bytes contains the "%PDF-" header.
 * Extensions and MIME types lie (a PNG renamed to .pdf still says .pdf), so
 * upload validation must check the bytes themselves. Per the PDF spec the
 * header may sit a few bytes in, so we scan the first 1024 rather than
 * requiring it at offset 0.
 */
export function hasPdfMagic(bytes) {
  if (!bytes || bytes.length < 5) return false;
  const head = new Uint8Array(bytes.buffer, bytes.byteOffset, Math.min(bytes.length, 1024));
  for (let i = 0; i + 5 <= head.length; i += 1) {
    if (
      head[i] === 0x25 && // %
      head[i + 1] === 0x50 && // P
      head[i + 2] === 0x44 && // D
      head[i + 3] === 0x46 && // F
      head[i + 4] === 0x2d // -
    ) {
      return true;
    }
  }
  return false;
}

/** Read just the head of a File/Blob and check it is really a PDF. */
export async function fileHasPdfMagic(file) {
  try {
    const head = await file.slice(0, 1024).arrayBuffer();
    return hasPdfMagic(new Uint8Array(head));
  } catch {
    // If we cannot read it, let the full read classify the error instead.
    return true;
  }
}
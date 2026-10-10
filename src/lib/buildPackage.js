import { PDFDocument, StandardFonts, rgb, degrees } from 'pdf-lib';
import { todayISO, formatISODateForDisplay } from './dates.js';
import { classifySealBytes, normalizeSealScope, normalizeSealWidth, sealPlacement } from './sealImage.js';

/**
 * Extra space added at the bottom of every page so the footer sits in its own
 * margin and never overlaps document content.
 */
export const FOOTER_HEIGHT = 36;
export const FOOTER_SEPARATOR_GAP = 6;

const A4 = { width: 595.28, height: 841.89 };
const MARGIN = { left: 56, right: 56, top: 56, bottom: 56 };

const INK = { dark: rgb(0.11, 0.13, 0.16), muted: rgb(0.38, 0.41, 0.45), faint: rgb(0.78, 0.8, 0.83) };

function normalizeRotation(angle) {
  const value = Math.round(Number(angle) || 0) % 360;
  return value < 0 ? value + 360 : value;
}

/** Line-wrap helper that also hard-splits words longer than the line. */
function wrapLines(text, font, size, maxWidth) {
  const words = String(text ?? '').split(/\s+/).filter(Boolean);
  const lines = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth || !current) {
      current = candidate;
      continue;
    }
    lines.push(current);
    if (font.widthOfTextAtSize(word, size) <= maxWidth) {
      current = word;
      continue;
    }
    let chunk = '';
    for (const ch of word) {
      if (font.widthOfTextAtSize(chunk + ch, size) > maxWidth && chunk) {
        lines.push(chunk);
        chunk = ch;
      } else {
        chunk += ch;
      }
    }
    current = chunk;
  }
  if (current) lines.push(current);
  return lines.length ? lines : [''];
}

function textOp(text, x, y, { size = 11, font = 'regular', align = 'left', color = INK.dark } = {}) {
  return { kind: 'text', text, x, y, size, font, align, color };
}

function ruleOp(x1, y1, x2, y2, { width = 0.8, color = INK.faint } = {}) {
  return { kind: 'rule', x1, y1, x2, y2, width, color };
}

/* ------------------------------------------------------------------ cover */

/**
 * Turn the cover content into positioned draw operations, one array per page.
 * Planning and drawing are separated so we know the cover's page count before
 * we compute the index page numbers that follow it.
 */
function planCover({ fonts, tender, entries, generatedOn }) {
  const contentWidth = A4.width - MARGIN.left - MARGIN.right;
  // Lowest y we may draw at: the bottom margin line.
  const bottom = MARGIN.bottom;
  const pages = [];
  let ops = [];
  let y = A4.height - MARGIN.top;

  const newPage = () => {
    if (ops.length) pages.push(ops);
    ops = [];
    y = A4.height - MARGIN.top;
  };
  const ensure = (needed) => {
    if (y - needed < bottom && ops.length) newPage();
  };
  const block = (opFactory, height) => {
    ensure(height);
    ops.push(opFactory());
    y -= height;
  };

  const label = (text) => textOp(text, MARGIN.left, y, { size: 10, font: 'regular', color: INK.muted });
  const value = (text) => {
    const lines = wrapLines(text, fonts.bold, 12, contentWidth - 150);
    return lines.map((line, i) =>
      textOp(line, MARGIN.left + 150, y - i * 16, { size: 12, font: 'bold' }),
    );
  };

  // Centred text is centred on the page, so its x is the page's centre line.
  block(
    () =>
      textOp('TENDER SUBMISSION DOCUMENT PACKAGE', A4.width / 2, y, {
        size: 18,
        font: 'bold',
        align: 'center',
      }),
    30,
  );
  block(
    () =>
      textOp(tender.tender_id || '', A4.width / 2, y, {
        size: 13,
        font: 'regular',
        align: 'center',
        color: INK.muted,
      }),
    26,
  );
  block(() => ruleOp(MARGIN.left, y, A4.width - MARGIN.right, y), 26);

  const fields = [
    ['Tender ID', tender.tender_id],
    ['Tender title', tender.title],
    ['Procuring entity', tender.procuring_entity],
    ['Bidder', tender.bidder],
    ['Submission deadline', tender.submission_deadline_display],
    ['Package generated on', generatedOn],
  ];

  for (const [name, rawValue] of fields) {
    const text = rawValue === undefined || rawValue === null ? '' : String(rawValue);
    const lines = wrapLines(text || '-', fonts.bold, 12, contentWidth - 150);
    const height = Math.max(20, lines.length * 16 + 4);
    ensure(height);
    ops.push(label(name));
    ops.push(...value(text || '-'));
    y -= height;
  }

  ensure(46);
  ops.push(ruleOp(MARGIN.left, y, A4.width - MARGIN.right, y));
  y -= 24;
  ops.push(
    textOp(`Documents included (${entries.length})`, MARGIN.left, y, { size: 13, font: 'bold' }),
  );
  y -= 22;

  if (entries.length === 0) {
    ops.push(textOp('No documents were included.', MARGIN.left, y, { color: INK.muted }));
  }

  for (const entry of entries) {
    const titleWidth = contentWidth - 120;
    const titleLines = wrapLines(entry.title, fonts.regular, 11, titleWidth);
    // Title, then the file name on its own line underneath.
    const fileLineY = y - (titleLines.length - 1) * 14 - 13;
    const meta = `${entry.pages} page(s)`;
    const rowHeight = titleLines.length * 14 + 22;
    ensure(rowHeight);
    ops.push(textOp(`${entry.order}.`, MARGIN.left, y, { size: 11, font: 'bold', color: INK.muted }));
    ops.push(...titleLines.map((line, i) => textOp(line, MARGIN.left + 32, y - i * 14, { size: 11 })));
    ops.push(
      textOp(meta, A4.width - MARGIN.right - fonts.regular.widthOfTextAtSize(meta, 10), y, {
        size: 10,
        color: INK.muted,
      }),
    );
    ops.push(
      textOp(entry.fileName, MARGIN.left + 32, fileLineY, { size: 9, color: INK.muted }),
    );
    y -= rowHeight;
  }

  if (ops.length) pages.push(ops);
  return pages;
}

/* ------------------------------------------------------------------ index */

/**
 * Plan the optional index page. Called once with `startPages = null` only to
 * learn the page count, then again with the real numbers.
 */
function planIndex({ fonts, tender, entries, startPages }) {
  const contentWidth = A4.width - MARGIN.left - MARGIN.right;
  const bottom = MARGIN.bottom;
  const titleWidth = contentWidth - 150;
  const pages = [];
  let ops = [];
  let y = A4.height - MARGIN.top;

  const newPage = () => {
    if (ops.length) pages.push(ops);
    ops = [];
    y = A4.height - MARGIN.top;
  };
  const ensure = (needed) => {
    if (y - needed < bottom && ops.length) newPage();
  };

  ops.push(
    textOp('Document index', A4.width / 2, y, { size: 18, font: 'bold', align: 'center' }),
  );
  y -= 22;
  ops.push(
    textOp(tender.tender_id || '', A4.width / 2, y, {
      size: 11,
      color: INK.muted,
      align: 'center',
    }),
  );
  y -= 20;
  ops.push(ruleOp(MARGIN.left, y, A4.width - MARGIN.right, y));
  y -= 22;

  const headerRow = () => {
    ops.push(
      textOp('Document', MARGIN.left, y, { size: 10, font: 'bold', color: INK.muted }),
    );
    ops.push(
      textOp('Pages', MARGIN.left + contentWidth - 150, y, {
        size: 10,
        font: 'bold',
        color: INK.muted,
      }),
    );
    ops.push(
      textOp('Starts on page', MARGIN.left + contentWidth - 60, y, {
        size: 10,
        font: 'bold',
        color: INK.muted,
      }),
    );
    ops.push(ruleOp(MARGIN.left, y - 8, A4.width - MARGIN.right, y - 8));
    y -= 20;
  };
  headerRow();

  for (const [index, entry] of entries.entries()) {
    const titleLines = wrapLines(entry.title, fonts.regular, 11, titleWidth);
    // Title, then the file name on its own line underneath.
    const fileLineY = y - (titleLines.length - 1) * 14 - 13;
    const rowHeight = titleLines.length * 14 + 24;
    if (y - rowHeight < bottom && ops.length) {
      newPage();
      headerRow();
    }
    const pageText = String(entry.pages);
    const startText = startPages ? String(startPages[index]) : '';
    ops.push(...titleLines.map((line, i) => textOp(line, MARGIN.left, y - i * 14, { size: 11 })));
    ops.push(
      textOp(pageText, MARGIN.left + contentWidth - 150, y, { size: 11, color: INK.muted }),
    );
    ops.push(
      textOp(startText, MARGIN.left + contentWidth - 60, y, { size: 11, font: 'bold' }),
    );
    ops.push(textOp(entry.fileName, MARGIN.left, fileLineY, { size: 9, color: INK.muted }));
    y -= rowHeight;
  }

  if (ops.length) pages.push(ops);
  return pages;
}

/* ---------------------------------------------------------------- drawing */

function drawOps(page, ops, fonts) {
  for (const op of ops) {
    if (op.kind === 'text') {
      const font = op.font === 'bold' ? fonts.bold : fonts.regular;
      const width = font.widthOfTextAtSize(op.text, op.size);
      const x = op.align === 'center' ? op.x - width / 2 : op.x;
      page.drawText(op.text, { x, y: op.y, size: op.size, font, color: op.color });
    } else if (op.kind === 'rule') {
      page.drawLine({
        start: { x: op.x1, y: op.y1 },
        end: { x: op.x2, y: op.y2 },
        thickness: op.width,
        color: op.color,
      });
    }
  }
}

/**
 * Place one source page onto a fresh, slightly taller page and return it.
 * The source page's own size and /Rotate are respected, so scanned landscape
 * or rotated pages keep their orientation.
 */
async function placeSourcePage(outDoc, srcDoc, pageIndex) {
  const srcPage = srcDoc.getPage(pageIndex);
  const embedded = await outDoc.embedPage(srcPage);

  const rotation = normalizeRotation(srcPage.getRotation().angle);
  const swapped = rotation === 90 || rotation === 270;
  const contentWidth = swapped ? embedded.height : embedded.width;
  const contentHeight = swapped ? embedded.width : embedded.height;

  const outPage = outDoc.addPage([contentWidth, contentHeight + FOOTER_HEIGHT]);
  outPage.setRotation(degrees(0));

  // Rotate the content counter-clockwise by `rotation` so that, once the viewer
  // applies the source page's /Rotate, the result looks identical to the source.
  const drawRotation = (360 - rotation) % 360;
  const translateX = rotation === 180 ? embedded.width : rotation === 270 ? embedded.height : 0;
  const translateY =
    (rotation === 90 ? embedded.width : rotation === 180 ? embedded.height : 0) + FOOTER_HEIGHT;

  outPage.drawPage(embedded, {
    x: translateX,
    y: translateY,
    rotate: degrees(drawRotation),
  });

  return outPage;
}

/**
 * Which 0-based pages receive the seal.
 *
 *  - cover     : the first cover page only (a cover that spills onto a second
 *                page is not stamped twice)
 *  - docFirst  : the first page of every document that made it into the package
 *  - everyPage : every page of the finished PDF
 */
export function sealPageIndexes({ scope, coverCount = 0, pageCount = 0, startPages = [] }) {
  const mode = normalizeSealScope(scope);
  if (mode === 'cover') return coverCount > 0 ? [0] : [];
  if (mode === 'docFirst') {
    return startPages.map((start) => start - 1).filter((index) => index >= 0 && index < pageCount);
  }
  return Array.from({ length: pageCount }, (_unused, index) => index);
}

/**
 * Embed the seal image once and stamp it onto the chosen pages.
 * Returns how many pages received it.
 */
async function stampSeal(outDoc, seal, targets) {
  const data = seal && seal.data instanceof Uint8Array ? seal.data : null;
  const format = data ? classifySealBytes(data) : null;
  if (!format) throw new Error('The seal image must be a PNG or JPEG file.');

  let image;
  try {
    image = format === 'png' ? await outDoc.embedPng(data) : await outDoc.embedJpg(data);
  } catch (error) {
    throw new Error(`The seal image could not be read: ${error.message}`);
  }

  const widthMm = normalizeSealWidth(seal.widthMm);
  const pages = outDoc.getPages();
  const indexes = sealPageIndexes({ ...targets, scope: seal.scope });
  for (const index of indexes) {
    const page = pages[index];
    if (!page) continue;
    const { width, height } = page.getSize();
    const box = sealPlacement({
      pageWidth: width,
      pageHeight: height,
      imageWidth: image.width,
      imageHeight: image.height,
      widthMm,
      footerHeight: FOOTER_HEIGHT,
    });
    page.drawImage(image, { x: box.x, y: box.y, width: box.width, height: box.height });
  }
  return indexes.length;
}

/**
 * Build the final package.
 *
 * Returns { bytes, pageCount, entries, seal } where `entries` describes what
 * ended up in the PDF and on which page each document starts.
 */
export async function buildPackage({
  tender,
  rows,
  files,
  includeIndex = false,
  seal = null,
  onProgress = () => {},
}) {
  const fonts = {
    regular: null,
    bold: null,
  };

  // Documents that make it into the package, in requirement order.
  const included = rows
    .filter((row) => row.included)
    .map((row) => {
      const file = files.find((f) => f.id === row.fileId);
      if (!file) throw new Error(`Missing file data for ${row.requirement.id}`);
      return { row, file };
    });

  onProgress({ stage: 'reading', percent: 5 });
  const sources = [];
  for (let i = 0; i < included.length; i += 1) {
    const { file } = included[i];
    let srcDoc = null;
    try {
      srcDoc = await PDFDocument.load(file.data, { updateMetadata: false });
    } catch (error) {
      throw new Error(`"${file.name}" could not be opened: ${error.message}`);
    }
    sources.push({ ...included[i], srcDoc, pageCount: srcDoc.getPageCount() });
  }

  const entries = sources.map(({ row, file, pageCount }) => ({
    order: row.requirement.order,
    id: row.requirement.id,
    title: row.requirement.title_en || row.requirement.id,
    fileName: file.name,
    pages: pageCount,
  }));

  const outDoc = await PDFDocument.create();
  outDoc.setProducer('Tender Document Package Builder');
  outDoc.setCreator('Tender Document Package Builder');
  fonts.regular = await outDoc.embedFont(StandardFonts.Helvetica);
  fonts.bold = await outDoc.embedFont(StandardFonts.HelveticaBold);

  const generatedOn = formatISODateForDisplay(todayISO(), 'en');
  const coverTender = {
    tender_id: tender.tender_id || '',
    title: tender.title || '',
    procuring_entity: tender.procuring_entity || '',
    bidder: tender.bidder || '',
    submission_deadline_display: tender.submission_deadline
      ? formatISODateForDisplay(tender.submission_deadline, 'en')
      : '-',
  };

  onProgress({ stage: 'cover', percent: 25 });
  const coverPlan = planCover({ fonts, tender: coverTender, entries, generatedOn });
  const coverPages = coverPlan.map((ops) => {
    const page = outDoc.addPage([A4.width, A4.height + FOOTER_HEIGHT]);
    drawOps(page, ops, fonts);
    return page;
  });

  let indexPageCount = 0;
  if (includeIndex) {
    onProgress({ stage: 'index', percent: 32 });
    indexPageCount = planIndex({ fonts, tender: coverTender, entries, startPages: null }).length;
    const startPages = [];
    let cursor = coverPages.length + indexPageCount + 1;
    for (const entry of entries) {
      startPages.push(cursor);
      cursor += entry.pages;
    }
    const indexPlan = planIndex({ fonts, tender: coverTender, entries, startPages });
    for (const ops of indexPlan) {
      const page = outDoc.addPage([A4.width, A4.height + FOOTER_HEIGHT]);
      drawOps(page, ops, fonts);
    }
  }

  onProgress({ stage: 'merge', percent: 40 });
  const pagesBeforeDocuments = outDoc.getPageCount();
  const totalDocPages = totalSourcePages(sources);
  let merged = 0;
  for (const source of sources) {
    source.startPage = pagesBeforeDocuments + merged + 1;
    for (let p = 0; p < source.pageCount; p += 1) {
      await placeSourcePage(outDoc, source.srcDoc, p);
      merged += 1;
      onProgress({ stage: 'merge', percent: 40 + Math.round((merged / totalDocPages) * 45) });
    }
  }

  let sealedPages = 0;
  if (seal) {
    onProgress({ stage: 'seal', percent: 88 });
    sealedPages = await stampSeal(outDoc, seal, {
      coverCount: coverPages.length,
      pageCount: outDoc.getPageCount(),
      startPages: sources.map((source) => source.startPage),
    });
  }

  onProgress({ stage: 'footer', percent: 90 });
  const total = outDoc.getPageCount();
  drawFooters(outDoc, tender.tender_id || '', total, fonts);

  onProgress({ stage: 'saving', percent: 97 });
  const bytes = await outDoc.save({ useObjectStreams: false });

  return {
    bytes,
    pageCount: total,
    seal: seal ? { scope: normalizeSealScope(seal.scope), pages: sealedPages } : null,
    entries: sources.map((source) => ({
      order: source.row.requirement.order,
      id: source.row.requirement.id,
      title: source.row.requirement.title_en || source.row.requirement.id,
      fileName: source.file.name,
      pages: source.pageCount,
      startPage: source.startPage,
    })),
  };
}

function totalSourcePages(sources) {
  return Math.max(1, sources.reduce((sum, source) => sum + source.pageCount, 0));
}

/** Draw "<tender_id> | Page X of Y" in the added bottom margin of every page. */
function drawFooters(outDoc, tenderId, total, fonts) {
  const pages = outDoc.getPages();
  pages.forEach((page, index) => {
    const { width } = page.getSize();
    const label = `${tenderId} | Page ${index + 1} of ${total}`;
    const size = width < 320 ? 7 : 9;
    const inset = Math.max(16, Math.min(40, width * 0.08));
    const textWidth = fonts.regular.widthOfTextAtSize(label, size);
    const x = Math.max(inset, (width - textWidth) / 2);
    page.drawLine({
      start: { x: inset, y: FOOTER_HEIGHT - FOOTER_SEPARATOR_GAP },
      end: { x: Math.max(inset + 1, width - inset), y: FOOTER_HEIGHT - FOOTER_SEPARATOR_GAP },
      thickness: 0.6,
      color: INK.faint,
    });
    page.drawText(label, {
      x,
      y: Math.max(8, (FOOTER_HEIGHT - FOOTER_SEPARATOR_GAP) / 2 - size / 2 + 1),
      size,
      font: fonts.regular,
      color: INK.muted,
    });
  });
}
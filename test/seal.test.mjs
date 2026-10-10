// Verifies seal stamping: byte classification, placement maths, which pages
// receive the seal, and that stamping never disturbs page count or footers.
import { deflateSync } from 'node:zlib';
import { PDFDocument, PDFName } from 'pdf-lib';
import { buildPackage, sealPageIndexes, FOOTER_HEIGHT } from '../src/lib/buildPackage.js';
import {
  classifySealBytes,
  normalizeSealScope,
  normalizeSealWidth,
  sealPlacement,
  SEAL_DEFAULT_SCOPE,
  SEAL_DEFAULT_WIDTH_MM,
  SEAL_INSET,
  MM_TO_PT,
} from '../src/lib/sealImage.js';
import { translate, dictionaries } from '../src/i18n.js';

let failed = 0;
const eq = (label, actual, expected) => {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) {
    failed += 1;
    console.log(`FAIL ${label}: got ${a} want ${b}`);
  }
};
const ok = (label, value) => eq(label, Boolean(value), true);

/* --------------------------------------------------------------- fixtures */

function crc32(buf) {
  let table = crc32.table;
  if (!table) {
    table = new Int32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
    crc32.table = table;
  }
  let crc = -1;
  for (let i = 0; i < buf.length; i += 1) crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
  return (crc ^ -1) >>> 0;
}

function pngChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const name = Buffer.from(type, 'latin1');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([name, data])), 0);
  return Buffer.concat([length, name, data, crc]);
}

/** Minimal valid RGBA PNG, built here so the test owns its fixture. */
function makePng(width = 40, height = 30) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  const raw = Buffer.alloc(height * (1 + width * 4));
  let cursor = 0;
  for (let y = 0; y < height; y += 1) {
    raw[cursor] = 0; // filter: none
    cursor += 1;
    for (let x = 0; x < width; x += 1) {
      raw[cursor] = 200;
      raw[cursor + 1] = 30;
      raw[cursor + 2] = 30;
      raw[cursor + 3] = 255;
      cursor += 4;
    }
  }
  return new Uint8Array(
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      pngChunk('IHDR', ihdr),
      pngChunk('IDAT', deflateSync(raw)),
      pngChunk('IEND', Buffer.alloc(0)),
    ]),
  );
}

async function makeDoc({ pages = 1, label }) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont('Helvetica');
  for (let i = 0; i < pages; i += 1) {
    const page = doc.addPage([595.28, 841.89]);
    page.drawText(`${label} ${i + 1}`, { x: 40, y: 800, size: 16, font });
  }
  return doc.save({ useObjectStreams: false });
}

/** True when the page itself (not a nested form) owns an image XObject. */
function pageHasImage(bytes, index) {
  return PDFDocument.load(bytes).then((doc) => {
    const page = doc.getPage(index);
    const resources = page.node.Resources();
    const xobjects = resources ? resources.lookup(PDFName.of('XObject')) : null;
    if (!xobjects) return false;
    return xobjects.keys().some((key) => key.toString().startsWith('/Image'));
  });
}

/* ------------------------------------------------------------ classification */

const png = makePng();
const jpegHeader = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46]);

eq('png classified', classifySealBytes(png), 'png');
eq('png via ArrayBuffer', classifySealBytes(png.buffer.slice(0)), 'png');
eq('jpeg classified', classifySealBytes(jpegHeader), 'jpg');
eq('jpeg via Buffer', classifySealBytes(Buffer.from(jpegHeader)), 'jpg');
eq('pdf is not a seal', classifySealBytes(Buffer.from('%PDF-1.7....')), null);
eq('empty rejected', classifySealBytes(new Uint8Array(0)), null);
eq('null rejected', classifySealBytes(null), null);

eq('scope fallback', normalizeSealScope('nonsense'), SEAL_DEFAULT_SCOPE);
eq('scope kept', normalizeSealScope('everyPage'), 'everyPage');
eq('width fallback', normalizeSealWidth('wide'), SEAL_DEFAULT_WIDTH_MM);
eq('width negative fallback', normalizeSealWidth(-3), SEAL_DEFAULT_WIDTH_MM);
eq('width kept', normalizeSealWidth(60), 60);

/* --------------------------------------------------------------- placement */

const footer = FOOTER_HEIGHT;
const A4 = { width: 595.28, height: 841.89 };
const seal = sealPlacement({
  pageWidth: A4.width,
  pageHeight: A4.height,
  imageWidth: 400,
  imageHeight: 300,
  widthMm: 45,
  footerHeight: footer,
});
eq('45mm in points', Math.round(seal.width * 1e6) / 1e6, Math.round(45 * MM_TO_PT * 1e6) / 1e6);
ok('aspect ratio kept', Math.abs(seal.height / seal.width - 300 / 400) < 1e-9);
ok('sits above the footer strip', seal.y >= footer);
ok('bottom-right inset', Math.abs(seal.x + seal.width - (A4.width - SEAL_INSET)) < 1e-9);
ok('never taller than the page', seal.y + seal.height <= A4.height);
ok('never past the left edge', seal.x >= 0);

// An absurd width shrinks instead of running off the page.
const huge = sealPlacement({
  pageWidth: 300,
  pageHeight: 500,
  imageWidth: 100,
  imageHeight: 900,
  widthMm: 500,
  footerHeight: footer,
});
ok('huge seal shrinks to fit the height', huge.height <= 500 - footer - SEAL_INSET);
ok('huge seal shrinks to fit the width', huge.width <= 300 - SEAL_INSET * 2);
ok('huge seal still above footer', huge.y >= footer);
ok('huge seal still on the page', huge.x >= 0 && huge.x + huge.width <= 300);

// Degenerate inputs never produce NaN.
const broken = sealPlacement({ pageWidth: A4.width, pageHeight: A4.height, imageWidth: 0, imageHeight: 0, widthMm: 0, footerHeight: footer });
ok('no NaN with empty inputs', Number.isFinite(broken.x) && Number.isFinite(broken.y) && broken.width > 0);

/* --------------------------------------------------------- page selection */

eq('cover: first page only', sealPageIndexes({ scope: 'cover', coverCount: 1, pageCount: 9, startPages: [2, 6] }), [0]);
eq('cover: no cover page', sealPageIndexes({ scope: 'cover', coverCount: 0, pageCount: 9, startPages: [1] }), []);
eq('docFirst: document starts', sealPageIndexes({ scope: 'docFirst', coverCount: 1, pageCount: 12, startPages: [2, 6, 12] }), [1, 5, 11]);
eq('everyPage: all pages', sealPageIndexes({ scope: 'everyPage', coverCount: 1, pageCount: 4, startPages: [2] }), [0, 1, 2, 3]);
eq('unknown scope falls back to cover', sealPageIndexes({ scope: 'other', coverCount: 1, pageCount: 3, startPages: [2] }), [0]);
eq('docFirst ignores pages outside the document', sealPageIndexes({ scope: 'docFirst', coverCount: 1, pageCount: 3, startPages: [2, 99] }), [1]);

/* -------------------------------------------------------------- integration */

const tender = {
  tender_id: 'SEAL-TEST',
  title: 'Seal test',
  procuring_entity: 'Entity',
  bidder: 'Bidder',
  submission_deadline: '2026-11-30',
};
const rows = [
  { requirement: { id: 'A', order: 1, title_en: 'First', title_bn: 'First' }, fileId: 'a', included: true },
  { requirement: { id: 'B', order: 2, title_en: 'Second', title_bn: 'Second' }, fileId: 'b', included: true },
  { requirement: { id: 'C', order: 3, title_en: 'Third', title_bn: 'Third' }, fileId: 'c', included: true },
];
const files = [
  { id: 'a', name: 'a.pdf', data: new Uint8Array(await makeDoc({ pages: 1, label: 'A' })) },
  { id: 'b', name: 'b.pdf', data: new Uint8Array(await makeDoc({ pages: 3, label: 'B' })) },
  { id: 'c', name: 'c.pdf', data: new Uint8Array(await makeDoc({ pages: 2, label: 'C' })) },
];
// cover (1) + optional index (1) + 6 document pages
const TOTAL_EXPECTED = 8;

const base = await buildPackage({ tender, rows, files, includeIndex: true });
eq('no seal: page count', base.pageCount, TOTAL_EXPECTED);
eq('no seal: result reports none', base.seal, null);
const TOTAL = base.pageCount;
const firstPages = base.entries.map((entry) => entry.startPage - 1);
for (let i = 0; i < TOTAL; i += 1) {
  eq(`no seal: page ${i + 1} has no image`, await pageHasImage(base.bytes, i), false);
}

for (const scope of ['cover', 'docFirst', 'everyPage']) {
  const built = await buildPackage({
    tender,
    rows,
    files,
    includeIndex: true,
    seal: { data: png, scope, widthMm: 45 },
  });
  eq(`${scope}: page count unchanged`, built.pageCount, TOTAL);
  eq(`${scope}: reports the scope`, built.seal.scope, scope);

  const expected = [];
  for (let i = 0; i < TOTAL; i += 1) {
    const onPage =
      scope === 'everyPage' || (scope === 'cover' ? i === 0 : firstPages.includes(i));
    expected.push(onPage);
    eq(`${scope}: page ${i + 1} seal`, await pageHasImage(built.bytes, i), onPage);
  }
  eq(`${scope}: stamped count`, built.seal.pages, expected.filter(Boolean).length);

  // Stamping must not break pagination or footers.
  const doc = await PDFDocument.load(built.bytes);
  eq(`${scope}: pdf-lib page count`, doc.getPageCount(), TOTAL);
  for (let i = 1; i <= TOTAL; i += 1) {
    const text = await pageText(built.bytes, i);
    if (!text.includes(`SEAL-TEST | Page ${i} of ${TOTAL}`)) {
      failed += 1;
      console.log(`FAIL ${scope}: footer missing on page ${i}`);
    }
  }
}

// A bad image must fail loudly instead of producing an unstamped package.
try {
  await buildPackage({
    tender,
    rows,
    files,
    includeIndex: false,
    seal: { data: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]), scope: 'cover', widthMm: 45 },
  });
  ok('invalid seal image rejected', false);
} catch (error) {
  ok('invalid seal image rejected', /PNG or JPEG/.test(error.message));
}

/* ------------------------------------------------------------------ i18n */

const sealKeys = Object.keys(dictionaries.en).filter((key) => key.startsWith('seal.'));
ok('seal keys exist', sealKeys.length >= 20);
ok(
  'seal keys translated in both languages',
  sealKeys.every((key) => dictionaries.bn[key] !== undefined && dictionaries.bn[key] !== key),
);
eq('seal stage progress text', translate('en', 'step4.stage.seal'), 'Stamping the seal');

/* ------------------------------------------------------------- page text */

async function pageText(bytes, pageNumber) {
  const pdfjs = await import('../node_modules/pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(bytes.slice()),
    isEvalSupported: false,
    useSystemFonts: true,
  }).promise;
  const page = await doc.getPage(pageNumber);
  const text = (await page.getTextContent()).items.map((item) => item.str).join(' ');
  await doc.destroy();
  return text;
}

console.log(failed === 0 ? 'ALL SEAL TESTS PASSED' : `${failed} FAILURES`);
process.exit(failed === 0 ? 0 : 1);

// Verifies the generated package: page count, footers on every page, that the
// source content keeps its size and orientation, and the cover/index contents.
import { PDFDocument, StandardFonts, rgb, degrees } from 'pdf-lib';
import { buildPackage, FOOTER_HEIGHT } from '../src/lib/buildPackage.js';

let failed = 0;
const eq = (label, actual, expected) => {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) {
    failed += 1;
    console.log(`FAIL ${label}: got ${a} want ${b}`);
  }
};

const A4W = 595.28;
const A4H = 841.89;

async function makeDoc({ width = A4W, height = A4H, rotate = 0, pages = 1, label }) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < pages; i += 1) {
    const page = doc.addPage([width, height]);
    if (rotate) page.setRotation(degrees(rotate));
    page.drawText(`${label}`, { x: 20, y: height - 40, size: 18, font });
    page.drawText('BOTTOMMARK', { x: 20, y: 8, size: 8, font });
  }
  return doc.save({ useObjectStreams: false });
}

const pdfjs = await import('../node_modules/pdfjs-dist/legacy/build/pdf.mjs');
const { Util } = pdfjs;
const normalizeAngle = (a) => {
  let d = Math.round((a * 180) / Math.PI) % 360;
  if (d < 0) d += 360;
  return d;
};

async function displayItems(data, pageNumber) {
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(data),
    isEvalSupported: false,
    useSystemFonts: true,
  }).promise;
  const page = await doc.getPage(pageNumber);
  const viewport = page.getViewport({ scale: 1 });
  const content = await page.getTextContent();
  return {
    width: viewport.width,
    height: viewport.height,
    items: content.items
      .filter((item) => item.str.trim())
      .map((item) => {
        const [a, b, , , e, f] = Util.transform(viewport.transform, item.transform);
        return { str: item.str, x: e, y: f, angle: normalizeAngle(Math.atan2(b, a)) };
      }),
  };
}

const cases = [
  { name: 'rot0', width: A4W, height: A4H, rotate: 0 },
  { name: 'rot90', width: A4W, height: A4H, rotate: 90 },
  { name: 'rot180', width: A4W, height: A4H, rotate: 180 },
  { name: 'rot270', width: A4W, height: A4H, rotate: 270 },
  { name: 'landscape', width: A4H, height: A4W, rotate: 0 },
  { name: 'oddsize', width: 300, height: 500, rotate: 0 },
  { name: 'multipage', width: A4W, height: A4H, rotate: 0, pages: 3 },
];

for (const c of cases) {
  c.bytes = await makeDoc({ ...c, label: c.name.toUpperCase() });
}

const rows = cases.map((c, i) => ({
  requirement: { id: `R${i + 1}`, order: i + 1, title_en: c.name, title_bn: c.name },
  fileId: c.name,
  included: true,
}));
// An optional document with no file must be skipped.
rows.push({
  requirement: { id: 'Rskip', order: 99, title_en: 'Optional missing', title_bn: 'Optional missing' },
  fileId: null,
  included: false,
});

const files = cases.map((c) => ({ id: c.name, name: `${c.name}.pdf`, data: new Uint8Array(c.bytes) }));
const tender = {
  tender_id: 'PKG-TEST',
  title: 'Package test',
  procuring_entity: 'Entity',
  bidder: 'Bidder',
  submission_deadline: '2026-11-30',
};

const expectedDocPages = cases.reduce((sum, c) => sum + (c.pages || 1), 0);

for (const includeIndex of [false, true]) {
  const result = await buildPackage({ tender, rows, files, includeIndex });
  const doc = await pdfjs.getDocument({
    data: result.bytes.slice(),
    isEvalSupported: false,
    useSystemFonts: true,
  }).promise;

  const expectedTotal = 1 + (includeIndex ? 1 : 0) + expectedDocPages;
  eq(`includeIndex=${includeIndex} page count`, result.pageCount, expectedTotal);
  eq(`includeIndex=${includeIndex} pdfjs page count`, doc.numPages, expectedTotal);

  // Footer on every page, correct numbers.
  for (let i = 1; i <= doc.numPages; i += 1) {
    const page = await doc.getPage(i);
    const text = (await page.getTextContent()).items.map((item) => item.str).join(' ');
    const expected = `PKG-TEST | Page ${i} of ${expectedTotal}`;
    if (!text.includes(expected)) {
      failed += 1;
      console.log(`FAIL footer on page ${i}: expected "${expected}"`);
    }
  }

  // Document start pages.
  let cursor = 1 + (includeIndex ? 1 : 0) + 1;
  for (const entry of result.entries) {
    eq(`includeIndex=${includeIndex} start page of ${entry.id}`, entry.startPage, cursor);
    cursor += entry.pages;
  }

  // Cover is English and lists the included documents.
  const coverText = (
    await (await doc.getPage(1)).getTextContent()
  ).items.map((item) => item.str).join(' ');
  for (const needle of ['PKG-TEST', 'Package test', 'Entity', 'Bidder', 'rot90', 'multipage']) {
    if (!coverText.includes(needle)) {
      failed += 1;
      console.log(`FAIL cover is missing "${needle}"`);
    }
  }
  if (coverText.includes('Optional missing')) {
    failed += 1;
    console.log('FAIL cover lists an optional document that was not included');
  }

  if (includeIndex) {
    const indexText = (
      await (await doc.getPage(2)).getTextContent()
    ).items.map((item) => item.str).join(' ');
    if (!indexText.includes('Document index')) {
      failed += 1;
      console.log('FAIL index page heading missing');
    }
    const firstStart = result.entries[0].startPage;
    if (!indexText.includes(String(firstStart))) {
      failed += 1;
      console.log('FAIL index page does not show the first start page');
    }
  }
}

// Each source page keeps its own size and orientation, and gains 36pt at the
// bottom so the footer never covers content.
{
  const result = await buildPackage({ tender, rows, files, includeIndex: false });
  for (let i = 0; i < cases.length; i += 1) {
    const c = cases[i];
    const src = await displayItems(c.bytes, 1);
    const dst = await displayItems(result.bytes, i + 2);
    const srcKey = src.items.map((it) => `${it.str}@${it.x.toFixed(0)},${it.y.toFixed(0)},${it.angle}`).join('|');
    const dstKey = dst.items
      .filter((it) => !it.str.includes('|'))
      .map((it) => `${it.str}@${it.x.toFixed(0)},${it.y.toFixed(0)},${it.angle}`)
      .join('|');
    eq(`${c.name} output width`, dst.width.toFixed(1), src.width.toFixed(1));
    eq(`${c.name} output height is source + footer`, dst.height.toFixed(1), (src.height + FOOTER_HEIGHT).toFixed(1));
    eq(`${c.name} content unchanged`, dstKey, srcKey);
  }
}

eq('footer height', FOOTER_HEIGHT, 36);

console.log(failed === 0 ? 'ALL PACKAGE TESTS PASSED' : `${failed} FAILURES`);
process.exit(failed === 0 ? 0 : 1);
import { computeStatus, buildChecklist, summarizeChecklist, STATUS } from './src/lib/status.js';
import { isBefore, compareISODate, parseISODate, todayISO } from './src/lib/dates.js';
import { parseRequirements, displayTitle } from './src/lib/requirements.js';
import { suggestMatches } from './src/lib/matchSuggestions.js';
import { buildChecklistCsv } from './src/lib/csv.js';
import { translate, makeT } from './src/i18n.js';

let failed = 0;
const eq = (label, actual, expected) => {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) {
    failed += 1;
    console.log(`FAIL ${label}: got ${a} want ${b}`);
  }
};
const t = makeT('en');
const deadline = '2026-11-30';
const req = (over = {}) => ({ id: 'R', order: 1, title_en: 'T', title_bn: 'T', mandatory: true, has_expiry: false, ...over });

// dates
eq('parse valid', parseISODate('2026-02-28'), { y: 2026, m: 2, d: 28 });
eq('parse invalid day', parseISODate('2026-02-30'), null);
eq('parse invalid month', parseISODate('2026-13-01'), null);
eq('parse loose', parseISODate('2026-1-5'), null);
eq('parse slash', parseISODate('2026/01/05'), null);
eq('compare', compareISODate('2026-01-01', '2026-01-02'), -1);
eq('compare eq', compareISODate('2026-01-01', '2026-01-01'), 0);
eq('isBefore same day', isBefore('2026-11-30', deadline), false);
eq('isBefore one day earlier', isBefore('2026-11-29', deadline), true);
eq('isBefore one day later', isBefore('2026-12-01', deadline), false);
eq('todayISO format', /^\d{4}-\d{2}-\d{2}$/.test(todayISO()), true);

// status
eq('missing mandatory', computeStatus({ requirement: req(), file: null, expiryDate: '', deadline }), STATUS.MISSING);
eq('not provided optional', computeStatus({ requirement: req({ mandatory: false }), file: null, expiryDate: '', deadline }), STATUS.NOT_PROVIDED);
eq('ok no expiry needed', computeStatus({ requirement: req(), file: { id: 1 }, expiryDate: '', deadline }), STATUS.OK);
eq('expiry needed', computeStatus({ requirement: req({ has_expiry: true }), file: { id: 1 }, expiryDate: '', deadline }), STATUS.EXPIRY_NEEDED);
eq('expired', computeStatus({ requirement: req({ has_expiry: true }), file: { id: 1 }, expiryDate: '2026-11-29', deadline }), STATUS.EXPIRED);
eq('deadline day is ok', computeStatus({ requirement: req({ has_expiry: true }), file: { id: 1 }, expiryDate: '2026-11-30', deadline }), STATUS.OK);
eq('after deadline ok', computeStatus({ requirement: req({ has_expiry: true }), file: { id: 1 }, expiryDate: '2026-12-31', deadline }), STATUS.OK);
eq('optional missing does not block', computeStatus({ requirement: req({ mandatory: false, has_expiry: true }), file: null, expiryDate: '', deadline }), STATUS.NOT_PROVIDED);
eq('expiry date without file does not block', computeStatus({ requirement: req({ has_expiry: true }), file: null, expiryDate: '2020-01-01', deadline }), STATUS.MISSING);

// checklist + summary
const requirements = [
  req({ id: 'A', order: 1 }),
  req({ id: 'B', order: 2, has_expiry: true }),
  req({ id: 'C', order: 3, mandatory: false }),
  req({ id: 'D', order: 4, has_expiry: true }),
];
const checklist = buildChecklist({
  requirements,
  matches: { A: 'f1', B: 'f2' },
  filesById: { f1: { id: 'f1', pageCount: 1 }, f2: { id: 'f2', pageCount: 2 } },
  expiryDates: { B: '2026-11-30', D: '2026-12-31' },
  deadline,
});
eq('statuses', checklist.map((r) => r.status), ['ok', 'ok', 'not_provided', 'missing']);
const summary = summarizeChecklist(checklist);
eq('summary matched', summary.matched, 2);
eq('summary ok', summary.ok, 2);
eq('summary notProvided', summary.notProvided, 1);
eq('summary missing', summary.missing, 1);
eq('summary blocking', summary.blocking, 1);

// requirements parsing
const parsed = parseRequirements({
  tender: { tender_id: 'T-1', title: 'x', procuring_entity: 'e', bidder: 'b', submission_deadline: '2026-05-05' },
  requirements: [
    { id: 'b', order: 2, title_en: 'Second', title_bn: 'দ্বিতীয়', mandatory: false, has_expiry: true },
    { id: 'a', order: 1, title_en: 'First', title_bn: 'প্রথম', mandatory: true, has_expiry: false },
  ],
});
eq('parse ok', parsed.ok, true);
eq('sorted by order', parsed.requirements.map((r) => r.id), ['a', 'b']);
eq('deadline valid', parsed.deadlineValid, true);
eq('bad shape', parseRequirements({ tender: {} }).ok, false);
eq('missing array', parseRequirements({ tender: { tender_id: 'x' } }).ok, false);
eq('not json object', parseRequirements([]).ok, false);
eq('no title', parseRequirements({ tender: {}, requirements: [{ id: 'x', order: 1 }] }).ok, false);
eq('bad deadline flagged', parseRequirements({ tender: { submission_deadline: 'soon' }, requirements: [{ id: 'x', order: 1, title_en: 'T' }] }).deadlineValid, false);
eq('display bn', displayTitle({ title_bn: 'বাং', title_en: 'en' }, 'bn'), 'বাং');
eq('display en fallback', displayTitle({ title_bn: 'বাং', title_en: '' }, 'en'), 'বাং');

// suggestions
const suggestions = suggestMatches({
  files: [
    { id: 'f1', name: 'trade_license.pdf', readState: 'ready' },
    { id: 'f2', name: 'bank_solvency_certificate.pdf', readState: 'ready' },
    { id: 'f3', name: 'random_scan_01.pdf', readState: 'ready' },
  ],
  requirements: [
    req({ id: 'TL', title_en: 'Trade License' }),
    req({ id: 'BS', title_en: 'Bank Solvency Certificate' }),
  ],
});
eq(
  'suggestions',
  suggestions.map((s) => `${s.fileId}->${s.requirementId}`).sort(),
  ['f1->TL', 'f2->BS'],
);

// csv
const csv = buildChecklistCsv({ checklist, tender: { tender_id: 'T-1' }, t, lang: 'en' });
eq('csv header', csv.replace(/^\uFEFF/, '').split('\r\n')[0], 'order,requirement_id,document,file_name,pages,expiry_date,status');
eq('csv bom', csv.charCodeAt(0), 0xfeff);
eq('csv has OK', csv.includes('OK'), true);

// i18n
eq('i18n en', translate('en', 'status.ok'), 'OK');
eq('i18n bn falls back', translate('bn', 'totally.unknown.key'), 'totally.unknown.key');
eq('i18n params', translate('en', 'step2.pages', { count: 3 }), '3 page(s)');
eq('bn differs from en', translate('bn', 'status.ok') !== translate('en', 'status.ok'), true);

console.log(failed === 0 ? '\nALL LOGIC TESTS PASSED' : `\n${failed} FAILURES`);
process.exit(failed === 0 ? 0 : 1);
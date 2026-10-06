import { STATUS } from './status.js';

function escapeCell(value) {
  const text = value === undefined || value === null ? '' : String(value);
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

/**
 * Build the checklist CSV. Columns: order, requirement id, document title
 * (in the active language), file name, pages, expiry date, status.
 */
export function buildChecklistCsv({ checklist, tender, t, lang }) {
  const titleOf = (row) => (lang === 'bn' ? row.requirement.title_bn : row.requirement.title_en)
    || row.requirement.title_en
    || row.requirement.id;

  const header = ['order', 'requirement_id', 'document', 'file_name', 'pages', 'expiry_date', 'status'];
  const lines = [header.map(escapeCell).join(',')];

  for (const row of checklist) {
    lines.push(
      [
        row.requirement.order,
        row.requirement.id,
        titleOf(row),
        row.file ? row.file.name : '',
        row.file ? row.file.pageCount : '',
        row.expiryDate || '',
        t(`status.${row.status}`),
      ]
        .map(escapeCell)
        .join(','),
    );
  }

  if (tender && tender.tender_id) {
    lines.push('');
    lines.push(['tender_id', escapeCell(tender.tender_id)].join(','));
  }
  if (checklist.some((row) => row.status === STATUS.EXPIRED)) {
    lines.push('');
    lines.push(['note', escapeCell('Expired means the expiry date is before the submission deadline.')].join(','));
  }

  // BOM so Excel opens the UTF-8 file correctly, including Bangla titles.
  return `\uFEFF${lines.join('\r\n')}`;
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Give the browser a moment to start the download before releasing the URL.
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function downloadBytes(bytes, filename, type) {
  const blob = new Blob([bytes], { type });
  downloadBlob(blob, filename);
}

export function downloadText(text, filename, type = 'text/plain;charset=utf-8') {
  downloadBlob(new Blob([text], { type }), filename);
}
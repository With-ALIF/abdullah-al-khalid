# Tender Document Package Builder

A browser-only tool for office staff preparing a tender submission. You load a
`requirements.json` file, add your PDFs, match each file to the document the
tender asks for, and the app builds **one merged PDF** with a cover page and a
footer on every page.

Everything happens on the user's own computer. There is no server, no upload and
no analytics: files are read with the browser's File API and processed in memory.
The build output is a plain static site, so it can be hosted on Vercel, Netlify
or GitHub Pages over HTTPS.

Stack: React (JavaScript + JSX, no TypeScript), Vite, `pdf-lib` for merging and
footers, `pdfjs-dist` for page counting, previews and hashing input checks.

## Requirements

- Node.js 20.19+ or 22.12+ (Vite 6 requirement). Node 24 works.
- A current Chrome, Edge or another Chromium-based browser. The build targets
  `chrome120` because `pdfjs-dist` uses `Promise.withResolvers`.

## Run it locally

```bash
npm install
npm run dev      # http://localhost:5173
```

Build and preview the production bundle:

```bash
npm run build    # -> dist/
npm run preview  # serve dist/ locally
```

Tests (pure logic plus the generated PDF, run in Node, no browser needed):

```bash
npm test
```

`test/status.test.mjs` covers the status rules, date-only comparisons,
`requirements.json` validation, suggestions, CSV and the dictionary.
`test/package.test.mjs` builds real packages and checks page counts, footers on
every page, the index start-page numbers, the cover contents, and that each
source page keeps its size and orientation while gaining 36 pt at the bottom.

## How to use it

1. **Load requirements** — pick `requirements.json`. The tender header and the
   list of required documents (sorted by `order`) appear. A sample file is
   available at `public/requirements.sample.json`, and the *Load sample
   requirements* button loads it for a quick trial.
2. **Add PDFs** — use the file picker (multiple selection) or drag and drop.
   Up to 30 files and 50 MB in total. Non-PDF files are rejected with a message,
   each PDF's page count is shown, and any file can be removed (which also clears
   its match).
3. **Match files to documents** — each row has a dropdown. One document takes at
   most one file, one file goes to at most one document, and you can change or
   undo a match at any time. Files with identical content are flagged
   *Duplicate* and cannot be matched to different documents.
4. **Expiry dates** — when a requirement has `has_expiry: true` and a file is
   matched, a date field appears.
5. **Check and build** — the status of every requirement updates instantly. The
   **Build package PDF** button stays disabled while anything is blocking and
   lists exactly why, e.g. `Trade License: Missing`. When nothing blocks, the
   file downloads as `<tender_id>_Package.pdf`.
6. **Language** — the বাংলা / English switch changes the whole UI, including
   requirement names (`title_bn` vs `title_en`). The generated PDF is always in
   English.

## Status rules

Exactly one status per document, derived by a pure function
(`src/lib/status.js`) so it can never drift out of sync with what is on screen:

| Status | When | Blocks build |
| --- | --- | --- |
| Missing | `mandatory` and no file matched | yes |
| Expiry date needed | `has_expiry`, file matched, no date entered | yes |
| Expired | expiry date strictly **before** `submission_deadline` | yes |
| Not provided | optional and no file matched | no |
| OK | file matched and, if `has_expiry`, expiry >= deadline | no |

An expiry date falling exactly on the deadline day is **OK**. Dates are compared
as date-only `YYYY-MM-DD` values (`src/lib/dates.js`), never through
`new Date(string)`, so no timezone can shift a day.

## The generated PDF

- **Page 1** — English cover: tender ID, tender title, procuring entity, bidder,
  submission deadline, the generation date, and the ordered list of included
  documents with page counts and file names.
- **Optional index page** after the cover, listing each document's starting page
  number (toggle in step 4).
- Then the documents in `order`, every page in its original order. Optional
  documents with no file are left out.
- **Footer on every page, including the cover**: `<tender_id> | Page X of Y`,
  where `Y` is the total page count of the finished PDF.

Footers never cover content. Each source page is placed onto a **new page that is
36 pt taller**, with the source content at the top and the footer drawn in the
added bottom margin (above a thin separator rule). Each page keeps its own size
and orientation: the source page's `/Rotate` is applied to the drawn content and
the output page is left unrotated, so a landscape scan still shows up landscape
and a rotated scan keeps its reading direction.

## Also included

- Index page with starting page numbers (toggleable).
- CSV export of the checklist: order, id, document, file name, pages, expiry,
  status. UTF-8 with a BOM so Bangla opens correctly in Excel.
- Project save/restore. Work is kept in `localStorage` as you work; *Save project
  file* / *Open project file* move it between machines. PDF bytes are never
  stored, so after restoring you re-add the files and matches are re-applied
  automatically by content hash.
- Auto-match suggestions based on file names. Deliberately conservative: only
  unambiguous pairings are proposed.
- Damaged or password-protected PDFs are reported per file ("Damaged or not a
  valid PDF", "Password-protected") and are never matched, so they cannot fail
  the build.

## Accessibility and UI notes

- Status is shown with a word, an icon **and** a colour, never colour alone.
- 44 px minimum click targets, real `<label>`s, `aria-live` regions for
  messages and progress, a skip link, and a visible focus ring.
- Bangla text uses Noto Sans Bengali, bundled locally via `@fontsource` — no
  Google Fonts request at runtime.

## Project layout

```
src/
  App.jsx                  screen wiring, drag & drop, downloads
  i18n.js                  en / bn dictionary
  hooks/
    useWorkbench.js        all app state and the rules that change it
    useNotifications.js    toast messages
  lib/
    buildPackage.js        pdf-lib merge, cover, index, footers
    pdfRead.js             pdfjs page counts, previews, SHA-256, error kinds
    status.js              pure status derivation (the rule table above)
    dates.js               date-only parsing and comparison
    requirements.js        requirements.json validation and normalisation
    matchSuggestions.js    file-name based match suggestions
    projectStore.js        localStorage session + project JSON
    csv.js                 checklist CSV and download helpers
  components/
    TenderHeader.jsx  RequirementsList.jsx  UploadedFiles.jsx
    MatchSelect.jsx   StatusBadge.jsx       GenerateBar.jsx
test/
  status.test.mjs        status rules, dates, validation, CSV, i18n
  package.test.mjs       the generated PDF: pages, footers, index, rotation
```

Statuses are never stored in state. `useWorkbench` holds the requirements, the
file list, the matches and the expiry dates; `buildChecklist` derives the status
of every document from those inputs with `useMemo`, so any change recomputes the
whole checklist immediately.

## Deploying

`npm run build` produces a self-contained `dist/`. `vite.config.js` uses
`base: './'`, so the same folder works at a domain root and in a project
sub-path such as GitHub Pages' `/repo/` path.

### Vercel

```bash
npx vercel        # framework preset: Vite; build command: npm run build
```

### Netlify

Build command `npm run build`, publish directory `dist`. A `netlify.toml` is not
required; set them in the UI or add the file.

### GitHub Pages

Push to a repository and enable Pages with "Deploy from a branch". Because
`base` is relative, no extra configuration is needed.

Any other static host works too — the site is HTTPS-agnostic and makes no
runtime requests to third parties. Note that `crypto.subtle` (used for the
SHA-256 duplicate check) requires a secure context, so serve the site over
HTTPS; `localhost` also qualifies during development.

## Limits

PDF only, up to 30 files and 50 MB in total. These are the app's limits, not
browser limits; the totals are checked as files are added and anything over the
limit is reported by name.
import { Link2, Unlink } from 'lucide-react';

/**
 * Dropdown for "which uploaded file belongs to this document".
 *
 * Only unmatched, non-duplicate files are offered (plus the currently matched
 * one); files in use elsewhere never appear, so a file can never end up in
 * two documents.
 */
export default function MatchSelect({
  value,
  options,
  onChange,
  onUnmatch,
  label,
  placeholder,
  noneLabel,
  unmatchLabel,
  emptyLabel,
}) {
  const hasValue = Boolean(value);
  return (
    <div>
      <label
        className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-slate-600 dark:text-slate-300"
        htmlFor={`match-${label.id}`}
      >
        <Link2 size={18} aria-hidden="true" className="shrink-0 text-indigo-600 dark:text-indigo-300" />
        {label.text}
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <select
          id={`match-${label.id}`}
          className="min-h-[44px] w-full min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
          value={hasValue ? value : ''}
          onChange={(event) => onChange(event.target.value || null)}
        >
          <option value="">{hasValue ? noneLabel : placeholder}</option>
          {options.length === 0 ? <option disabled>{emptyLabel}</option> : null}
          {options.map((option) => (
            <option key={option.value} value={option.value} disabled={option.disabled}>
              {option.label}
            </option>
          ))}
        </select>
        {hasValue ? (
          <button
            type="button"
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            onClick={onUnmatch}
          >
            <Unlink size={18} aria-hidden="true" />
            {unmatchLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
}

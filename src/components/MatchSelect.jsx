/**
 * Dropdown for "which uploaded file belongs to this document".
 *
 * Files already matched to another document are disabled, so a file can never
 * end up in two documents. Duplicate files that are in use elsewhere are
 * disabled too, which enforces the duplicate rule.
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
    <div className="matchselect">
      <label className="matchselect__label" htmlFor={`match-${label.id}`}>
        {label.text}
      </label>
      <select
        id={`match-${label.id}`}
        className="select"
        value={hasValue ? value : ''}
        onChange={(event) => onChange(event.target.value || null)}
      >
        <option value="">{hasValue ? noneLabel : placeholder}</option>
        {options.length === 0 ? <option disabled>{emptyLabel}</option> : null}
        {options.map((option) => (
          <option
            key={option.value}
            value={option.value}
            disabled={option.disabled}
          >
            {option.label}
          </option>
        ))}
      </select>
      {hasValue ? (
        <button type="button" className="btn btn--ghost btn--sm" onClick={onUnmatch}>
          {unmatchLabel}
        </button>
      ) : null}
    </div>
  );
}
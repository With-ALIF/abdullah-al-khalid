import { useEffect, useRef, useState } from 'react';
import { Trash2, UploadCloud } from 'lucide-react';
import { SEAL_MAX_MB, SEAL_SCOPES, SEAL_WIDTHS_MM } from '../lib/sealImage.js';

/**
 * Optional company seal / signature.
 *
 * Pick a PNG or JPEG, choose where it is stamped, choose its width. The bytes
 * live in memory only: the preview is an object URL that is revoked as soon as
 * the image changes or the panel unmounts.
 */
export default function SealPanel({ seal, onSelect, onRemove, onScopeChange, onWidthChange, t }) {
  const inputRef = useRef(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const sealData = seal ? seal.data : null;
  const sealFormat = seal ? seal.format : null;

  useEffect(() => {
    if (!sealData) {
      setPreviewUrl(null);
      return undefined;
    }
    const type = sealFormat === 'png' ? 'image/png' : 'image/jpeg';
    const url = URL.createObjectURL(new Blob([sealData], { type }));
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [sealData, sealFormat]);

  return (
    <section className="panel panel--seal" aria-labelledby="seal-heading">
      <div className="panel__head">
        <h2 id="seal-heading" className="panel__title">
          {t('seal.title')}
        </h2>
        {seal ? <span className="chip">{seal.name}</span> : null}
      </div>

      <p className="panel__help">{t('seal.help')}</p>

      <div className="actions">
        <button type="button" className="btn btn--ghost" onClick={() => inputRef.current?.click()}>
          <UploadCloud size={18} aria-hidden="true" />
          {seal ? t('seal.replace') : t('seal.choose')}
        </button>
        {seal ? (
          <button type="button" className="btn btn--danger" onClick={onRemove}>
            <Trash2 size={18} aria-hidden="true" />
            {t('seal.remove')}
          </button>
        ) : null}
      </div>

      {!seal ? (
        <>
          <p className="muted">{t('seal.empty')}</p>
          <p className="panel__note muted">
            {t('seal.formatHint', { max: `${SEAL_MAX_MB} MB` })}
          </p>
        </>
      ) : (
        <div className="seal__body">
          {previewUrl ? (
            <img className="seal__preview" src={previewUrl} alt={t('seal.previewAlt')} />
          ) : null}

          <fieldset className="seal__opts">
            <legend>{t('seal.scopeLegend')}</legend>
            {SEAL_SCOPES.map((scope) => (
              <label className="seal__option" key={scope} htmlFor={`seal-scope-${scope}`}>
                <input
                  id={`seal-scope-${scope}`}
                  type="radio"
                  name="seal-scope"
                  value={scope}
                  checked={seal.scope === scope}
                  onChange={() => onScopeChange(scope)}
                />
                <span>{t(`seal.scope.${scope}`)}</span>
              </label>
            ))}
            <p className="seal__hint muted">{t(`seal.hint.${seal.scope}`)}</p>
          </fieldset>

          <div className="seal__width">
            <label className="expiry__label" htmlFor="seal-width">
              {t('seal.widthLabel')}
            </label>
            <select
              id="seal-width"
              className="input"
              value={String(seal.widthMm)}
              onChange={(event) => onWidthChange(Number(event.target.value))}
            >
              {SEAL_WIDTHS_MM.map((widthMm) => (
                <option key={widthMm} value={String(widthMm)}>
                  {widthMm} mm
                </option>
              ))}
            </select>
            <p className="expiry__hint">{t('seal.widthHint')}</p>
          </div>
        </div>
      )}

      <input
        ref={inputRef}
        className="sr-only"
        type="file"
        accept="image/png,image/jpeg,.png,.jpg,.jpeg"
        tabIndex={-1}
        onChange={(event) => {
          const file = event.target.files && event.target.files[0];
          // Reset so re-picking the same file fires change again.
          event.target.value = '';
          if (file) onSelect(file);
        }}
      />
    </section>
  );
}

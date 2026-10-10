import { Monitor, Moon, Sun } from 'lucide-react';
import { THEMES } from '../lib/theme.js';

const ICONS = { light: Sun, dark: Moon, system: Monitor };

/**
 * Light / dark / system segmented control, styled like the language switch so
 * the two sit together in the header bar. The icons carry the meaning, so each
 * button also has a text label for screen readers and a tooltip for the mouse.
 */
export default function ThemeSwitch({ theme, onThemeChange, t }) {
  return (
    <div
      className="langswitch"
      role="group"
      aria-label={t('theme.label')}
      title={t('theme.hint')}
    >
      {THEMES.map((mode) => {
        const Icon = ICONS[mode];
        const selected = theme === mode;
        return (
          <button
            key={mode}
            type="button"
            className={`langswitch__btn langswitch__btn--icon${selected ? ' langswitch__btn--on' : ''}`}
            aria-pressed={selected}
            aria-label={t(`theme.${mode}`)}
            title={t(`theme.${mode}`)}
            onClick={() => onThemeChange(mode)}
          >
            <Icon size={16} aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}

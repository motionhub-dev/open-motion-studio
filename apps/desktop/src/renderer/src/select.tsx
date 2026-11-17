// The app's one select: a combobox that is a pick list, or an input with suggestions when `editable`, its options in a
// popup portalled to the body so no scrolling panel clips it. It keeps the ARIA combobox pattern and the keys of a
// native select, and its keys never reach the film's shortcuts.

import { Check, ChevronDown } from 'lucide-react';
import { createPortal } from 'react-dom';
import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { usePreferences } from './preferences';

export interface SelectOption { value: string; label: string; disabled?: boolean }
interface Props {
  value: string;
  options: SelectOption[];
  onValueChange(value: string): void;
  disabled?: boolean;
  editable?: boolean;
  placeholder?: string;
  'aria-label': string;
  className?: string;
}

/** Shared select-only/editable combobox. The popup escapes scrolling panels, never the viewport. */
export function Select({ value, options, onValueChange, disabled, editable, placeholder, className = '', 'aria-label': label }: Props) {
  const { t } = usePreferences();
  const id = useId();
  const control = useRef<HTMLButtonElement | HTMLInputElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [filter, setFilter] = useState(false);
  const [position, setPosition] = useState({ left: 0, top: 0, width: 0, maxHeight: 280 });
  const search = useRef({ text: '', at: 0 });
  const available = editable && filter ? options.filter(option => `${option.label} ${option.value}`.toLocaleLowerCase().includes(value.toLocaleLowerCase())) : options;
  const shown = open && !disabled;
  const selected = options.find(option => option.value === value);
  function show() {
    if (disabled) return;
    setFilter(false);
    setActive(options.findIndex(option => option.value === value && !option.disabled));
    setOpen(true);
  }
  function commit(next: string) {
    setOpen(false);
    control.current?.focus();
    if (next !== value) {
      // Preserve form-level dirty tracking for both pointer and keyboard selections.
      control.current?.dispatchEvent(new Event('input', { bubbles: true }));
      onValueChange(next);
    }
  }
  useLayoutEffect(() => {
    if (!shown) return;
    const place = () => {
      const rect = control.current!.getBoundingClientRect();
      if (rect.bottom <= 0 || rect.top >= innerHeight || rect.right <= 0 || rect.left >= innerWidth) { setOpen(false); return; }
      const below = innerHeight - rect.bottom - 12;
      const above = rect.top - 12;
      const up = below < Math.min(280, available.length * 36 + 8) && above > below;
      const maxHeight = Math.max(0, Math.min(280, up ? above : below));
      const height = Math.min(popup.current?.scrollHeight ?? 280, maxHeight);
      const width = Math.min(Math.max(rect.width, 160), innerWidth - 16);
      setPosition({
        left: Math.max(8, Math.min(rect.left, innerWidth - width - 8)),
        top: Math.max(8, Math.min(up ? rect.top - height - 4 : rect.bottom + 4, innerHeight - height - 8)),
        width,
        maxHeight,
      });
    };
    place();
    const scroll = (event: Event) => { if (!popup.current?.contains(event.target as Node)) place(); };
    window.addEventListener('resize', place);
    window.addEventListener('scroll', scroll, true);
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', scroll, true); };
  }, [shown, available.length]);
  useEffect(() => {
    if (!shown) return;
    const outside = (event: PointerEvent) => {
      if (!control.current?.contains(event.target as Node) && !popup.current?.contains(event.target as Node)) setOpen(false);
    };
    const blur = () => setOpen(false);
    document.addEventListener('pointerdown', outside, true);
    window.addEventListener('blur', blur);
    return () => { document.removeEventListener('pointerdown', outside, true); window.removeEventListener('blur', blur); };
  }, [shown]);
  useEffect(() => { if (disabled) setOpen(false); }, [disabled]);
  useEffect(() => { if (shown) popup.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' }); }, [active, shown]);
  function key(event: KeyboardEvent) {
    // Editing shortcuts must not reach the film's global keyboard handlers.
    event.stopPropagation();
    if (event.key === 'Tab') { setOpen(false); return; }
    if (event.key === 'Escape') { if (shown) event.preventDefault(); setOpen(false); return; }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || (!editable && (event.key === 'Home' || event.key === 'End'))) {
      event.preventDefault();
      if (!shown) { show(); return; }
      const enabled = available.map((option, index) => option.disabled ? -1 : index).filter(index => index >= 0);
      const current = enabled.indexOf(active);
      const next =
        event.key === 'Home'
          ? enabled[0]
          : event.key === 'End'
            ? enabled.at(-1)
            : event.key === 'ArrowDown'
              ? enabled[(current + 1) % enabled.length]
              : enabled[(current < 0 ? enabled.length - 1 : current - 1 + enabled.length) % enabled.length];
      setActive(next ?? -1);
    } else if (event.key === 'Enter' || (!editable && event.key === ' ')) {
      event.preventDefault();
      if (!shown) show();
      else if (available[active] && !available[active]!.disabled) commit(available[active]!.value);
    } else if (!editable && event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      const now = Date.now();
      search.current = { text: now - search.current.at < 700 ? search.current.text + event.key : event.key, at: now };
      const index = available.findIndex(option => !option.disabled && option.label.toLocaleLowerCase().startsWith(search.current.text.toLocaleLowerCase()));
      setOpen(true); setActive(index);
    }
  }
  const common = {
    role: 'combobox' as const, 'aria-label': label, 'aria-expanded': shown,
    'aria-controls': shown ? id : undefined, 'aria-haspopup': 'listbox' as const,
    'aria-activedescendant': shown && available[active] ? `${id}-${active}` : undefined,
    disabled, onKeyDown: key, onBlur: () => setOpen(false),
  };
  const bind = (node: HTMLButtonElement | HTMLInputElement | null) => {
    control.current = node;
  };
  return (
    <span className={`studio-select ${className}`}>
      {editable ? (
        <input
          {...common}
          ref={bind}
          type="text"
          className="select-trigger"
          aria-autocomplete="list"
          autoComplete="off"
          value={value}
          placeholder={placeholder}
          onClick={show}
          onChange={(event) => {
            onValueChange(event.target.value);
            setFilter(true);
            setActive(-1);
            setOpen(true);
          }}
        />
      ) : (
        <button {...common} ref={bind} type="button" className="select-trigger" onClick={() => (shown ? setOpen(false) : show())}>
          <span className="select-value">{selected?.label ?? (value || placeholder || t('Select an option'))}</span>
          <ChevronDown size={14} aria-hidden="true" />
        </button>
      )}
      {editable && <ChevronDown className="select-input-chevron" size={14} aria-hidden="true" />}
      {shown &&
        createPortal(
          <div
            ref={popup}
            id={id}
            className="select-popup"
            role="listbox"
            aria-label={label}
            style={position}
            onPointerDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
          >
            {available.length ? (
              available.map((option, index) => (
                <div
                  key={option.value}
                  id={`${id}-${index}`}
                  role="option"
                  aria-selected={option.value === value}
                  aria-disabled={option.disabled || undefined}
                  data-index={index}
                  className={`select-option${active === index ? ' highlighted' : ''}`}
                  onPointerMove={() => !option.disabled && setActive(index)}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    if (!option.disabled) commit(option.value);
                  }}
                >
                  <span>{option.label}</span>
                  {option.value === value && <Check size={14} aria-hidden="true" />}
                </div>
              ))
            ) : (
              <div className="select-empty">{t('No matching options')}</div>
            )}
          </div>,
          document.body,
        )}
    </span>
  );
}

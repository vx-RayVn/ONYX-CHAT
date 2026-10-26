/**
 * Popover with a search field and a list of options – for picking roles or
 * members (permission editor, server badges). Works with mouse, touch and
 * keyboard (arrow keys + Enter).
 */
import { useMemo, useState, type ReactNode } from 'react';
import { Popover } from 'radix-ui';
import { Check, Search } from 'lucide-react';
import { cn } from '../../lib/utils';
import { t } from '../../i18n';

export interface PickerOption {
  id: string;
  label: string;
  icon?: ReactNode;
  hint?: string;
  group?: string;
  checked?: boolean;
}

interface Props {
  trigger: ReactNode;
  options: PickerOption[];
  onSelect: (id: string) => void;
  /** Keep the popover open after a selection (toggle lists). */
  multi?: boolean;
  placeholder?: string;
  empty?: string;
  align?: 'start' | 'center' | 'end';
}

export function SearchPicker({ trigger, options, onSelect, multi, placeholder, empty, align = 'start' }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (q ? options.filter((o) => o.label.toLowerCase().includes(q) || o.hint?.toLowerCase().includes(q)) : options).slice(0, 60);
  }, [options, query]);

  const pick = (id: string) => {
    onSelect(id);
    if (!multi) setOpen(false);
  };

  return (
    <Popover.Root
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (v) {
          setQuery('');
          setCursor(0);
        }
      }}
    >
      <Popover.Trigger asChild>{trigger}</Popover.Trigger>
      <Popover.Portal>
        <Popover.Content className="popover search-picker" align={align} sideOffset={6} collisionPadding={12}>
          <label className="search-picker-input">
            <Search size={15} />
            <input
              autoFocus
              value={query}
              placeholder={placeholder ?? t('Search')}
              aria-label={placeholder ?? t('Search')}
              onChange={(e) => {
                setQuery(e.target.value);
                setCursor(0);
              }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setCursor((c) => Math.min(list.length - 1, c + 1));
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setCursor((c) => Math.max(0, c - 1));
                } else if (e.key === 'Enter' && list[cursor]) {
                  e.preventDefault();
                  pick(list[cursor].id);
                }
              }}
            />
          </label>
          <div className="search-picker-list" role="listbox" aria-multiselectable={multi || undefined}>
            {list.length === 0 && <div className="search-picker-empty">{empty ?? t('No results')}</div>}
            {list.map((o, i) => {
              const showGroup = o.group && o.group !== list[i - 1]?.group;
              return (
                <div key={o.id}>
                  {showGroup && <div className="search-picker-group">{o.group}</div>}
                  <button
                    type="button"
                    role="option"
                    aria-selected={multi ? !!o.checked : i === cursor}
                    className={cn('search-picker-item', i === cursor && 'is-cursor')}
                    onMouseEnter={() => setCursor(i)}
                    onClick={() => pick(o.id)}
                  >
                    {o.icon}
                    <span className="grow truncate">{o.label}</span>
                    {o.hint && <span className="search-picker-hint truncate">{o.hint}</span>}
                    {multi && <span className={cn('search-picker-check', o.checked && 'is-on')}>{o.checked && <Check size={12} strokeWidth={3} />}</span>}
                  </button>
                </div>
              );
            })}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

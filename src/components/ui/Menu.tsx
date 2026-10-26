/**
 * Menus are described as data (`MenuSpec`) and rendered either as a dropdown
 * or as a right-click context menu, so both always look and behave the same.
 */
import type { ReactElement, ReactNode } from 'react';
import { ContextMenu as CM, DropdownMenu as DM } from 'radix-ui';
import { Check, ChevronRight } from 'lucide-react';
import { cn } from '../../lib/utils';

export type MenuEntry =
  | {
      type?: 'item';
      label: ReactNode;
      icon?: ReactNode;
      shortcut?: string;
      hint?: string;
      danger?: boolean;
      disabled?: boolean;
      onSelect: () => void;
    }
  | { type: 'check'; label: ReactNode; checked: boolean; color?: string; onSelect: () => void; keepOpen?: boolean }
  | { type: 'radio'; label: ReactNode; checked: boolean; icon?: ReactNode; hint?: string; onSelect: () => void }
  | { type: 'separator' }
  | { type: 'label'; label: ReactNode }
  | { type: 'sub'; label: ReactNode; icon?: ReactNode; items: MenuSpec }
  | { type: 'custom'; render: ReactNode };

export type MenuSpec = (MenuEntry | false | null | undefined)[];

type Kit = typeof DM | typeof CM;

function renderEntries(K: Kit, items: MenuSpec): ReactNode {
  const list = items.filter(Boolean) as MenuEntry[];
  return list.map((e, i) => {
    switch (e.type) {
      case 'separator':
        return <K.Separator key={i} className="menu-sep" />;
      case 'label':
        return (
          <K.Label key={i} className="menu-label">
            {e.label}
          </K.Label>
        );
      case 'custom':
        return <div key={i}>{e.render}</div>;
      case 'check':
        return (
          <K.CheckboxItem
            key={i}
            className="menu-item"
            checked={e.checked}
            onSelect={(ev: Event) => {
              if (e.keepOpen) ev.preventDefault();
              e.onSelect();
            }}
          >
            {e.color && <span className="menu-color" style={{ background: e.color }} />}
            <span className="menu-item-label">{e.label}</span>
            <span className={cn('menu-check', e.checked && 'is-checked')}>{e.checked && <Check size={13} strokeWidth={3} />}</span>
          </K.CheckboxItem>
        );
      case 'radio':
        return (
          <K.Item key={i} role="menuitemradio" aria-checked={e.checked} className={cn('menu-item', 'menu-item-radio')} onSelect={() => e.onSelect()}>
            {e.icon && <span className="menu-icon menu-icon-left">{e.icon}</span>}
            <span className="menu-item-label">
              {e.label}
              {e.hint && <span className="menu-item-hint">{e.hint}</span>}
            </span>
            <span className={cn('menu-radio', e.checked && 'is-checked')} />
          </K.Item>
        );
      case 'sub':
        return (
          <K.Sub key={i}>
            <K.SubTrigger className="menu-item">
              {e.icon && <span className="menu-icon menu-icon-left">{e.icon}</span>}
              <span className="menu-item-label">{e.label}</span>
              <ChevronRight size={15} className="menu-chevron" />
            </K.SubTrigger>
            <K.Portal>
              <K.SubContent className="menu" sideOffset={6} alignOffset={-6} collisionPadding={8}>
                {renderEntries(K, e.items)}
              </K.SubContent>
            </K.Portal>
          </K.Sub>
        );
      default:
        return (
          <K.Item key={i} className={cn('menu-item', e.danger && 'is-danger')} disabled={e.disabled} onSelect={() => e.onSelect()}>
            <span className="menu-item-label">
              {e.label}
              {e.hint && <span className="menu-item-hint">{e.hint}</span>}
            </span>
            {e.shortcut && <span className="menu-shortcut">{e.shortcut}</span>}
            {e.icon && <span className="menu-icon">{e.icon}</span>}
          </K.Item>
        );
    }
  });
}

interface DropdownProps {
  trigger: ReactElement;
  items: MenuSpec;
  side?: 'top' | 'bottom' | 'left' | 'right';
  align?: 'start' | 'center' | 'end';
  sideOffset?: number;
  className?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  header?: ReactNode;
}

export function Dropdown({ trigger, items, side = 'bottom', align = 'start', sideOffset = 6, className, open, onOpenChange, header }: DropdownProps) {
  return (
    <DM.Root open={open} onOpenChange={onOpenChange} modal={false}>
      <DM.Trigger asChild>{trigger}</DM.Trigger>
      <DM.Portal>
        <DM.Content side={side} align={align} sideOffset={sideOffset} collisionPadding={8} className={cn('menu', className)}>
          {header}
          {renderEntries(DM, items)}
        </DM.Content>
      </DM.Portal>
    </DM.Root>
  );
}

interface ContextProps {
  items: MenuSpec | (() => MenuSpec);
  children: ReactElement;
  disabled?: boolean;
  onOpenChange?: (open: boolean) => void;
}

/** Only evaluates the menu spec once the menu is actually open. */
function LazyEntries({ items }: { items: MenuSpec | (() => MenuSpec) }) {
  return <>{renderEntries(CM, typeof items === 'function' ? items() : items)}</>;
}

export function ContextMenu({ items, children, disabled, onOpenChange }: ContextProps) {
  if (disabled) return children;
  return (
    <CM.Root modal={false} onOpenChange={onOpenChange}>
      <CM.Trigger asChild>{children}</CM.Trigger>
      <CM.Portal>
        <CM.Content className="menu" collisionPadding={8}>
          <LazyEntries items={items} />
        </CM.Content>
      </CM.Portal>
    </CM.Root>
  );
}

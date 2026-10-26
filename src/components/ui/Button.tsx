import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '../../lib/utils';
import { Tooltip } from './Tooltip';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'danger-ghost' | 'link' | 'outline';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
  iconRight?: ReactNode;
  block?: boolean;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', icon, iconRight, block, loading, className, children, type = 'button', disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn('btn', `btn-${variant}`, `btn-${size}`, block && 'btn-block', loading && 'is-loading', className)}
      disabled={disabled || loading}
      {...rest}
    >
      {loading && <span className="btn-spinner" aria-hidden />}
      {icon && <span className="btn-icon">{icon}</span>}
      {children && <span className="btn-label">{children}</span>}
      {iconRight && <span className="btn-icon">{iconRight}</span>}
    </button>
  );
});

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  tooltip?: ReactNode | false;
  tooltipSide?: 'top' | 'bottom' | 'left' | 'right';
  active?: boolean;
  danger?: boolean;
  size?: 'sm' | 'md' | 'lg';
  shortcut?: string;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, tooltip, tooltipSide = 'top', active, danger, size = 'md', shortcut, className, children, type = 'button', ...rest },
  ref,
) {
  const btn = (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      aria-pressed={active === undefined ? undefined : active}
      className={cn('icon-btn', `icon-btn-${size}`, active && 'is-active', danger && 'is-danger', className)}
      {...rest}
    >
      {children}
    </button>
  );
  if (tooltip === false) return btn;
  return (
    <Tooltip
      side={tooltipSide}
      content={
        shortcut ? (
          <span className="tooltip-with-kbd">
            {tooltip ?? label}
            <kbd className="kbd kbd-sm">{shortcut}</kbd>
          </span>
        ) : (
          tooltip ?? label
        )
      }
    >
      {btn}
    </Tooltip>
  );
});

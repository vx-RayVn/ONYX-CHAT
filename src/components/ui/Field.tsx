import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react';
import { Switch as RSwitch, Slider as RSlider } from 'radix-ui';
import { cn } from '../../lib/utils';

interface FieldWrapProps {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  counter?: { value: number; max: number };
  children: ReactNode;
  htmlFor?: string;
  className?: string;
}

export function FieldWrap({ label, hint, error, counter, children, htmlFor, className }: FieldWrapProps) {
  return (
    <div className={cn('field', error && 'has-error', className)}>
      {(label || counter) && (
        <div className="field-top">
          {label && (
            <label className="field-label" htmlFor={htmlFor}>
              {label}
            </label>
          )}
          {counter && (
            <span className={cn('field-counter', counter.value > counter.max * 0.9 && 'is-near')}>
              {counter.value}/{counter.max}
            </span>
          )}
        </div>
      )}
      {children}
      {error ? <div className="field-error">{error}</div> : hint ? <div className="field-hint">{hint}</div> : null}
    </div>
  );
}

export interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'prefix'> {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  prefix?: ReactNode;
  suffix?: ReactNode;
  showCounter?: boolean;
  wrapClassName?: string;
}

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, hint, error, prefix, suffix, showCounter, wrapClassName, className, id, maxLength, value, ...rest },
  ref,
) {
  const autoId = useId();
  const fid = id ?? autoId;
  return (
    <FieldWrap
      label={label}
      hint={hint}
      error={error}
      htmlFor={fid}
      className={wrapClassName}
      counter={showCounter && maxLength ? { value: String(value ?? '').length, max: maxLength } : undefined}
    >
      <div className={cn('input-wrap', prefix && 'has-prefix', suffix && 'has-suffix')}>
        {prefix && <span className="input-prefix">{prefix}</span>}
        <input ref={ref} id={fid} className={cn('input', className)} maxLength={maxLength} value={value} {...rest} />
        {suffix && <span className="input-suffix">{suffix}</span>}
      </div>
    </FieldWrap>
  );
});

interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  showCounter?: boolean;
}

export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(function TextArea({ label, hint, error, showCounter, className, id, maxLength, value, ...rest }, ref) {
  const autoId = useId();
  const fid = id ?? autoId;
  return (
    <FieldWrap label={label} hint={hint} error={error} htmlFor={fid} counter={showCounter && maxLength ? { value: String(value ?? '').length, max: maxLength } : undefined}>
      <textarea ref={ref} id={fid} className={cn('input', 'textarea', className)} maxLength={maxLength} value={value} {...rest} />
    </FieldWrap>
  );
});

interface SwitchProps {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  label?: string;
  id?: string;
}

export function Switch({ checked, onChange, disabled, label, id }: SwitchProps) {
  return (
    <RSwitch.Root className="switch" checked={checked} onCheckedChange={onChange} disabled={disabled} aria-label={label} id={id}>
      <RSwitch.Thumb className="switch-thumb" />
    </RSwitch.Root>
  );
}

interface SettingRowProps {
  title: ReactNode;
  description?: ReactNode;
  control: ReactNode;
  tag?: ReactNode;
  disabled?: boolean;
}

/** A labelled setting with a control on the right. */
export function SettingRow({ title, description, control, tag, disabled }: SettingRowProps) {
  return (
    <div className={cn('setting-row', disabled && 'is-disabled')}>
      <div className="setting-row-text">
        <div className="setting-row-title">
          {title}
          {tag}
        </div>
        {description && <div className="setting-row-desc">{description}</div>}
      </div>
      <div className="setting-row-control">{control}</div>
    </div>
  );
}

interface SliderProps {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  marks?: { value: number; label: string }[];
  label?: string;
  format?: (v: number) => string;
}

export function Slider({ value, min, max, step = 1, onChange, marks, label, format }: SliderProps) {
  return (
    <div className="slider-wrap">
      <RSlider.Root className="slider" value={[value]} min={min} max={max} step={step} onValueChange={(v) => onChange(v[0])} aria-label={label}>
        <RSlider.Track className="slider-track">
          <RSlider.Range className="slider-range" />
        </RSlider.Track>
        <RSlider.Thumb className="slider-thumb" aria-label={label}>
          {format && <span className="slider-value">{format(value)}</span>}
        </RSlider.Thumb>
      </RSlider.Root>
      {marks && (
        <div className="slider-marks">
          {marks.map((m) => (
            <button
              type="button"
              key={m.value}
              className={cn('slider-mark', m.value === value && 'is-active')}
              style={{ left: `${((m.value - min) / (max - min)) * 100}%` }}
              onClick={() => onChange(m.value)}
            >
              {m.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

interface SegmentedProps<T extends string> {
  value: T;
  options: { value: T; label: ReactNode; icon?: ReactNode }[];
  onChange: (v: T) => void;
  size?: 'sm' | 'md';
  label?: string;
}

export function Segmented<T extends string>({ value, options, onChange, size = 'md', label }: SegmentedProps<T>) {
  return (
    <div className={cn('segmented', `segmented-${size}`)} role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          type="button"
          role="radio"
          aria-checked={o.value === value}
          key={o.value}
          className={cn('segmented-item', o.value === value && 'is-active')}
          onClick={() => onChange(o.value)}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  );
}

interface RadioCardProps {
  checked: boolean;
  onSelect: () => void;
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
}

export function RadioCard({ checked, onSelect, title, description, icon }: RadioCardProps) {
  return (
    <button type="button" role="radio" aria-checked={checked} className={cn('radio-card', checked && 'is-checked')} onClick={onSelect}>
      {icon && <span className="radio-card-icon">{icon}</span>}
      <span className="radio-card-text">
        <span className="radio-card-title">{title}</span>
        {description && <span className="radio-card-desc">{description}</span>}
      </span>
      <span className="radio-dot" />
    </button>
  );
}

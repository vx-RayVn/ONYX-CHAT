/**
 * ONYX colour picker: saturation/brightness field, hue slider, hex input and
 * preset swatches in a popover. Works with mouse, touch (pointer events) and
 * keyboard (arrow keys, Shift for bigger steps). While dragging, `onDraft`
 * reports the colour for live previews; `onChange` commits it.
 */
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactElement } from 'react';
import { Popover } from 'radix-ui';
import { Pipette } from 'lucide-react';
import { cn } from '../../lib/utils';
import { t } from '../../i18n';

/* ---- colour maths ---------------------------------------------------- */

interface HSV {
  h: number; // 0–360
  s: number; // 0–1
  v: number; // 0–1
}

const clamp = (n: number, a = 0, b = 1) => Math.min(b, Math.max(a, n));

export function normalizeHex(input: string): string | null {
  const m = input.trim().replace(/^#/, '').toLowerCase();
  if (/^[0-9a-f]{3}$/.test(m))
    return `#${m
      .split('')
      .map((c) => c + c)
      .join('')}`;
  if (/^[0-9a-f]{6}$/.test(m)) return `#${m}`;
  return null;
}

function hexToHsv(hex: string): HSV {
  const n = normalizeHex(hex) ?? '#10b981';
  const r = parseInt(n.slice(1, 3), 16) / 255;
  const g = parseInt(n.slice(3, 5), 16) / 255;
  const b = parseInt(n.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max ? d / max : 0, v: max };
}

function hsvToHex({ h, s, v }: HSV): string {
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  const to = (x: number) =>
    Math.round(x * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${to(f(5))}${to(f(3))}${to(f(1))}`;
}

/* ---- drag helper ---------------------------------------------------- */

function useDrag(onMove: (x: number, y: number) => void, onEnd: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  const handle = (e: ReactPointerEvent | PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    onMove(clamp((e.clientX - r.left) / r.width), clamp((e.clientY - r.top) / r.height));
  };
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    ref.current?.setPointerCapture(e.pointerId);
    ref.current?.focus();
    handle(e);
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (ref.current?.hasPointerCapture(e.pointerId)) handle(e);
  };
  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (ref.current?.hasPointerCapture(e.pointerId)) {
      ref.current.releasePointerCapture(e.pointerId);
      onEnd();
    }
  };
  return {
    ref,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel: onPointerUp,
  };
}

/* ---- panel ---------------------------------------------------------- */

interface PanelProps {
  value: string;
  onChange: (hex: string) => void;
  onDraft?: (hex: string | null) => void;
  presets?: string[];
}

export function ColorPanel({ value, onChange, onDraft, presets }: PanelProps) {
  const [hsv, setHsv] = useState<HSV>(() => hexToHsv(value));
  const [hexText, setHexText] = useState(normalizeHex(value) ?? value);
  const hsvRef = useRef(hsv);
  hsvRef.current = hsv;

  // Follow outside changes (e.g. a preset applied elsewhere).
  useEffect(() => {
    const n = normalizeHex(value);
    if (n && n !== hsvToHex(hsvRef.current)) {
      setHsv(hexToHsv(n));
      setHexText(n);
    }
  }, [value]);

  const draft = (next: HSV) => {
    setHsv(next);
    const hex = hsvToHex(next);
    setHexText(hex);
    onDraft?.(hex);
  };
  const commit = (next = hsvRef.current) => {
    onChange(hsvToHex(next));
    onDraft?.(null);
  };

  const field = useDrag(
    (x, y) => draft({ ...hsvRef.current, s: x, v: 1 - y }),
    () => commit(),
  );
  const hue = useDrag(
    (x) => draft({ ...hsvRef.current, h: x * 360 }),
    () => commit(),
  );

  const keyStep = (e: KeyboardEvent, apply: (d: number, axis: 'x' | 'y') => HSV) => {
    const step = e.shiftKey ? 0.1 : 0.02;
    const map: Record<string, [number, 'x' | 'y']> = {
      ArrowRight: [step, 'x'],
      ArrowLeft: [-step, 'x'],
      ArrowUp: [step, 'y'],
      ArrowDown: [-step, 'y'],
    };
    const hit = map[e.key];
    if (!hit) return;
    e.preventDefault();
    const next = apply(hit[0], hit[1]);
    setHsv(next);
    setHexText(hsvToHex(next));
    commit(next);
  };

  const pure = hsvToHex({ h: hsv.h, s: 1, v: 1 });
  const current = hsvToHex(hsv);
  const canPick = typeof window !== 'undefined' && 'EyeDropper' in window;

  return (
    <div className="cp">
      <div
        {...field}
        className="cp-field"
        style={{ background: pure }}
        role="slider"
        tabIndex={0}
        aria-label={t('Saturation and brightness')}
        aria-valuetext={current}
        onKeyDown={(e) => keyStep(e, (d, axis) => (axis === 'x' ? { ...hsv, s: clamp(hsv.s + d) } : { ...hsv, v: clamp(hsv.v + d) }))}
      >
        <span
          className="cp-field-thumb"
          style={{
            left: `${hsv.s * 100}%`,
            top: `${(1 - hsv.v) * 100}%`,
            background: current,
          }}
        />
      </div>
      <div
        {...hue}
        className="cp-hue"
        role="slider"
        tabIndex={0}
        aria-label={t('Hue')}
        aria-valuemin={0}
        aria-valuemax={360}
        aria-valuenow={Math.round(hsv.h)}
        onKeyDown={(e) => keyStep(e, (d) => ({ ...hsv, h: (hsv.h + d * 360 + 360) % 360 }))}
      >
        <span className="cp-hue-thumb" style={{ left: `${(hsv.h / 360) * 100}%`, background: pure }} />
      </div>
      <div className="cp-row">
        <span className="cp-preview" style={{ background: current }} />
        <label className="cp-hex">
          <span>#</span>
          <input
            value={hexText.replace(/^#/, '')}
            maxLength={7}
            spellCheck={false}
            aria-label={t('Hex color')}
            onChange={(e) => {
              setHexText(e.target.value);
              const n = normalizeHex(e.target.value);
              if (n) {
                setHsv(hexToHsv(n));
                onDraft?.(n);
              }
            }}
            onBlur={() => {
              const n = normalizeHex(hexText);
              if (n) {
                onChange(n);
                onDraft?.(null);
              } else setHexText(current);
            }}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          />
        </label>
        {canPick && (
          <button
            type="button"
            className="icon-btn cp-pick"
            aria-label={t('Pick a color from the screen')}
            onClick={async () => {
              try {
                const res = await new (
                  window as unknown as {
                    EyeDropper: new () => {
                      open: () => Promise<{ sRGBHex: string }>;
                    };
                  }
                ).EyeDropper().open();
                const n = normalizeHex(res.sRGBHex);
                if (n) {
                  setHsv(hexToHsv(n));
                  setHexText(n);
                  onChange(n);
                }
              } catch {
                /* cancelled */
              }
            }}
          >
            <Pipette />
          </button>
        )}
      </div>
      {presets && presets.length > 0 && (
        <div className="cp-presets">
          {presets.map((c) => (
            <button
              key={c}
              type="button"
              className={cn('cp-swatch', normalizeHex(c) === current && 'is-active')}
              style={{ background: c }}
              aria-label={c}
              onClick={() => {
                const n = normalizeHex(c)!;
                setHsv(hexToHsv(n));
                setHexText(n);
                onChange(n);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ---- popover -------------------------------------------------------- */

interface PickerProps extends PanelProps {
  label: string;
  /** Custom trigger; defaults to a colour swatch button. */
  trigger?: ReactElement;
  className?: string;
  side?: 'top' | 'bottom' | 'left' | 'right';
}

export function ColorPicker({ value, onChange, onDraft, presets, label, trigger, className, side = 'bottom' }: PickerProps) {
  const [open, setOpen] = useState(false);
  return (
    <Popover.Root
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) onDraft?.(null);
      }}
    >
      <Popover.Trigger asChild>
        {trigger ?? (
          <button type="button" className={cn('cp-trigger', className)} style={{ ['--cp-color' as string]: value }} aria-label={label}>
            <span className="cp-trigger-swatch" />
          </button>
        )}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content className="popover cp-pop" side={side} align="start" sideOffset={8} collisionPadding={12} aria-label={label}>
          <div className="cp-title">{label}</div>
          <ColorPanel value={value} onChange={onChange} onDraft={onDraft} presets={presets} />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

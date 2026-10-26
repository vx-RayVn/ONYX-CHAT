import { useRef, useState, type PointerEvent } from 'react';
import { Move, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react';
import type { ImageCrop } from '../../types';
import { useStore } from '../../store/store';
import { useUI, toast } from '../../store/ui';
import { cn } from '../../lib/utils';
import { t } from '../../i18n';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { cropStyle } from '../ui/Avatar';

const DEFAULT_CROP: ImageCrop = { x: 50, y: 50, zoom: 1 };
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** Position and zoom an uploaded avatar or banner before it is applied. */
export function CropModal({ kind, src, poster, animated }: { kind: 'avatar' | 'banner'; src: string; poster?: string; animated?: boolean }) {
  const close = useUI((s) => s.closeModal);
  const updateMe = useStore((s) => s.updateMe);
  const [crop, setCrop] = useState<ImageCrop>(DEFAULT_CROP);
  const drag = useRef<{ x: number; y: number; start: ImageCrop } | null>(null);
  const frameRef = useRef<HTMLDivElement>(null);

  const onDown = (e: PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, start: crop };
  };
  const onMove = (e: PointerEvent) => {
    const d = drag.current;
    const el = frameRef.current;
    if (!d || !el) return;
    const r = el.getBoundingClientRect();
    // Dragging the image right reveals more of its left side.
    const dx = ((e.clientX - d.x) / r.width) * 100 / d.start.zoom;
    const dy = ((e.clientY - d.y) / r.height) * 100 / d.start.zoom;
    setCrop({ ...d.start, x: clamp(d.start.x - dx, 0, 100), y: clamp(d.start.y - dy, 0, 100) });
  };
  const onUp = () => {
    drag.current = null;
  };

  const apply = () => {
    const value = { kind: 'image' as const, src, poster, animated, crop };
    if (kind === 'avatar') updateMe({ avatar: value });
    else updateMe({ banner: value });
    close();
    toast({ title: kind === 'avatar' ? t('Avatar updated') : t('Banner updated') });
  };

  const display = poster && !animated ? poster : src;

  return (
    <Modal
      open
      onClose={close}
      size="md"
      title={kind === 'avatar' ? t('Adjust avatar') : t('Adjust banner')}
      description={t('Drag to move the image, use the slider to zoom.')}
      footer={
        <>
          <Button variant="ghost" icon={<RotateCcw />} onClick={() => setCrop(DEFAULT_CROP)}>
            {t('Reset')}
          </Button>
          <span className="spacer" />
          <Button variant="ghost" onClick={close}>
            {t('Cancel')}
          </Button>
          <Button onClick={apply}>{t('Apply')}</Button>
        </>
      }
    >
      <div className="crop-stage">
        <div
          ref={frameRef}
          className={cn('crop-frame', kind === 'avatar' ? 'is-avatar' : 'is-banner')}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          role="img"
          aria-label={t('Image preview')}
        >
          <img src={display} alt="" draggable={false} style={cropStyle(crop)} />
          <span className="crop-hint">
            <Move size={14} /> {t('Drag')}
          </span>
        </div>
      </div>
      <div className="crop-zoom">
        <ZoomOut size={16} />
        <input
          type="range"
          min={1}
          max={3}
          step={0.01}
          value={crop.zoom}
          onChange={(e) => setCrop({ ...crop, zoom: Number(e.target.value) })}
          aria-label={t('Zoom')}
        />
        <ZoomIn size={16} />
      </div>
      {animated && <p className="crop-note">{t('Animated GIFs keep their animation – the crop applies to every frame.')}</p>}
    </Modal>
  );
}

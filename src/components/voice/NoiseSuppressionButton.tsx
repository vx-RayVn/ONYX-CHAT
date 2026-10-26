import { AudioLines, Mic, ShieldCheck } from 'lucide-react';
import { useStore } from '../../store/store';
import { useVoice } from '../../voice/state';
import { t } from '../../i18n';
import { cn } from '../../lib/utils';
import { Dropdown } from '../ui/Menu';

/** Uses the same persisted settings and live microphone processing as Voice settings. */
export function NoiseSuppressionButton() {
  const enabled = useStore((s) => s.settings.noiseSuppression);
  const enhanced = useStore((s) => s.settings.enhancedNoiseSuppression);
  const filter = useVoice((s) => s.noiseFilter);
  const connected = useVoice((s) => s.status === 'connected');
  const select = (mode: 'off' | 'standard' | 'enhanced') =>
    useStore.setState((s) => {
      s.settings.noiseSuppression = mode !== 'off';
      s.settings.enhancedNoiseSuppression = mode === 'enhanced';
    });
  const status = !enabled
    ? t('Off')
    : !enhanced
      ? t('Standard noise suppression')
      : !connected
        ? t('Enhanced noise suppression (Krisp)')
        : filter === 'loading'
          ? t('Loading noise filter…')
          : filter === 'krisp'
            ? t('Krisp is active')
            : t('Krisp is unavailable here. Using browser audio processing.');
  return (
    <Dropdown
      side="top"
      align="center"
      className="noise-menu"
      trigger={
        <button className={cn('vbtn vbtn-noise', enabled && 'has-filter')} aria-label={t('Noise suppression')} title={t('Noise suppression')} aria-pressed={enabled}>
          <AudioLines />
          <span className="noise-indicator" aria-hidden="true" />
        </button>
      }
      header={
        <div className="noise-menu-status">
          <strong>{t('Noise suppression')}</strong>
          <p role="status">{status}</p>
        </div>
      }
      items={[
        { type: 'radio', label: t('Off'), checked: !enabled, icon: <Mic />, onSelect: () => select('off') },
        {
          type: 'radio',
          label: t('Standard noise suppression'),
          hint: t('Filters out keyboard noise and fans.'),
          checked: enabled && !enhanced,
          icon: <AudioLines />,
          onSelect: () => select('standard'),
        },
        {
          type: 'radio',
          label: t('Enhanced noise suppression (Krisp)'),
          hint: t('Optional LiveKit Cloud filter. Downloads its model when enabled; unsupported devices keep browser noise suppression.'),
          checked: enabled && enhanced,
          icon: <ShieldCheck />,
          onSelect: () => select('enhanced'),
        },
      ]}
    />
  );
}

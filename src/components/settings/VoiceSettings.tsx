/**
 * Settings › Voice & Video: real devices of this computer, volumes, a
 * microphone test with playback, push-to-talk, the browser's processing
 * (noise suppression, echo cancellation, automatic gain) and a camera
 * preview. All of it is stored on this device only.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Camera, Keyboard, Mic, MicOff, Volume2 } from 'lucide-react';
import type { Settings } from '../../types';
import { useStore } from '../../store/store';
import { cn } from '../../lib/utils';
import { t } from '../../i18n';
import { Button } from '../ui/Button';
import { Segmented, SettingRow, Slider, Switch } from '../ui/Field';
import { Kbd } from '../ui/misc';
import { Dropdown } from '../ui/Menu';
import { CLOUD } from '../../backend/config';
import { SettingsHeader, SettingsSection } from './SettingsLayout';
import { mediaNote, screenShareNote, support } from '../../voice/support';
import { keyLabel } from '../../voice/ptt';
import { toast } from '../../store/ui';
import { useVoice } from '../../voice/state';

function useSetting<K extends keyof Settings>(key: K): [Settings[K], (v: Settings[K]) => void] {
  const value = useStore((s) => s.settings[key]);
  const setSetting = useStore((s) => s.setSetting);
  return [value, (v) => setSetting(key, v)];
}

/** Devices of this computer; names only appear after the browser was allowed to use one. */
function useDevices() {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const refresh = () => {
    if (!support.media) return;
    void navigator.mediaDevices
      .enumerateDevices()
      .then(setDevices)
      .catch(() => {});
  };
  useEffect(() => {
    refresh();
    if (!support.media) return;
    navigator.mediaDevices.addEventListener('devicechange', refresh);
    return () => navigator.mediaDevices.removeEventListener('devicechange', refresh);
  }, []);
  return { devices, refresh };
}

function DevicePicker({ kind, value, onChange, icon, devices }: { kind: MediaDeviceKind; value: string; onChange: (id: string) => void; icon: ReactNode; devices: MediaDeviceInfo[] }) {
  const [selected, setSelected] = useState<MediaDeviceInfo | null>(null);
  const media = navigator.mediaDevices as MediaDevices & { selectAudioOutput?: (options?: { deviceId?: string }) => Promise<MediaDeviceInfo> };
  const list = devices.filter((d) => d.kind === kind && d.deviceId && d.deviceId !== 'default' && d.deviceId !== 'communications');
  if (selected && !list.some((d) => d.deviceId === selected.deviceId)) list.push(selected);
  const chooseOutput = async () => {
    try { const d = await media.selectAudioOutput!({ deviceId: value === 'default' ? undefined : value }); setSelected(d); onChange(d.deviceId); }
    catch (e) { if ((e as DOMException).name !== 'NotAllowedError') toast({ tone: 'danger', title: t('Device couldn’t be switched'), body: t('The previous device stays active.') }); }
  };
  const label = (d: MediaDeviceInfo, i: number) => d.label || `${kind === 'videoinput' ? t('Camera') : kind === 'audioinput' ? t('Microphone') : t('Speaker')} ${i + 1}`;
  const current = list.findIndex((d) => d.deviceId === value);
  const missing = value !== 'default' && current < 0;
  return (
    <Dropdown
      align="start"
      items={[
        { type: 'radio' as const, label: t('Default'), checked: value === 'default' || missing, onSelect: () => onChange('default') },
        ...list.map((d, i) => ({ type: 'radio' as const, label: label(d, i), checked: d.deviceId === value, onSelect: () => onChange(d.deviceId) })),
        ...(kind === 'audiooutput' && media?.selectAudioOutput ? [{ label: t('Choose speaker…'), onSelect: () => void chooseOutput() }] : []),
      ]}
      trigger={
        <button className="select-btn">
          {icon} <span className="grow truncate">{current >= 0 ? label(list[current], current) : t('Default')}</span>
        </button>
      }
    />
  );
}

/** Level meter of the selected microphone, optionally played back so you hear yourself. */
function MicTest() {
  const s = useStore((x) => x.settings);
  const [state, setState] = useState<'idle' | 'running' | 'denied'>('idle');
  const [level, setLevel] = useState(0);
  const [hear, setHear] = useState(false);
  const cleanup = useRef<() => void>(() => {});
  const audio = useRef<HTMLAudioElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const capture = useRef(0);

  useEffect(() => () => { capture.current++; cleanup.current(); }, []);
  useEffect(() => {
    const el = audio.current as (HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> }) | null;
    if (!el) return;
    el.srcObject = hear ? streamRef.current : null;
    if (hear) {
      if (s.outputDevice !== 'default') void el.setSinkId?.(s.outputDevice).catch(() => {});
      void el.play().catch(() => {});
    }
  }, [hear, state, s.outputDevice]);

  const start = async () => {
    const operation = ++capture.current;
    cleanup.current();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: s.inputDevice !== 'default' ? { exact: s.inputDevice } : undefined,
          noiseSuppression: s.noiseSuppression,
          echoCancellation: s.echoCancellation,
          autoGainControl: s.autoGainControl,
        },
      });
      if (operation !== capture.current) { stream.getTracks().forEach((tr) => tr.stop()); return; }
      streamRef.current = stream;
      const ctx = new AudioContext();
      const src = ctx.createMediaStreamSource(stream);
      const gain = ctx.createGain();
      gain.gain.value = s.micGain / 100;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      src.connect(gain).connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      let raf = 0;
      const loop = () => {
        analyser.getByteTimeDomainData(data);
        let peak = 0;
        for (const v of data) peak = Math.max(peak, Math.abs(v - 128));
        setLevel(Math.min(1, peak / 64));
        raf = requestAnimationFrame(loop);
      };
      loop();
      cleanup.current = () => {
        cleanup.current = () => {};
        cancelAnimationFrame(raf);
        stream.getTracks().forEach((tr) => tr.stop());
        streamRef.current = null;
        void ctx.close().catch(() => {});
        setLevel(0);
        if (audio.current) audio.current.srcObject = null;
      };
      setState('running');
    } catch {
      if (operation === capture.current) setState('denied');
    }
  };

  const stop = () => {
    capture.current++;
    cleanup.current();
    setHear(false);
    setState('idle');
  };

  return (
    <div className="mic-test">
      <div className="mic-test-row">
        <Button variant={state === 'running' ? 'secondary' : 'primary'} icon={state === 'running' ? <MicOff /> : <Mic />} onClick={state === 'running' ? stop : () => void start()}>
          {state === 'running' ? t('Stop test') : t('Test microphone')}
        </Button>
        {state === 'running' && (
          <label className="mic-test-hear">
            <Switch checked={hear} onChange={setHear} label={t('Hear myself')} />
            {t('Hear myself')}
          </label>
        )}
      </div>
      <div className="meter" aria-label={t('Input level')}>
        {Array.from({ length: 32 }, (_, i) => (
          <span key={i} className={cn('meter-bar', i / 32 < level && 'is-on')} />
        ))}
      </div>
      <audio ref={audio} hidden />
      {state === 'denied' && <p className="field-error">{t('No access to the microphone. Allow access in your browser to see the level.')}</p>}
      {state === 'running' && (
        <p className="field-hint">{hear ? t('Use headphones, otherwise you hear an echo.') : t('Local test – your microphone is only analysed here in the browser and never transmitted.')}</p>
      )}
    </div>
  );
}

function CameraPreview() {
  const device = useStore((s) => s.settings.videoDevice);
  const mirror = useStore((s) => s.settings.mirrorCamera);
  const [on, setOn] = useState(false);
  const [error, setError] = useState(false);
  const video = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!on) return;
    let stream: MediaStream | null = null;
    let alive = true;
    setError(false);
    navigator.mediaDevices
      .getUserMedia({ video: { deviceId: device !== 'default' ? { exact: device } : undefined, width: 1280, height: 720 } })
      .then((s) => {
        if (!alive) return s.getTracks().forEach((tr) => tr.stop());
        stream = s;
        if (video.current) video.current.srcObject = s;
      })
      .catch(() => {
        if (!alive) return;
        setError(true);
        setOn(false);
      });
    return () => {
      alive = false;
      stream?.getTracks().forEach((tr) => tr.stop());
    };
  }, [on, device]);

  return (
    <div className="camera-preview">
      <div className={cn('camera-preview-box', !on && 'is-off')}>{on ? <video ref={video} autoPlay playsInline muted className={cn('vvideo', mirror && 'is-mirrored')} /> : <Camera size={32} />}</div>
      <Button variant={on ? 'secondary' : 'primary'} icon={<Camera />} onClick={() => setOn(!on)}>
        {on ? t('Stop preview') : t('Test camera')}
      </Button>
      {error && <p className="field-error">{t('No access to the camera. Allow access in your browser and try again.')}</p>}
    </div>
  );
}

function PttKey() {
  const [key, setKey] = useSetting('pttKey');
  const [recording, setRecording] = useState(false);
  useEffect(() => {
    if (!recording) return;
    const on = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.code !== 'Escape') setKey(e.code);
      setRecording(false);
    };
    window.addEventListener('keydown', on, true);
    return () => window.removeEventListener('keydown', on, true);
  }, [recording]);
  return (
    <Button variant="secondary" icon={<Keyboard />} onClick={() => setRecording(true)} className={cn(recording && 'is-recording')}>
      {recording ? t('Press a key … (Esc cancels)') : key ? <Kbd>{keyLabel(key)}</Kbd> : t('Set key')}
    </Button>
  );
}

export function VoiceSettings() {
  const [input, setInput] = useSetting('inputDevice');
  const [output, setOutput] = useSetting('outputDevice');
  const [camera, setCamera] = useSetting('videoDevice');
  const [gain, setGain] = useSetting('micGain');
  const [outVol, setOutVol] = useSetting('outputVolume');
  const [noise, setNoise] = useSetting('noiseSuppression');
  const [enhanced, setEnhanced] = useSetting('enhancedNoiseSuppression');
  const noiseFilter = useVoice((v) => v.noiseFilter);
  const connected = useVoice((v) => v.status !== 'idle');
  const [echo, setEcho] = useSetting('echoCancellation');
  const [agc, setAgc] = useSetting('autoGainControl');
  const [mode, setMode] = useSetting('inputMode');
  const [pttKey] = useSetting('pttKey');
  const [delay, setDelay] = useSetting('pttDelay');
  const [sounds, setSounds] = useSetting('voiceSounds');
  const [mirror, setMirror] = useSetting('mirrorCamera');
  const { devices, refresh } = useDevices();
  const named = devices.some((d) => d.label);
  const maxOut = support.volumeBoost ? 200 : 100;
  const blocked = mediaNote();
  const screenNote = screenShareNote();

  const allowNames = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((tr) => tr.stop());
    } catch {
      // denied – the list keeps the generic names
    }
    refresh();
  };

  return (
    <>
      <SettingsHeader
        title={t('Voice & Video')}
        description={
          CLOUD
            ? t('Devices and sound for voice channels and calls. Stored on this device.')
            : t('Demo: you can test your devices here and preview them locally in voice channels – nothing is transmitted.')
        }
      />
      {blocked && <p className="settings-warn">{blocked}</p>}
      <SettingsSection title={t('Devices')}>
        {!named && support.media && (
          <p className="field-hint voice-settings-hint">
            {t('Device names appear once the browser may use the microphone.')}{' '}
            <button className="link-btn" onClick={() => void allowNames()}>
              {t('Allow')}
            </button>
          </p>
        )}
        <div className="device-grid">
          <div className="field">
            <span className="field-label">{t('Input device')}</span>
            <DevicePicker kind="audioinput" value={input} onChange={setInput} icon={<Mic size={16} />} devices={devices} />
          </div>
          <div className="field">
            <span className="field-label">{t('Output device')}</span>
            {support.outputSelection ? (
              <DevicePicker kind="audiooutput" value={output} onChange={setOutput} icon={<Volume2 size={16} />} devices={devices} />
            ) : (
              <p className="field-hint">{t('This browser always plays sound on the system’s default output.')}</p>
            )}
          </div>
        </div>
        <div className="device-grid">
          <div className="field">
            <span className="field-label">
              {t('Input volume')} · {gain} %
            </span>
            <Slider value={gain} min={0} max={200} step={5} onChange={setGain} label={t('Input volume')} format={(v) => `${v} %`} />
          </div>
          <div className="field">
            <span className="field-label">
              {t('Output volume')} · {Math.min(outVol, maxOut)} %
            </span>
            <Slider value={Math.min(outVol, maxOut)} min={0} max={maxOut} step={5} onChange={setOutVol} label={t('Output volume')} format={(v) => `${v} %`} />
          </div>
        </div>
      </SettingsSection>
      <SettingsSection title={t('Microphone test')} description={t('Say something – the bar shows your input level.')}>
        <MicTest />
      </SettingsSection>
      <SettingsSection title={t('Input mode')}>
        <Segmented
          value={mode}
          onChange={setMode}
          label={t('Input mode')}
          options={[
            { value: 'voice', label: t('Voice activity') },
            { value: 'ptt', label: t('Push to talk') },
          ]}
        />
        {mode === 'ptt' && (
          <>
            <SettingRow
              title={t('Push-to-talk key')}
              description={t('Hold the key to speak. Works while ONYX is the active window – browsers don’t pass keys to tabs in the background.')}
              control={<PttKey />}
            />
            {!pttKey && <p className="settings-warn">{t('Choose a key – until then your microphone stays silent.')}</p>}
            <div className="field">
              <span className="field-label">
                {t('Release delay')} · {delay} ms
              </span>
              <Slider value={delay} min={0} max={1000} step={20} onChange={setDelay} label={t('Release delay')} format={(v) => `${v} ms`} />
            </div>
          </>
        )}
      </SettingsSection>
      <SettingsSection title={t('Processing')} description={t('Done by your browser before anything is sent.')}>
        <SettingRow title={t('Noise suppression')} description={t('Filters out keyboard noise and fans.')} control={<Switch checked={noise} onChange={setNoise} label={t('Noise suppression')} />} />
        <SettingRow title={t('Enhanced noise suppression (Krisp)')} description={t('Optional LiveKit Cloud filter. Downloads its model when enabled; unsupported devices keep browser noise suppression.')} control={<Switch checked={!!enhanced} onChange={setEnhanced} disabled={!noise} label={t('Enhanced noise suppression (Krisp)')} />} />
        {enhanced && noise && connected && <p className="field-hint" role="status">{noiseFilter === 'loading' ? t('Loading noise filter…') : noiseFilter === 'krisp' ? t('Krisp is active') : t('Krisp is unavailable here. Using browser audio processing.')}</p>}
        <SettingRow
          title={t('Echo cancellation')}
          description={t('Stops others from hearing themselves through your speakers.')}
          control={<Switch checked={echo} onChange={setEcho} label={t('Echo cancellation')} />}
        />
        <SettingRow
          title={t('Automatic gain control')}
          description={t('Evens out your volume when you move closer or further away.')}
          control={<Switch checked={agc} onChange={setAgc} label={t('Automatic gain control')} />}
        />
      </SettingsSection>
      <SettingsSection title={t('Video')}>
        <div className="field">
          <span className="field-label">{t('Camera')}</span>
          <DevicePicker kind="videoinput" value={camera} onChange={setCamera} icon={<Camera size={16} />} devices={devices} />
        </div>
        <CameraPreview />
        <SettingRow
          title={t('Mirror my camera')}
          description={t('Only for you – others always see you the right way round.')}
          control={<Switch checked={mirror} onChange={setMirror} label={t('Mirror my camera')} />}
        />
        {screenNote && <p className="field-hint">{screenNote}</p>}
      </SettingsSection>
      <SettingsSection title={t('Sounds')}>
        <SettingRow
          title={t('Voice sounds')}
          description={t('A short sound when people join or leave and when you mute or deafen. Calls always ring (volume: Notifications).')}
          control={<Switch checked={sounds} onChange={setSounds} label={t('Voice sounds')} />}
        />
      </SettingsSection>
    </>
  );
}

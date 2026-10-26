import { AlignJustify, Rows3, RotateCcw } from 'lucide-react';
import type { Settings } from '../../types';
import { useStore, DEFAULT_SETTINGS } from '../../store/store';
import { toast } from '../../store/ui';
import { cn, formatClock, modKey } from '../../lib/utils';
import { THEMES } from '../../data/themes';
import { t, tk } from '../../i18n';
import { Avatar } from '../ui/Avatar';
import { Button } from '../ui/Button';
import { RadioCard, Segmented, SettingRow, Slider, Switch } from '../ui/Field';
import { Kbd } from '../ui/misc';
import { MessageContent } from '../chat/MessageContent';
import { StyledName } from '../cosmetics/StyledName';
import { SettingsCard, SettingsHeader, SettingsSection } from './SettingsLayout';

function useSetting<K extends keyof Settings>(key: K): [Settings[K], (v: Settings[K]) => void] {
  const value = useStore((s) => s.settings[key]);
  const setSetting = useStore((s) => s.setSetting);
  return [value, (v) => setSetting(key, v)];
}

/* ---------------------------------------------------------------- */
/* Appearance                                                         */
/* ---------------------------------------------------------------- */

function ChatPreview() {
  const users = useStore((s) => s.users);
  const compact = useStore((s) => s.settings.density === 'compact');
  const meId = useStore((s) => s.meId);
  const me = users[meId];
  // Real accounts have no demo users. The preview must also work with only me.
  if (!me) return null;
  const other = users.u_nova ?? Object.values(users).find((u) => u.id !== meId && !u.bot) ?? me;
  const base = new Date();
  base.setHours(20, 14, 0, 0);
  const lines = [
    { u: other, ts: base.getTime(), text: t('See how the **font size** changes right here? 👀') },
    { u: other, ts: base.getTime(), text: t('And the spacing between messages too.'), grouped: true },
    { u: me, ts: base.getTime() + 60_000, text: t('Yes! Compact fits so much on the screen 🔥') },
  ];
  return (
    <div className="appearance-preview" aria-hidden>
      {lines.map((l, i) =>
        compact ? (
          <div key={i} className="msg msg-compact">
            <div className="msg-compact-row">
              <time className="msg-compact-time tnum">{formatClock(l.ts)}</time>
              <div className="msg-compact-main">
                <span className="msg-compact-head">
                  <span className="msg-author">
                    <StyledName style={l.u.nameStyle}>{l.u.displayName}</StyledName>
                  </span>
                </span>
                <div className="msg-content">
                  <MessageContent content={l.text} />
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div key={i} className={cn('msg', l.grouped && 'is-grouped')}>
            <div className="msg-gutter">{!l.grouped && <Avatar user={l.u} size={40} frame />}</div>
            <div className="msg-main">
              {!l.grouped && (
                <div className="msg-head">
                  <span className="msg-author">
                    <StyledName style={l.u.nameStyle}>{l.u.displayName}</StyledName>
                  </span>
                  <time className="msg-time">{t('Today at {time}', { time: formatClock(l.ts) })}</time>
                </div>
              )}
              <div className="msg-content">
                <MessageContent content={l.text} />
              </div>
            </div>
          </div>
        ),
      )}
    </div>
  );
}

function ThemeCard({ def, active, onSelect }: { def: (typeof THEMES)[number]; active: boolean; onSelect: () => void }) {
  const [app, side, main, accent] = def.swatch;
  return (
    <button className={cn('theme-card', active && 'is-active')} onClick={onSelect} role="radio" aria-checked={active} title={t(def.description)}>
      <span className="theme-mini" style={{ background: app }}>
        <span className="tm-rail" style={{ background: app }}>
          <span className="tm-dot" style={{ background: accent }} />
          <span className="tm-dot" />
        </span>
        <span className="tm-side" style={{ background: side }}>
          <span className="tm-line w2" />
          <span className="tm-line w3" />
          <span className="tm-line w1" />
        </span>
        <span className="tm-main" style={{ background: main }}>
          <span className="tm-line w1" />
          <span className="tm-line w2" style={{ background: accent }} />
          <span className="tm-line w3" />
        </span>
      </span>
      <span className="theme-card-label">
        <span className="radio-dot" />
        <span className="grow truncate">{t(def.name)}</span>
        {def.light && <span className="theme-tag">{t('Light')}</span>}
      </span>
    </button>
  );
}

export function AppearanceSettings() {
  const [theme, setTheme] = useSetting('theme');
  const [density, setDensity] = useSetting('density');
  const [scale, setScale] = useSetting('fontScale');
  const [gap, setGap] = useSetting('groupSpacing');
  const [roleColors, setRoleColors] = useSetting('showRoleColors');
  const [use24h, setUse24h] = useSetting('use24h');
  const [previews, setPreviews] = useSetting('showLinkPreviews');
  const setSetting = useStore((s) => s.setSetting);
  const px = Math.round(15 * scale);
  const isDefault = theme === 'graphite' && density === 'cozy' && scale === 1 && gap === 16;

  const reset = () => {
    setSetting('theme', DEFAULT_SETTINGS.theme);
    setSetting('density', DEFAULT_SETTINGS.density);
    setSetting('fontScale', DEFAULT_SETTINGS.fontScale);
    setSetting('groupSpacing', DEFAULT_SETTINGS.groupSpacing);
    toast({ title: t('Back to the ONYX default'), body: t('Graphite theme with emerald, cozy layout.') });
  };

  return (
    <>
      <SettingsHeader
        title={t('Appearance')}
        description={t('Everything on this page applies instantly and is saved locally.')}
        tag={
          !isDefault && (
            <Button size="sm" variant="secondary" icon={<RotateCcw />} onClick={reset} className="settings-head-action">
              {t('Reset to ONYX default')}
            </Button>
          )
        }
      />
      <ChatPreview />
      <SettingsSection title={t('Theme')} description={t('Changes the colors of the whole app.')}>
        <div className="theme-cards" role="radiogroup" aria-label={t('Theme')}>
          {THEMES.map((def) => (
            <ThemeCard key={def.id} def={def} active={theme === def.id} onSelect={() => setTheme(def.id)} />
          ))}
        </div>
      </SettingsSection>
      <SettingsSection title={t('Message density')}>
        <div role="radiogroup" aria-label={t('Message density')}>
          <RadioCard
            checked={density === 'cozy'}
            onSelect={() => setDensity('cozy')}
            icon={<Rows3 />}
            title={t('Cozy')}
            description={t('Avatars, names and airy spacing – great for reading along.')}
          />
          <RadioCard
            checked={density === 'compact'}
            onSelect={() => setDensity('compact')}
            icon={<AlignJustify />}
            title={t('Compact')}
            description={t('More messages at a glance, with the time before each line.')}
          />
        </div>
      </SettingsSection>
      <SettingsSection title={t('Chat font size · {size} px', { size: px })}>
        <Slider
          value={px}
          min={12}
          max={20}
          step={1}
          label={t('Font size')}
          onChange={(v) => setScale(Number((v / 15).toFixed(4)))}
          marks={[12, 14, 15, 16, 18, 20].map((v) => ({ value: v, label: `${v}` }))}
          format={(v) => `${v} px`}
        />
      </SettingsSection>
      <SettingsSection title={t('Space between message groups · {size} px', { size: gap })}>
        <Slider value={gap} min={0} max={24} step={2} label={t('Spacing')} onChange={setGap} marks={[0, 4, 8, 16, 24].map((v) => ({ value: v, label: `${v}` }))} format={(v) => `${v} px`} />
      </SettingsSection>
      <SettingsSection title={t('Chat')}>
        <SettingRow
          title={t('Show role colors in names')}
          description={t('Names appear in the color of their highest role (unless someone uses a name style).')}
          control={<Switch checked={roleColors} onChange={setRoleColors} label={t('Role colors')} />}
        />
        <SettingRow title={t('24-hour clock')} description={t('14:30 instead of 2:30 PM.')} control={<Switch checked={use24h} onChange={setUse24h} label={t('24-hour clock')} />} />
        <SettingRow
          title={t('Show link and bot previews')}
          description={t('Show or hide embeds below messages.')}
          control={<Switch checked={previews} onChange={setPreviews} label={t('Previews')} />}
        />
      </SettingsSection>
    </>
  );
}

/* ---------------------------------------------------------------- */
/* Accessibility                                                      */
/* ---------------------------------------------------------------- */

export function AccessibilitySettings() {
  const [motion, setMotion] = useSetting('motion');
  const [animate, setAnimate] = useSetting('animateMedia');
  const [contrast, setContrast] = useSetting('highContrast');
  const [underline, setUnderline] = useSetting('underlineLinks');
  const [enter, setEnter] = useSetting('sendWithEnter');
  return (
    <>
      <SettingsHeader title={t('Accessibility')} description={t('Adjust ONYX to your needs. Everything here applies instantly.')} />
      <SettingsSection title={t('Motion')}>
        <SettingRow
          title={t('Reduced motion')}
          description={t('Turns off transitions, hover animations and animated media, including decorations and the Border Line. “System” follows your OS setting.')}
          control={
            <Segmented
              value={motion}
              onChange={setMotion}
              label={t('Reduced motion')}
              options={[
                { value: 'system', label: t('System') },
                { value: 'reduced', label: t('On') },
                { value: 'full', label: t('Off') },
              ]}
            />
          }
        />
        <SettingRow
          title={t('Animated avatars, banners & decorations')}
          description={t('Always play animated profiles, or only when you hover over them.')}
          control={
            <Segmented
              value={animate}
              onChange={setAnimate}
              label={t('Animated media')}
              options={[
                { value: 'always', label: t('Always') },
                { value: 'hover', label: t('On hover') },
              ]}
            />
          }
        />
      </SettingsSection>
      <SettingsSection title={t('Readability')}>
        <SettingRow
          title={t('Increased contrast')}
          description={t('Brighter secondary text and clearer lines.')}
          control={<Switch checked={contrast} onChange={setContrast} label={t('Increased contrast')} />}
        />
        <SettingRow
          title={t('Always underline links')}
          description={t('Makes links recognizable without relying on color.')}
          control={<Switch checked={underline} onChange={setUnderline} label={t('Underline links')} />}
        />
      </SettingsSection>
      <SettingsSection title={t('Input')}>
        <SettingRow
          title={t('Send with Enter')}
          description={<>{t('When off, you send with {keys} and Enter creates a new line.', { keys: `${modKey()} + Enter` })}</>}
          control={<Switch checked={enter} onChange={setEnter} label={t('Send with Enter')} />}
        />
      </SettingsSection>
    </>
  );
}

/* Voice & video: real devices, tests and push-to-talk live in their own file. */
export { VoiceSettings } from './VoiceSettings';

export { NotificationSettings } from './NotificationSettings';

/* ---------------------------------------------------------------- */
/* Keybinds                                                           */
/* ---------------------------------------------------------------- */

const KEYBINDS: [string, string[]][] = [
  [tk('Open quick switcher'), ['MOD', 'K']],
  [tk('Open settings'), ['MOD', ',']],
  [tk('Previous / next channel'), ['Alt', '↑ / ↓']],
  [tk('Send message'), ['Enter']],
  [tk('New line'), ['Shift', 'Enter']],
  [tk('Edit your last message'), ['↑']],
  [tk('Cancel reply or edit'), ['Esc']],
  [tk('Accept suggestion'), ['Tab']],
  [tk('Delete message without confirmation'), ['Shift', tk('Click')]],
  [tk('Close dialog or settings'), ['Esc']],
];

export function KeybindSettings() {
  return (
    <>
      <SettingsHeader title={t('Keybinds')} description={t('These shortcuts already work in the local version.')} />
      <SettingsCard className="keybinds">
        {KEYBINDS.map(([label, keys]) => (
          <div key={label} className="keybind-row">
            <span>{t(label)}</span>
            <span className="keybind-keys">
              {keys.map((k, i) => (
                <Kbd key={i}>{k === 'MOD' ? modKey() : k === 'Shift' ? t('Shift') : t(k)}</Kbd>
              ))}
            </span>
          </div>
        ))}
      </SettingsCard>
    </>
  );
}

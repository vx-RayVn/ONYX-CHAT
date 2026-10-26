import {endGuestSession} from '../home/GuestHome';
import {ActivityVisibilitySwitch} from './ActivitySettings';
import {AccountSecurity} from './AccountSecurity';
import {BugsSettings} from './BugsSettings';
import { ConnectionsSettings } from './ConnectionsSettings';
import {DeveloperSettings} from './DeveloperSettings';
import { OfficialBadgesSettings, BadgeCatalogAdmin } from './CommunitySettings';
import { useEffect, useMemo, useState } from 'react';
import {
  Accessibility,
  Award,
  Bell,
  Bug,
  CircleUserRound,
  CircleCheck,
  CircleX,
  CircleAlert,
  Database,
  Download,
  History,
  HeartHandshake,
  Keyboard,
  Languages,
  Link2,
  LogOut,
  Mic,
  AudioLines,
  Trash,
  Palette,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  KeyRound,
} from 'lucide-react';
import type { Reward } from '../../types';
import { STORE_KEY, useStore, type RedeemResult } from '../../store/store';
import { CLOUD } from '../../backend/config';
import { authErrorText, sendPasswordReset, signOut, useAuth } from '../../backend/auth';
import { describeError } from '../../backend/queue';
import { toast, useUI, type UserSettingsSection } from '../../store/ui';
import { useMe } from '../../store/selectors';
import { BRAND } from '../../config/brand';
import { BADGE_BY_ID, formatMemberNumber } from '../../data/badges';

import { PROMO_CODES } from '../../data/codes';
import { formatBytes, formatFullDate, formatShortDate, cn } from '../../lib/utils';
import { audioUsage, clearAudio } from '../../lib/audio';
import { LANGUAGES, countryName, getLanguage, t, tn, type Lang } from '../../i18n';
import { Avatar } from '../ui/Avatar';
import { Banner } from '../ui/Banner';
import { Button } from '../ui/Button';
import { RadioCard, SettingRow, Switch, TextField } from '../ui/Field';
import { BadgeIcon, FreeTag, GemMark, RedeemIcon } from '../ui/icons';
import { PlusCheckIcon } from '../ui/PlusCheck';
import { PreviewTag, UserBadges } from '../ui/misc';
import { Flag } from '../ui/Flag';
import { Dropdown } from '../ui/Menu';
import { StyledName } from '../cosmetics/StyledName';
import { MemberIdentity, themeStyle } from '../profile/ProfileCard';
import { BackendTag, LocalTag, SettingsCard, SettingsHeader, SettingsLayout, SettingsSection, type NavGroup } from './SettingsLayout';
import { ProfileSettings } from './ProfileSettings';
import { AdminSettings } from './AdminSettings';
import { useAccount } from '../../backend/moderation';
import { AccessibilitySettings, AppearanceSettings, KeybindSettings, NotificationSettings, VoiceSettings } from './AppSettings';
import { CrystalArt, plusPrice } from '../home/PlusView';
import {useCaptcha} from '../auth/Captcha';
import { FEATURES } from '../../config/features';

/* ---------------------------------------------------------------- */
/* Account                                                            */
/* ---------------------------------------------------------------- */

function AccountSettings() {
  const captcha=useCaptcha();
  const [sendingReset,setSendingReset]=useState(false);
  const me = useMe();
  const email = useAuth((s) => s.email);
  const changePassword = async () => {
    if (!email||sendingReset) return;setSendingReset(true);
    try{const err = await sendPasswordReset(email,await captcha.verify('account_reset'));if(err)throw err;toast({ tone: 'success', title: t('Check your inbox'), body: t('We sent a link to {email}. Open it to choose a new password.', { email }) });}catch(error){toast({tone:'danger',title:t('Link not sent'),body:authErrorText(error as Error)});}finally{setSendingReset(false);}
  };
  const ui = useUI.getState();
  const update = useStore((s) => s.updateMe);
  const edit = (field: 'displayName' | 'username', title: string) =>
    ui.openModal({
      type: 'prompt',
      title,
      label: title,
      initial: me[field],
      maxLength: 32,
      confirmLabel: t('Save'),
      onSubmit: (v) => {
        const value =
          field === 'username'
            ? v
                .trim()
                .toLowerCase()
                .replace(/[^a-z0-9._]/g, '')
            : v.trim();
        if (value) update({ [field]: value });
      },
    });

  return (
    <>
      <SettingsHeader title={t('My Account')} />
      <div className={cn('account-card anim-host', me.profileColors?.length && 'is-themed')} style={themeStyle(me)}>
        <div className="account-banner">
          <Banner source={me.banner} color={me.profileColors?.[0] ?? me.avatarColor} />
        </div>
        <div className="account-body">
          <div className="account-head">
            <Avatar user={me} size={84} status={me.status} frame />
            <div className="account-names">
              <strong>
                <StyledName style={me.nameStyle}>{me.displayName}</StyledName>
              </strong>
              <span>{me.username}</span>
            </div>
            <UserBadges badges={me.badges} size={20} className="account-badges" />
            <Button onClick={() => ui.openSettings({ kind: 'user', section: 'profile' })}>{t('Edit profile')}</Button>
          </div>
          <div className="account-fields">
            <div className="account-field">
              <div>
                <span className="account-label">{t('Display name')}</span>
                <span className="account-value">{me.displayName}</span>
              </div>
              <Button variant="secondary" size="sm" onClick={() => edit('displayName', t('Display name'))}>
                {t('Edit')}
              </Button>
            </div>
            <div className="account-field">
              <div>
                <span className="account-label">{t('Username')}</span>
                <span className="account-value">{me.username}</span>
              </div>
              <Button variant="secondary" size="sm" onClick={() => edit('username', t('Username'))}>
                {t('Edit')}
              </Button>
            </div>
            <div className="account-field">
              <div>
                <span className="account-label">{t('Member number')}</span>
                <span className="account-value tnum">{me.memberNumber !== undefined ? formatMemberNumber(me.memberNumber) : '—'}</span>
              </div>
              <MemberIdentity user={me} forceCountry />
            </div>
            <div className="account-field">
              <div>
                <span className="account-label">
                  {t('Email')} {!CLOUD && <PreviewTag>{t('With sign-in')}</PreviewTag>}
                </span>
                {CLOUD ? <span className="account-value">{email ?? '—'}</span> : <span className="account-value muted">{t('Not linked yet')}</span>}
              </div>
              {!CLOUD && (
                <Button variant="secondary" size="sm" disabled>
                  {t('Add')}
                </Button>
              )}
            </div>
            <div className="account-field">
              <div>
                <span className="account-label">{t('On ONYX since')}</span>
                <span className="account-value">{formatFullDate(me.createdAt)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <SettingsSection
        title={t('Password & authentication')}
        tag={CLOUD ? undefined : <PreviewTag>{t('With sign-in')}</PreviewTag>}
        description={
          CLOUD
            ? t('To change your password we email you a secure link.')
            : t('Once real accounts are available, you protect your account here with a password, passkeys and two-factor authentication.')
        }
      >
        <div className="row-actions">
          <Button variant="secondary" icon={<KeyRound />} loading={sendingReset} disabled={!CLOUD || !email} onClick={changePassword}>
            {t('Change password')}
          </Button>
        </div>
        {captcha.control}
      </SettingsSection>

      <AccountSecurity/>

      <SettingsSection
        title={t('Delete account')}
        tag={CLOUD ? undefined : <PreviewTag>{t('With sign-in')}</PreviewTag>}
        description={
          CLOUD
            ? t('Deletes your account and your personal data for good. Your messages stay visible to others as “Deleted user”.')
            : t('With a real ONYX account you can delete it here. Reset the local demo under “Demo & data”.')
        }
      >
        <div className="row-actions">
          <Button variant="danger" icon={<Trash />} disabled={!CLOUD} onClick={() => ui.openModal({ type: 'deleteAccount' })}>
            {t('Delete account')}
          </Button>
        </div>
      </SettingsSection>
    </>
  );
}

/* ---------------------------------------------------------------- */
/* Badges                                                             */
/* ---------------------------------------------------------------- */

/* ---------------------------------------------------------------- */
/* Redeem code                                                        */
/* ---------------------------------------------------------------- */

function RewardBadges({ rewards }: { rewards: Reward[] }) {
  return (
    <div className="reward-badges">
      {rewards.map((r) => (
        <div key={r.id} className="reward-badge">
          <BadgeIcon badge={r.id} size={36} />
          <span className="reward-text">
            <small>{t('Badge')}</small>
            <strong>{t(BADGE_BY_ID[r.id]?.name ?? r.id)}</strong>
          </span>
        </div>
      ))}
    </div>
  );
}

function RedeemSettings() {
  const redeem = useStore((s) => s.redeemCode);
  const history = useStore((s) => s.redeemed);
  const ui = useUI.getState();
  const [code, setCode] = useState('');
  const [result, setResult] = useState<RedeemResult | null>(null);
  const [busy, setBusy] = useState(false);
  const og = BADGE_BY_ID['onyx-og'];

  const submit = async () => {
    if (!code.trim() || busy) return;
    setBusy(true);
    try {
      setResult(await redeem(code));
    } catch (e) {
      toast({ tone: 'danger', title: t('Code not checked'), body: describeError(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <SettingsHeader
        title={t('Redeem Code')}
        tag={<FreeTag />}
        description={t('Got a code from one of our videos? Redeem it here. Codes award badges – every design in the Profile Studio is free anyway.')}
      />
      <div className="redeem-box">
        <form
          className="redeem-form"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <TextField
            label={t('Your code')}
            prefix={<RedeemIcon size={18} />}
            value={code}
            onChange={(e) => {
              setCode(e.target.value.toUpperCase());
              setResult(null);
            }}
            placeholder="XXXX-XXXXXX"
            autoComplete="off"
            spellCheck={false}
            maxLength={40}
            wrapClassName="grow"
          />
          <Button type="submit" disabled={!code.trim()} loading={busy}>
            {t('Redeem')}
          </Button>
        </form>
        <p className="redeem-note">
          {CLOUD ? t('Codes are checked by the ONYX server. Upper and lower case don’t matter.') : t('Demo: codes are checked locally in this preview. Upper and lower case don’t matter.')}
        </p>
      </div>

      {result && (
        <div className={cn('redeem-result', `is-${result.status}`)} role="status" aria-live="polite">
          {result.status === 'success' && (
            <div className="redeem-reveal">
              <span className="redeem-reveal-art">
                <BadgeIcon badge={result.rewards[0].id} size={84} />
              </span>
              <div className="redeem-reveal-text">
                <span className="eyebrow">
                  <CircleCheck size={14} /> {t('Code redeemed')}
                </span>
                <strong>{t(result.title)}</strong>
                <span>{t(result.description)}</span>
                <span className="redeem-reveal-note">{t('The badge is now on your profile. You can change its position or hide it under Badges.')}</span>
                <div className="row-actions">
                  <Button icon={<Award />} onClick={() => ui.openSettings({ kind: 'user', section: 'badges' })}>
                    {t('Manage badges')}
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() =>
                      ui.openModal({
                        type: 'profile',
                        userId: useStore.getState().meId,
                      })
                    }
                  >
                    {t('View my profile')}
                  </Button>
                </div>
              </div>
            </div>
          )}
          {result.status === 'invalid' && (
            <div className="redeem-result-head">
              <CircleX />
              <div>
                <strong>{t('This code doesn’t exist')}</strong>
                <span>{t('Check the spelling – codes look like WORD-WORD. Upper and lower case don’t matter.')}</span>
              </div>
            </div>
          )}
          {result.status === 'redeemed' && (
            <div className="redeem-result-head">
              <CircleAlert />
              <div>
                <strong>{t('Already redeemed')}</strong>
                <span>{t('You redeemed {code} on {date}. The badge is already yours – each code works once per account.', { code: result.code, date: formatShortDate(result.at) })}</span>
                <RewardBadges rewards={result.rewards} />
              </div>
            </div>
          )}
        </div>
      )}

      <SettingsSection title={t('Badges from codes')}>
        <div className="badge-explain-card">
          <BadgeIcon badge="onyx-og" size={44} />
          <div>
            <strong>{t(og.name)}</strong>
            <span>{t(PROMO_CODES[0].description)}</span>
            {FEATURES.onyxPlus && <small>{t('Separate from ONYX Plus and from your member number.')}</small>}
          </div>
        </div>
      </SettingsSection>

      <SettingsSection title={t('History')} tag={<History size={16} />}>
        {history.length === 0 ? (
          <p className="settings-note">{t('You haven’t redeemed any codes yet.')}</p>
        ) : (
          <div className="redeem-history">
            {history.map((h) => (
              <div key={h.code} className="redeem-row">
                <code>{h.code}</code>
                <span className="grow truncate">{h.rewards.map((r) => t(BADGE_BY_ID[r.id]?.name ?? r.id)).join(' · ')}</span>
                <span className="redeem-date">{formatShortDate(h.at)}</span>
              </div>
            ))}
          </div>
        )}
      </SettingsSection>
    </>
  );
}

/* ---------------------------------------------------------------- */
/* Language                                                           */
/* ---------------------------------------------------------------- */

function LanguageSettings() {
  const lang = useStore((s) => s.settings.language);
  const set = useStore((s) => s.setSetting);
  return (
    <>
      <SettingsHeader title={t('Language')} description={t('Changes the language of the app. Messages and names written by people are never translated.')} />
      <div className="lang-grid" role="radiogroup" aria-label={t('Language')}>
        {LANGUAGES.map((l) => (
          <button
            key={l.code}
            role="radio"
            aria-checked={lang === l.code}
            className={cn('lang-option', lang === l.code && 'is-active')}
            onClick={() => set('language', l.code as Lang)}
            lang={l.code}
            dir={l.dir}
          >
            <span className="radio-dot" />
            <span className="grow">
              <strong>{l.native}</strong>
              <small dir="auto">{l.code === getLanguage() ? t(l.english) : `${t(l.english)}`}</small>
            </span>
            {l.dir === 'rtl' && <span className="theme-tag">RTL</span>}
          </button>
        ))}
      </div>
      <p className="settings-note">{t('Your registration country is shown separately on your profile and does not depend on the language.')}</p>
    </>
  );
}

/* ---------------------------------------------------------------- */
/* Privacy                                                            */
/* ---------------------------------------------------------------- */

function PrivacySettings() {
  const me = useMe();
  const settings = useStore((s) => s.settings);
  const set = useStore((s) => s.setSetting);
  const blocked = useStore((s) => Object.values(s.relationships).filter((r) => r.type === 'blocked').length);
  const friendLabel = {
    everyone: t('Everyone'),
    'friends-of-friends': t('Friends of friends'),
    'server-members': t('Server members'),
  };
  return (
    <>
      <SettingsHeader title={t('Privacy & Safety')} description={t('Some options apply instantly, others are enforced on the server once accounts sync. Each one is marked.')} />
      <SettingsSection title={t('Profile')}>
        <SettingRow
          title={t('Show registration country')}
          tag={<LocalTag />}
          description={
            <>
              {t('Shows the flag of the country you registered from next to your member number.')}
              {me.country && (
                <span className="inline-flag">
                  <Flag code={me.country} size={16} withTooltip={false} /> {countryName(me.country)}
                </span>
              )}
            </>
          }
          control={<Switch checked={settings.showCountry} onChange={(v) => set('showCountry', v)} label={t('Show registration country')} />}
        />
        <SettingRow
          title={t('Show activity status')}
          tag={<BackendTag />}
          description={t('Shows others what you’re playing or listening to. When off, the activity disappears from your profile and the member list.')}
          control={<ActivityVisibilitySwitch />}
        />
      </SettingsSection>
      <SettingsSection title={t('Direct messages')}>
        <SettingRow
          title={t('Allow DMs from server members')}
          tag={<BackendTag />}
          description={t('Members of your servers can message you even if you’re not friends.')}
          control={<Switch checked={settings.allowServerDMs} onChange={(v) => set('allowServerDMs', v)} label={t('DMs from server members')} />}
        />
        <div className="field-label" style={{ margin: '16px 0 8px' }}>
          {t('Explicit content filter')} <BackendTag />
        </div>
        <div role="radiogroup" aria-label={t('Message filter')}>
          <RadioCard
            checked={settings.messageFilter === 'all'}
            onSelect={() => set('messageFilter', 'all')}
            title={t('Scan all messages')}
            description={t('Maximum safety for all direct messages.')}
          />
          <RadioCard
            checked={settings.messageFilter === 'non-friends'}
            onSelect={() => set('messageFilter', 'non-friends')}
            title={t('Scan messages from non-friends')}
            description={t('Recommended – friends stay unfiltered.')}
          />
          <RadioCard checked={settings.messageFilter === 'off'} onSelect={() => set('messageFilter', 'off')} title={t('Don’t scan')} description={t('No automatic filtering.')} />
        </div>
      </SettingsSection>
      <SettingsSection title={t('Friend requests')} tag={<BackendTag />}>
        <SettingRow
          title={t('Who can send you requests?')}
          control={
            <Dropdown
              align="end"
              items={(['everyone', 'friends-of-friends', 'server-members'] as const).map((k) => ({
                type: 'radio' as const,
                label: friendLabel[k],
                checked: settings.friendRequestsFrom === k,
                onSelect: () => set('friendRequestsFrom', k),
              }))}
              trigger={<button className="select-btn select-sm">{friendLabel[settings.friendRequestsFrom]}</button>}
            />
          }
        />
        <SettingRow
          title={t('Blocked users')}
          description={
            blocked
              ? tn(
                  blocked,
                  '{count} blocked. Blocked users can’t message you; their messages are hidden in servers.',
                  '{count} blocked. Blocked users can’t message you; their messages are hidden in servers.',
                )
              : t('You haven’t blocked anyone.')
          }
          control={
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                useUI.getState().closeSettings();
                useStore.getState().goHome('friends');
              }}
            >
              {t('Manage')}
            </Button>
          }
        />
      </SettingsSection>
      <SettingsSection title={t('Your data')}>
        <SettingsCard>
          <div className="data-note">
            <ShieldCheck size={20} />
            <div>
              <strong>{t('Right now everything stays on your device.')}</strong>
              <span>{t('No data is sent to servers in this preview. Messages, profile pictures and settings live in your browser’s local storage.')}</span>
            </div>
          </div>
        </SettingsCard>
      </SettingsSection>
    </>
  );
}

/* ---------------------------------------------------------------- */
/* Connections                                                        */
/* ---------------------------------------------------------------- */


/* ---------------------------------------------------------------- */
/* Plus summary                                                       */
/* ---------------------------------------------------------------- */

function PlusSettings() {
  const me = useMe();
  const setWall = useStore((s) => s.setSupporterWall);
  const resetPlus = useStore((s) => s.resetPlusDemo);
  const go = (page: 'plus' | 'supporters') => {
    useUI.getState().closeSettings();
    useStore.getState().goHome(page);
    useUI.getState().setMobilePanel('main');
  };
  return (
    <>
      <SettingsHeader title="ONYX Plus" description={t('Chat and personalisation stay free.')} />
      {me.plusSince ? (
        <>
          <div className="plus-summary is-active">
            <span className="plus-summary-check">
              <PlusCheckIcon size={44} />
            </span>
            <div>
              <span className="eyebrow">{t('Your status')}</span>
              <h3>{t('Thank you for supporting ONYX')}</h3>
              <p>{t('Supporter since {date}. Your blue Plus check is visible on your profile.', { date: formatShortDate(me.plusSince) })}</p>
            </div>
          </div>
          <SettingsSection title={t('Supporter wall')}>
            <SettingRow
              title={t('Show me on the supporter wall')}
              description={t('Adds your display name and avatar to the public ONYX supporter page. You can hide it again at any time.')}
              control={<Switch checked={!!me.supporterWall} onChange={setWall} label={t('Show me on the supporter wall')} />}
            />
            <div className="row-actions">
              <Button variant="secondary" icon={<HeartHandshake />} onClick={() => go('supporters')}>
                {t('Open supporter wall')}
              </Button>
              <Button variant="ghost" onClick={()=>go('plus')}>{t('Manage subscription')}</Button>
            </div>
          </SettingsSection>
          {!CLOUD && <SettingsSection title={t('Demo')}>
            <SettingRow
              title={t('Undo demo purchase')}
              description={t('Removes the check and the badge again so you can try the purchase flow once more. Nothing was paid.')}
              control={
                <Button size="sm" variant="ghost" icon={<RotateCcw />} onClick={resetPlus}>
                  {t('Undo')}
                </Button>
              }
            />
          </SettingsSection>}
        </>
      ) : (
        <div className="plus-summary">
          <CrystalArt size={120} />
          <div>
            <span className="eyebrow">{t('Your status')}</span>
            <h3>{t('Not a supporter yet')}</h3>
            <p>{t('{price} / month', { price: plusPrice() })}</p>
            <div className="row-actions">
              <Button onClick={() => go('plus')} icon={<GemMark size={16} />}>
                {t('View Plus')}
              </Button>
            </div>
          </div>
        </div>
      )}
      <SettingsSection title={t('What the blue check means')}>
        <div className="badge-explain">
          <div>
            <PlusCheckIcon size={26} />
            <span>
              <strong>{t('ONYX Plus supporter')}</strong>
              {t('Shows support for ONYX – it is not an identity verification.')}
            </span>
          </div>
        </div>
      </SettingsSection>
    </>
  );
}

/* ---------------------------------------------------------------- */
/* What's new                                                         */
/* ---------------------------------------------------------------- */

function WhatsNew() {
  return <>
    <SettingsHeader title={t('What’s new')} description={`ONYX ${BRAND.version}`} />
    <div className="changelog"><ul className="check-list">
      <li>{t('Server tags, public invitations and bots.')}</li>
      <li>{t('A simpler Profile Studio – every design is free and available right away')}</li>
      <li>{t('Profiles keep their design in every view – including all sections')}</li>
      <li>{t('Voice messages and audio files in DMs and channels')}</li>
      <li>{t('Voice and video channels, calls in DMs and groups, screen sharing (with an ONYX account)')}</li>
    </ul></div>
  </>;
}

/* ---------------------------------------------------------------- */
/* Demo & data                                                        */
/* ---------------------------------------------------------------- */

/** Voice messages and audio files live in IndexedDB, next to the JSON state. */
function AudioStorage() {
  const [usage, setUsage] = useState<{ bytes: number; count: number } | null>(null);
  useEffect(() => {
    audioUsage().then(setUsage);
  }, []);
  return (
    <SettingsSection title={t('Voice messages & audio')}>
      <SettingRow
        title={
          <>
            <AudioLines size={16} /> {usage ? tn(usage.count, '{count} recording or file · {size}', '{count} recordings or files · {size}', { size: formatBytes(usage.bytes) }) : t('Checking …')}
          </>
        }
        description={t(
          'Stored for real in this browser (IndexedDB), so they survive a reload. They exist only on this device, are not sent to anyone, are not part of the export and are removed with “Reset demo”.',
        )}
        control={
          <Button
            variant="secondary"
            icon={<Trash />}
            disabled={!usage?.count}
            onClick={() =>
              useUI.getState().openModal({
                type: 'confirm',
                title: t('Delete local audio?'),
                body: t('All voice messages and audio files stored in this browser are deleted. The messages stay, but can no longer be played.'),
                confirmLabel: t('Delete'),
                danger: true,
                onConfirm: () => clearAudio().then(() => audioUsage().then(setUsage)),
              })
            }
          >
            {t('Delete audio')}
          </Button>
        }
      />
    </SettingsSection>
  );
}

/** Cloud mode: what is stored online, what stays on this device, what follows later. */
function CloudDataSettings() {
  const email = useAuth((s) => s.email);
  return (
    <>
      <SettingsHeader
        title={t('Account & data')}
        description={email ?? undefined}
      />
      <SettingsSection title={t('Stored online')}>
        <ul className="check-list">
          <li>{t('Profile, display name, username and personalisation')}</li>
          <li>{t('Servers, categories, channels, roles and permissions')}</li>
          <li>{t('Messages, replies, reactions and pins – live for everyone in the channel')}</li>
          <li>{t('Direct messages, groups, friends and blocks')}</li>
          <li>{t('Invites and server badges')}</li>
          <li>{t('Files, voice messages, server emojis and images (Supabase Storage)')}</li>
          <li>{t('Read state and notes about people – the same on every device')}</li>
          <li>{t('Calls in your DMs (start, end, who joined) and, while you are connected, which voice channel or call you are in')}</li>
          <li>{t('Codes, badges and ONYX Plus status')}</li>
        </ul>
      </SettingsSection>
      <SettingsSection title={t('Live, not stored')}>
        <ul className="check-list">
          <li>{t('Online status and “… is typing” – only while you’re connected')}</li>
          <li>{t('Voice, video and screen sharing – sent encrypted through the media server (LiveKit), never recorded or stored')}</li>
        </ul>
      </SettingsSection>
      <SettingsSection title={t('Only on this device')}>
        <ul className="check-list">
          <li>{t('Appearance, language and other app settings')}</li>
          <li>{t('Drafts and favourites')}</li>
        </ul>
      </SettingsSection>
      <SettingsSection title={t('Session')}>
        <SettingRow
          title={t('Log out')}
          description={t('Signs you out on this device. Your data stays in your account.')}
          control={
            <Button variant="danger" icon={<LogOut />} onClick={() => void signOut()}>
              {t('Log out')}
            </Button>
          }
        />
        <SettingRow
          title={t('Delete account')}
          description={t('Deletes your profile, memberships, friends, files and sign-in for good. Messages stay as “Deleted user”.')}
          control={
            <Button variant="danger-ghost" icon={<Trash />} onClick={() => useUI.getState().openModal({ type: 'deleteAccount' })}>
              {t('Delete account')}
            </Button>
          }
        />
      </SettingsSection>
      <a className="settings-note" href="/licenses.html" target="_blank" rel="noreferrer">{t('Licenses')}</a>
    </>
  );
}

function DemoSettings() {
  const ui = useUI.getState();
  // Recalculate on open; the store persists asynchronously.
  const size = useMemo(() => {
    try {
      return (localStorage.getItem(STORE_KEY) ?? '').length * 2;
    } catch {
      return 0;
    }
  }, []);

  const exportData = () => {
    const data = localStorage.getItem(STORE_KEY) ?? '{}';
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `onyx-demo-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <>
      <SettingsHeader title={t('Demo & data')} description={t('This version of ONYX stores everything locally in your browser.')} />
      <SettingsCard>
        <div className="storage">
          <Database size={22} />
          <div className="grow">
            <strong>{t('Local storage')}</strong>
            <span>{t('{used} of about 5 MB used. Uploaded images are stored downscaled; audio is kept separately (see below); other files only as metadata.', { used: formatBytes(size) })}</span>
            <div className="storage-bar">
              <span
                style={{
                  width: `${Math.min(100, (size / (5 * 1024 * 1024)) * 100)}%`,
                }}
              />
            </div>
          </div>
        </div>
      </SettingsCard>
      <AudioStorage />
      <SettingsSection title={t('Export')}>
        <SettingRow
          title={t('Export local data')}
          description={t('Downloads a JSON file with all local demo data.')}
          control={
            <Button variant="secondary" icon={<Download />} onClick={exportData}>
              {t('Export')}
            </Button>
          }
        />
      </SettingsSection>
      <SettingsSection title={t('Reset')}>
        <SettingRow
          title={t('Reset demo')}
          description={t('Restores sample data, profiles and settings. Your local changes will be lost.')}
          control={
            <Button
              variant="danger"
              icon={<RotateCcw />}
              onClick={() =>
                ui.openModal({
                  type: 'confirm',
                  title: t('Reset demo?'),
                  body: t('All local changes (messages, servers, profile, settings, redeemed codes) are discarded and the sample data is reloaded.'),
                  confirmLabel: t('Reset'),
                  danger: true,
                  onConfirm: () => {
                    useStore.getState().resetDemo();
                    ui.closeSettings();
                    ui.pushToast({
                      title: t('Demo reset'),
                      body: t('The sample data was reloaded.'),
                    });
                  },
                })
              }
            >
              {t('Reset')}
            </Button>
          }
        />
      </SettingsSection>
      <SettingsSection title={t('What gets connected later')}>
        <ul className="check-list is-preview">
          <li>{t('Sign-in and accounts (e.g. via Supabase Auth)')}</li>
          <li>{t('Real-time messages between users')}</li>
          <li>{t('File storage for attachments, avatars and banners')}</li>
          <li>{t('Voice and video connections, screen sharing')}</li>
          <li>{t('Server-side validation of codes and badges')}</li>
          <li>{t('Payments for ONYX Plus')}</li>
        </ul>
      </SettingsSection>
    </>
  );
}

/* ---------------------------------------------------------------- */
/* Root                                                               */
/* ---------------------------------------------------------------- */

export function UserSettings({ section }: { section: UserSettingsSection }) {
  if (!FEATURES.onyxPlus && section === 'plus') section = 'account';
  const ui = useUI.getState();
  const me = useMe();
  // Platform admins only; the server returns nothing to anyone else anyway.
  const admin = useAccount((s) => s.admin) && CLOUD;
  const lang = LANGUAGES.find((l) => l.code === getLanguage());
  const groups: NavGroup<UserSettingsSection>[] = [
    {
      label: t('User settings'),
      items: [
        { id: 'account', label: t('My Account'), icon: <CircleUserRound /> },
        {
          id: 'profile',
          label: t('Profile Studio'),
          icon: <Sparkles />,
          tag: <span className="nav-free">{t('Free')}</span>,
        },
        { id: 'badges', label: t('Badges'), icon: <Award /> },
        { id: 'redeem', label: t('Redeem Code'), icon: <RedeemIcon /> },
        { id: 'privacy', label: t('Privacy & Safety'), icon: <ShieldCheck /> },
        { id: 'developer', label: t('Developer'), icon: <Database /> },
        { id: 'connections', label: t('Connections'), icon: <Link2 /> },
      ],
    },
    {
      label: t('Support'),
      items: [...(FEATURES.onyxPlus ? [{ id: 'plus' as const, label: 'ONYX Plus', icon: <GemMark size={18} /> }] : []),{id:'bugs',label:t('Bugs'),icon:<Bug/>}],
    },
    {
      label: t('App settings'),
      items: [
        { id: 'appearance', label: t('Appearance'), icon: <Palette /> },
        {
          id: 'language',
          label: t('Language'),
          icon: <Languages />,
          tag: <span className="nav-hint">{lang?.native}</span>,
        },
        {
          id: 'accessibility',
          label: t('Accessibility'),
          icon: <Accessibility />,
        },
        { id: 'voice', label: t('Voice & Video'), icon: <Mic /> },
        { id: 'notifications', label: t('Notifications'), icon: <Bell /> },
        { id: 'keybinds', label: t('Keybinds'), icon: <Keyboard /> },
      ],
    },
    {
      label: t('About ONYX'),
      items: [
        { id: 'whatsnew', label: t('What’s new'), icon: <Sparkles /> },
        { id: 'demo', label: CLOUD ? t('Account & data') : t('Demo & data'), icon: <Database /> },
      ],
    },
    ...(admin ? [{ label: t('ONYX team'), items: [{ id: 'admin' as const, label: t('ONYX admin'), icon: <ShieldAlert /> }, {id:'badge-admin' as const,label:t('Official badge editor'),icon:<Award/>},{id:'bug-inbox' as const,label:t('Bug inbox'),icon:<Bug/>}] }] : []),
  ];

  const content = {
    account: <AccountSettings />,
    bugs: <BugsSettings />,
    'bug-inbox':admin?<BugsSettings admin/>:<AccountSettings/>,
    profile: <ProfileSettings />,
    badges: <OfficialBadgesSettings />,
    redeem: <RedeemSettings />,
    privacy: <PrivacySettings />,
    developer: <DeveloperSettings />,
    connections: <ConnectionsSettings />,
    plus: <PlusSettings />,
    appearance: <AppearanceSettings />,
    language: <LanguageSettings />,
    accessibility: <AccessibilitySettings />,
    voice: <VoiceSettings />,
    notifications: <NotificationSettings />,
    keybinds: <KeybindSettings />,
    whatsnew: <WhatsNew />,
    demo: CLOUD ? <CloudDataSettings /> : <DemoSettings />,
    'badge-admin':admin?<BadgeCatalogAdmin/>:<AccountSettings/>,
    admin: admin ? <AdminSettings /> : <AccountSettings />,
  }[section];

  return (
    <SettingsLayout
      title={t('User settings')}
      groups={groups}
      active={section}
      onSelect={(id) => ui.openSettings({ kind: 'user', section: id })}
      onClose={ui.closeSettings}
      wide={section === 'profile' || section === 'badge-admin'}
      footer={
        <div className="settings-group">
          <button
            className="settings-nav-item is-danger"
            onClick={() =>
              me.guest?endGuestSession():CLOUD
                ? ui.openModal({
                    type: 'confirm',
                    title: t('Log out'),
                    body: t('Do you want to log out of ONYX on this device?'),
                    confirmLabel: t('Log out'),
                    danger: true,
                    onConfirm: () => {
                      ui.closeSettings();
                      void signOut();
                    },
                  })
                : ui.openModal({
                    type: 'preview',
                    icon: 'auth',
                    title: t('Log out'),
                    body: t('Real accounts and sign-in follow in the next phase. Until then you’re using ONYX locally as {name} – your data stays in this browser.', { name: me.displayName }),
                  })
            }
          >
            <span className="settings-nav-icon">
              <LogOut />
            </span>
            <span className="grow">{me.guest?t('End guest session'):t('Log out')}</span>
          </button>
          <div className="settings-version">ONYX {BRAND.version}</div>
        </div>
      }
    >
      {content}
    </SettingsLayout>
  );
}

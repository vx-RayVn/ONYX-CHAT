import { inviteUrl } from '../../lib/invites';
import { CLOUD } from '../../backend/config';
import { describeError } from '../../backend/queue';
import { useState } from 'react';
import { ArrowLeft, Camera, ChevronRight, Download, Link2, LayoutTemplate } from 'lucide-react';
import { useStore } from '../../store/store';
import { useUI, toast, showMainPane } from '../../store/ui';
import { prepareProfileImage, pickFile, UploadError } from '../../lib/image';
import { cn } from '../../lib/utils';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { TextField } from '../ui/Field';
import { t, tk } from '../../i18n';
import {DiscordImport} from './DiscordImport';

type Template = 'blank';

const TEMPLATES: { id: Template; title: string; text: string; icon: React.ReactNode }[] = [
 { id: 'blank', title: tk('Standard structure'), text: tk('Start with one text and one voice channel'), icon: <LayoutTemplate /> },
];

export function CreateServerModal({ step: initial = 'start' }: { step?: 'start' | 'join' }) {
  const close = useUI((s) => s.closeModal);
  const me = useStore((s) => s.users[s.meId]);
  const { createServer, joinByInvite } = useStore.getState();
  const [step, setStep] = useState<'start' | 'details' | 'join' | 'import'>(me.guest?'join':initial);
  const [template, setTemplate] = useState<Template>('blank');
  const [name, setName] = useState(t('{name}’s server', { name: me.displayName }));
  const [icon, setIcon] = useState<string | undefined>();
  const [invite, setInvite] = useState('');
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);

  const chooseIcon = async () => {
    const [file] = await pickFile('image/*');
    if (!file) return;
    try {
      const img = await prepareProfileImage(file, 'icon');
      setIcon(img.src);
    } catch (e) {
      toast({ tone: 'danger', title: t('Image not applied'), body: e instanceof UploadError ? e.message : t('The file could not be read.') });
    }
  };

  const create = () => {
    if (!name.trim()) return;
    createServer({ name: name.trim(), icon, template });
    close();
    showMainPane();
    toast({ title: t('Server created'), body: t('“{name}” is ready. Invite your friends now!', { name: name.trim() }) });
  };

  if(step==='import')return <DiscordImport onBack={()=>setStep('start')}/>;

  if (step === 'join') {
    return (
      <Modal
        open
        onClose={close}
        size="sm"
        centered
        title={t('Join a server')}
        description={t('Enter an invite to join an existing server.')}
        footer={
          <>
            <Button variant="ghost" icon={<ArrowLeft />} onClick={() => me.guest?close():setStep('start')}>
              {t('Back')}
            </Button>
            <span className="spacer" />
            <Button
              disabled={!invite.trim()}
              loading={joining}
              onClick={async () => {
                setJoining(true);
                try {
                  const id = await joinByInvite(invite);
                  if (id) {
                    close();
                    showMainPane();
                  } else setInviteError(t('This invite is invalid or has expired.'));
                } catch (e) {
                  setInviteError(describeError(e));
                } finally {
                  setJoining(false);
                }
              }}
            >
              {t('Join server')}
            </Button>
          </>
        }
      >
        <TextField
          label={t('Invite link')}
          value={invite}
          onChange={(e) => {
            setInvite(e.target.value);
            setInviteError(null);
          }}
          placeholder="https://onyxchat.site/…"
          error={inviteError}
          autoFocus
          prefix={<Link2 size={16} />}
        />
        {!CLOUD && (
          <div className="invite-examples">
            <span>{t('Examples for the demo:')}</span>
            {['onyx-community', 'scrims-de'].map((c) => (
              <button key={c} className="chip chip-sm" onClick={() => setInvite(inviteUrl(c))}>
                {c}
              </button>
            ))}
          </div>
        )}
      </Modal>
    );
  }

  if (step === 'details') {
    return (
      <Modal
        open
        onClose={close}
        size="sm"
        centered
        title={t('Customize your server')}
        description={t('Give your server a name and an icon. You can change both at any time.')}
        footer={
          <>
            <Button variant="ghost" icon={<ArrowLeft />} onClick={() => setStep('start')}>
              {t('Back')}
            </Button>
            <span className="spacer" />
            <Button onClick={create} disabled={!name.trim()}>
              {t('Create')}
            </Button>
          </>
        }
      >
        <div className="icon-upload-wrap">
          <button className={cn('icon-upload', icon && 'has-icon')} onClick={chooseIcon} aria-label={t('Upload server icon')}>
            {icon ? (
              <img src={icon} alt="" />
            ) : (
              <>
                <Camera size={24} />
                <span>{t('Upload')}</span>
              </>
            )}
            <span className="icon-upload-plus">+</span>
          </button>
          {icon && (
            <button className="btn btn-link btn-sm" onClick={() => setIcon(undefined)}>
              {t('Remove icon')}
            </button>
          )}
        </div>
        <TextField
          label={t('Server name')}
          value={name}
          maxLength={100}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && create()}
          autoFocus
          hint={t('By creating a server you accept the ONYX community guidelines.')}
        />
      </Modal>
    );
  }

  return (
    <Modal open onClose={close} size="sm" centered title={t('Create a server')} description={t('Start with a standard structure or bring your Discord server.')}>
      <div className="template-list">
        {TEMPLATES.map((tpl) => (
          <button
            key={tpl.id}
            className={cn('template', template === tpl.id && 'is-active')}
            onClick={() => {
              setTemplate(tpl.id);
              setStep('details');
            }}
          >
            <span className="template-icon">{tpl.icon}</span>
            <span className="template-text">
              <strong>{t(tpl.title)}</strong>
              <span>{t(tpl.text)}</span>
            </span>
            <ChevronRight size={18} className="template-chev" />
          </button>
        ))}
        <button className="template discord-import-choice" onClick={()=>setStep('import')}><span className="template-icon"><Download/></span><span className="template-text"><strong>{t('Import from Discord')}</strong><span>{t('Bring your channels, categories and roles.')}</span></span><ChevronRight size={18} className="template-chev"/></button>
      </div>
      <div className="modal-split">
        <span>{t('Already have an invite?')}</span>
        <Button variant="secondary" block onClick={() => setStep('join')}>
          {t('Join a server')}
        </Button>
      </div>
    </Modal>
  );
}

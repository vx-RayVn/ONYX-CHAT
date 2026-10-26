import { t } from '../../i18n';
import type { ReactNode } from 'react';
import { Dialog } from 'radix-ui';
import { X } from 'lucide-react';
import { cn } from '../../lib/utils';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  bodyClassName?: string;
  hideClose?: boolean;
  /** Center the header (used for welcome-style dialogs). */
  centered?: boolean;
  header?: ReactNode;
}

export function Modal({ open, onClose, title, description, children, footer, size = 'md', className, bodyClassName, hideClose, centered, header }: ModalProps) {
  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="modal-overlay" />
        <Dialog.Content className={cn('modal', `modal-${size}`, centered && 'modal-centered', className)} aria-describedby={description ? undefined : undefined}>
          {header}
          {(title || !hideClose) && (
            <div className="modal-header">
              {title ? <Dialog.Title className="modal-title">{title}</Dialog.Title> : <Dialog.Title className="sr-only">Dialog</Dialog.Title>}
              {description ? <Dialog.Description className="modal-desc">{description}</Dialog.Description> : <Dialog.Description className="sr-only">Dialog</Dialog.Description>}
              {!hideClose && (
                <Dialog.Close className="modal-close" aria-label={t('Close')}>
                  <X size={20} />
                </Dialog.Close>
              )}
            </div>
          )}
          {children && <div className={cn('modal-body', bodyClassName)}>{children}</div>}
          {footer && <div className="modal-footer">{footer}</div>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

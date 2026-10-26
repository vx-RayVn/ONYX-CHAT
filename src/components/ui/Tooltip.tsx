import type { ReactElement, ReactNode } from 'react';
import { Tooltip as RT } from 'radix-ui';
import { useMediaQuery } from '../../hooks/useMediaQuery';

interface Props {
  content: ReactNode;
  children: ReactElement;
  side?: 'top' | 'bottom' | 'left' | 'right';
  align?: 'start' | 'center' | 'end';
  delay?: number;
  disabled?: boolean;
  className?: string;
  arrow?: boolean;
}

export function Tooltip({ content, children, side = 'top', align = 'center', delay, disabled, className, arrow = true }: Props) {
  const touch=useMediaQuery('(hover: none), (pointer: coarse)');
  if (!content || disabled || touch) return children;
  return (
    <RT.Root delayDuration={delay}>
      <RT.Trigger asChild>{children}</RT.Trigger>
      <RT.Portal>
        <RT.Content side={side} align={align} sideOffset={8} collisionPadding={8} className={className ? `tooltip ${className}` : 'tooltip'}>
          {content}
          {arrow && <RT.Arrow className="tooltip-arrow" width={10} height={5} />}
        </RT.Content>
      </RT.Portal>
    </RT.Root>
  );
}

export const TooltipProvider = RT.Provider;

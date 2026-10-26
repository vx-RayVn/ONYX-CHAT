import { useLayoutEffect } from 'react';

/** Keep the composer and dialogs inside the visible area when a keyboard opens.
 * Pinch zoom stays browser-controlled. No UA or device-model assumptions.
 */
export function useTouchViewport(enabled: boolean) {
  useLayoutEffect(() => {
    if (!enabled) return;
    const viewport = window.visualViewport;
    const root = document.documentElement;
    let frame = 0;
    let width = window.innerWidth;
    let restingHeight = window.innerHeight;
    let wasKeyboard = false;
    let followUntil = 0;
    const editable = (el: EventTarget | null) => el instanceof HTMLElement && (el.isContentEditable || el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement && !['button','submit','reset','checkbox','radio','range','file','color','hidden'].includes(el.type));
    const clear = () => {
      root.style.removeProperty('--touch-height');
      root.style.removeProperty('--touch-top');
      if (root.dataset.keyboard !== 'closed') root.dataset.keyboard = 'closed';
    };
    const releasePan = () => {
      if (wasKeyboard && (window.scrollY || window.scrollX)) window.scrollTo({top:0,left:0,behavior:'instant'});
      wasKeyboard = false;
    };
    const update = () => {
      if (viewport && Math.abs(viewport.scale - 1) > 0.02) return;
      // Closed keyboards use CSS dvh again. Safari can retain both an old
      // offsetTop and an old height after dismissal; neither should pin the app.
      if (Math.abs(window.innerWidth - width) > 80) {
        width = window.innerWidth;
        restingHeight = Math.max(window.innerHeight, root.clientHeight);
      }
      const focused = editable(document.activeElement);
      if (!focused) restingHeight = Math.max(window.innerHeight, root.clientHeight);
      const layoutHeight = Math.max(restingHeight, window.innerHeight, root.clientHeight);
      // innerHeight can lag behind a restored visual viewport on dismissal.
      // Clamp against the resting layout, not the stale shrunken innerHeight.
      const height = Math.round(Math.min(layoutHeight, viewport?.height ?? window.innerHeight));
      const keyboard = focused && layoutHeight - height > Math.min(150, layoutHeight * .22);
      if (keyboard) {
        const top = Math.round(Math.max(0, Math.min(viewport?.offsetTop ?? 0, layoutHeight - height)));
        const value = `${height}px`, offset = `${top}px`;
        if (root.style.getPropertyValue('--touch-height') !== value) root.style.setProperty('--touch-height', value);
        if (root.style.getPropertyValue('--touch-top') !== offset) root.style.setProperty('--touch-top', offset);
        if (root.dataset.keyboard !== 'open') root.dataset.keyboard = 'open';
      } else {
        clear();
        // Dismissing a software keyboard can leave its input focused. Once the
        // visible height has recovered, release Safari's document pan as well.
        releasePan();
        if (!focused || height >= restingHeight - 2) restingHeight = window.innerHeight;
      }
      wasKeyboard = keyboard;
    };
    const tick = (now: number) => {
      frame = 0;
      if (document.visibilityState === 'hidden') return;
      update();
      if (now < followUntil) frame = requestAnimationFrame(tick);
    };
    const schedule = () => { if (!frame && document.visibilityState !== 'hidden') frame = requestAnimationFrame(tick); };
    // Safari may publish the final geometry after its resize event. Follow each
    // frame for a bounded transition instead of polling at 80/240/480/900ms:
    // a recovered viewport must never wait for the next timer to fill the chat.
    // Only changed geometry is written; there is no idle animation loop.
    const settle = () => {
      followUntil = performance.now() + 1200;
      schedule();
    };
    const focusout = (event: FocusEvent) => {
      // Done/outside taps provide an earlier close signal than Safari's viewport.
      // Do not retain the keyboard-sized shell for even one extra paint. Moving
      // between editors keeps the keyboard sizing and does not reset the pan.
      if (editable(event.target) && !editable(event.relatedTarget)) {
        clear();
        releasePan();
      }
      settle();
    };
    update();
    settle();
    viewport?.addEventListener('resize', settle);
    viewport?.addEventListener('scroll', schedule);
    viewport?.addEventListener('scrollend', settle);
    window.addEventListener('resize', settle);
    window.addEventListener('pageshow', settle);
    window.addEventListener('orientationchange', settle);
    document.addEventListener('visibilitychange', settle);
    document.addEventListener('focusin', settle);
    document.addEventListener('focusout', focusout);
    return () => {
      cancelAnimationFrame(frame);
      viewport?.removeEventListener('resize', settle);
      viewport?.removeEventListener('scroll', schedule);
      viewport?.removeEventListener('scrollend', settle);
      window.removeEventListener('resize', settle);
      window.removeEventListener('pageshow', settle);
      window.removeEventListener('orientationchange', settle);
      document.removeEventListener('visibilitychange', settle);
      document.removeEventListener('focusin', settle);
      document.removeEventListener('focusout', focusout);
      root.style.removeProperty('--touch-height'); root.style.removeProperty('--touch-top');
      delete root.dataset.keyboard;
    };
  }, [enabled]);
}

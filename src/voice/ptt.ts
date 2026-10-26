/**
 * Push-to-talk: the microphone sends only while the chosen key is held (plus
 * a short release delay so the end of a word isn't cut off).
 *
 * Browsers only pass key presses to the focused page, so push-to-talk works
 * while ONYX is the active tab/window – the settings say so.
 */
import { setPtt } from './engine';

let installed = false;
let key = '';
let delay = 200;
let releaseTimer: ReturnType<typeof setTimeout> | null = null;

function down(e: KeyboardEvent) {
  if (!key || e.code !== key || e.repeat) return;
  if (releaseTimer) clearTimeout(releaseTimer);
  releaseTimer = null;
  setPtt(true);
}

function up(e: KeyboardEvent) {
  if (!key || e.code !== key) return;
  release();
}

function release() {
  if (releaseTimer) clearTimeout(releaseTimer);
  releaseTimer = setTimeout(() => {
    releaseTimer = null;
    setPtt(false);
  }, delay);
}

/** Switching to another window while holding the key would otherwise leave the microphone open. */
function blur() {
  if (releaseTimer) clearTimeout(releaseTimer);
  releaseTimer = null;
  setPtt(false);
}

export function configurePtt(enabled: boolean, code: string, releaseDelay: number) {
  key = code;
  delay = Math.max(0, Math.min(2000, releaseDelay));
  if (enabled && !installed) {
    window.addEventListener('keydown', down, true);
    window.addEventListener('keyup', up, true);
    window.addEventListener('blur', blur);
    installed = true;
  } else if (!enabled && installed) {
    window.removeEventListener('keydown', down, true);
    window.removeEventListener('keyup', up, true);
    window.removeEventListener('blur', blur);
    installed = false;
    blur();
  }
}

/** Readable name of a key code ("KeyV" → "V", "Backquote" → "`"). */
export function keyLabel(code: string): string {
  if (!code) return '';
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit\d$/.test(code)) return code.slice(5);
  if (/^Numpad\d$/.test(code)) return `Num ${code.slice(6)}`;
  const named: Record<string, string> = {
    Backquote: '`',
    Minus: '-',
    Equal: '=',
    BracketLeft: '[',
    BracketRight: ']',
    Backslash: '\\',
    Semicolon: ';',
    Quote: "'",
    Comma: ',',
    Period: '.',
    Slash: '/',
    Space: 'Space',
    ControlLeft: 'Ctrl (L)',
    ControlRight: 'Ctrl (R)',
    ShiftLeft: 'Shift (L)',
    ShiftRight: 'Shift (R)',
    AltLeft: 'Alt (L)',
    AltRight: 'Alt (R)',
    CapsLock: 'Caps Lock',
    IntlBackslash: '<',
  };
  return named[code] ?? code;
}

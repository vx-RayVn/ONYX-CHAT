/**
 * Country flag emoji fallback.
 *
 * Windows does not draw flag emoji: 🇧🇷 shows up as the letters "BR". Where the
 * system font cannot draw flags, we load the self-hosted "Twemoji Country Flags"
 * font (flag artwork from Twemoji, CC-BY 4.0; polyfill by TalkJS, MIT). Platforms
 * with their own flags (macOS, iOS, Android, Firefox) keep their system emoji.
 *
 * The font's unicode-range only covers regional indicator symbols and the tag
 * sequences of the England/Scotland/Wales flags, so ordinary letters such as
 * "BR" in a sentence are never turned into flags.
 */
import { polyfillCountryFlagEmojis } from 'country-flag-emoji-polyfill';
import flagFontUrl from 'country-flag-emoji-polyfill/dist/TwemojiCountryFlags.woff2?url';
import { canonicalCountryCode } from './countries';

export const FLAG_FONT_FAMILY = 'Twemoji Country Flags';

let installed: boolean | null = null;

/** Adds the flag font when needed; returns whether the fallback is active. */
export function installFlagEmojiFallback() {
  if (installed !== null) return installed;
  try {
    installed = polyfillCountryFlagEmojis(FLAG_FONT_FAMILY, flagFontUrl);
  } catch {
    installed = false;
  }
  return installed;
}

/** ISO 3166 code ("BR") → flag emoji ("🇧🇷"); empty for anything else. */
export function flagEmoji(code: string) {
  const region = canonicalCountryCode(code);
  if (!region) return '';
  return String.fromCodePoint(...[...region].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

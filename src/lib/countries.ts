/** Normalize legacy region aliases before rendering flags or saving a country. */
export function canonicalCountryCode(value: string): string {
  const code = value.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return '';
  // WebKit's Intl data can preserve these legacy aliases instead of canonicalising them.
  const aliases: Record<string,string> = {DD:'DE',UK:'GB',FX:'FR'};
  if (aliases[code]) return aliases[code];
  try {
    return new Intl.Locale(`und-${code}`).region ?? code;
  } catch {
    return code;
  }
}

/** Intl.DisplayNames includes aliases such as DD and DE with the same name. */
export function countryOptions(language: string) {
  const names = new Intl.DisplayNames([language], { type: 'region', fallback: 'none' });
  const out: { code: string; name: string }[] = [];
  for (let a = 65; a <= 90; a++)
    for (let b = 65; b <= 90; b++) {
      const code = String.fromCharCode(a, b);
      if (canonicalCountryCode(code) !== code || ['EU', 'EZ', 'UN', 'ZZ', 'QO', 'XA', 'XB'].includes(code)) continue;
      const name = names.of(code);
      if (name && name !== code) out.push({ code, name });
    }
  return out.sort((x, y) => x.name.localeCompare(y.name, language));
}

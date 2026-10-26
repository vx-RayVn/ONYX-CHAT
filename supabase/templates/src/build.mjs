/**
 * Builds the ONYX auth emails for Supabase (Go templates) from strings.mjs.
 *
 *   npm run emails
 *
 * Output:
 *   supabase/templates/<kind>.html   → paste into Supabase › Authentication › Emails
 *   supabase/templates/SUBJECTS.md   → the matching subject lines
 *   supabase/templates/txt/          → copy-ready HTML and subjects as plain text
 *   supabase/templates/preview/      → every email in every language, open index.html (not committed)
 *
 * The body language comes from user_metadata.locale (set by the app); anything
 * unknown falls back to English. Subjects stay short to fit the dashboard limit.
 * Texts never contain HTML and no user-provided
 * data is printed except the email address, so nothing needs escaping.
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FORGOT, LANGS, RTL, T } from './strings.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, '..');
const root = join(outDir, '..', '..');
const previewDir = join(outDir, 'preview');
const textDir = join(outDir, 'txt');

/* ------------------------------------------------------------------ */
/* Settings                                                            */
/* ------------------------------------------------------------------ */

/** Public brand asset already shipped with ONYX; no separate Storage upload needed. */
const LOGO = 'https://onyxchat.site/brand/onyx-logo-512.png';

const KINDS = {
  confirmation: { dashboard: 'Confirm sign up', code: true, type: 'email', codeInSubject: true },
  magic_link: { dashboard: 'Magic link', code: true, type: 'email' },
  recovery: { dashboard: 'Reset password', code: true, type: 'recovery' },
  password_changed: { dashboard: 'Password changed (Security notifications)', code: false },
  email_change: { dashboard: 'Change email address', code: true, type: 'email_change', codeInSubject: true },
};

const C = {
  bg: '#07090b',
  card: '#161c21',
  cardLine: '#232b31',
  well: '#0c1014',
  codeLine: '#1b4d3d',
  pill: '#0f2a22',
  strong: '#f4f8fa',
  text: '#e2eaf0',
  body: '#d4dfe6',
  muted: '#bdcbd4',
  faint: '#b4c3cd',
  accent: '#10b981',
  accentText: '#3ddba3',
  ink: '#03130c',
  dangerBg: '#2a1a1f',
  dangerLine: '#4a2a31',
  dangerText: '#ff9aa4',
};
const SANS = "Inter,'Segoe UI',-apple-system,BlinkMacSystemFont,Roboto,'Helvetica Neue',Arial,sans-serif";
const MONO = "'Cascadia Code','SF Mono',Menlo,Consolas,'Roboto Mono',monospace";

/* ------------------------------------------------------------------ */
/* Texts                                                               */
/* ------------------------------------------------------------------ */

function prep(lang, s) {
  let out = s.replace('{forgot}', FORGOT[lang]);
  // French typography: no-break space before ? ! : ; » and after «
  if (lang === 'fr') out = out.replace(/ ([?!:;»])/g, ' $1').replace(/« /g, '« ');
  if (/[<>&"]|\{\{|\}\}/.test(out)) throw new Error(`${lang}: text must not contain HTML or template syntax: ${out}`);
  return out;
}

/** All texts of one email in one language; `%s` splits into A/B parts. */
function texts(kind, lang) {
  const src = { ...T[lang].shared, ...T[lang][kind] };
  const en = { ...T.en.shared, ...T.en[kind] };
  const out = {};
  for (const key of Object.keys(en)) {
    if (src[key] === undefined) throw new Error(`${lang}.${kind}.${key} missing`);
    if (key === 'subject') continue;
    const value = prep(lang, src[key]);
    if (en[key].includes('%s')) {
      const parts = value.split('%s');
      if (parts.length !== 2) throw new Error(`${lang}.${kind}.${key}: needs exactly one %s`);
      [out[`${key}A`], out[`${key}B`]] = parts;
    } else out[key] = value;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Layout (shared by the Go template and the preview)                  */
/* ------------------------------------------------------------------ */

/**
 * v: every text plus lang, dir, token, email, siteUrl, tokenHash – either
 * template expressions ({{ $title }}) or real values (preview).
 */
function layout(kind, v) {
  const k = KINDS[kind];
  // A query works with Site URLs both with and without a trailing slash.
  const link = k.code ? `${v.siteUrl}?token_hash=${v.tokenHash}&amp;type=${k.type}` : v.siteUrl;
  const p = (style, html) => `<p style="margin:0;${style}">${html}</p>`;

  const codeBox = `
              <tr>
                <td style="padding:26px 0 0;">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.well}" style="background:${C.well};border:1px solid ${C.codeLine};border-radius:14px;">
                    <tr>
                      <td align="center" style="padding:22px 16px 18px;">
                        ${p(`font:700 11px/1.4 ${SANS};letter-spacing:0.12em;text-transform:uppercase;color:${C.muted};`, v.codeLabel)}
                        <p class="onyx-code" dir="ltr" style="margin:10px 0 0;padding-left:8px;font:700 36px/1.15 ${MONO};letter-spacing:8px;color:${C.strong};-webkit-user-select:all;user-select:all;">${v.token}</p>
                        ${p(`padding-top:12px;font:500 12px/1.5 ${SANS};color:${C.faint};`, v.validity)}
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
              <tr>
                <td style="padding:24px 0 12px;">
                  ${p(`font:400 14px/1.55 ${SANS};color:${C.muted};`, v.device)}
                </td>
              </tr>`;

  const changedBox = `
              <tr>
                <td style="padding:16px 0 0;">
                  ${p(`font:400 15px/1.6 ${SANS};color:${C.body};`, v.ok)}
                </td>
              </tr>
              <tr>
                <td style="padding:22px 0 24px;">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.dangerBg}" style="background:${C.dangerBg};border:1px solid ${C.dangerLine};border-radius:14px;">
                    <tr>
                      <td style="padding:16px 18px;">
                        ${p(`font:700 14px/1.4 ${SANS};color:${C.dangerText};`, v.warnTitle)}
                        ${p(`padding-top:6px;font:400 14px/1.6 ${SANS};color:${C.text};`, v.warn)}
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>`;

  const button = `
              <tr>
                <td>
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td align="center" bgcolor="${C.accent}" style="border-radius:10px;background:${C.accent};mso-padding-alt:13px 22px;">
                        <a href="${link}" target="_blank" style="display:inline-block;padding:13px 22px;font:700 15px/1.2 ${SANS};color:${C.ink};text-decoration:none;border-radius:10px;">${v.button}</a>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>`;

  const notes = k.code
    ? `
              <tr>
                <td style="padding:28px 0 0;">
                  <div style="height:1px;line-height:1px;font-size:0;background:${C.cardLine};">&nbsp;</div>
                </td>
              </tr>
              <tr>
                <td style="padding:20px 0 0;">
                  ${p(`font:400 13px/1.6 ${SANS};color:${C.muted};`, v.ignore)}
                  ${p(`padding-top:10px;font:600 13px/1.6 ${SANS};color:${C.text};`, v.never)}
                </td>
              </tr>`
    : '';

  const intro = kind === 'password_changed' ? `${v.introA}<span dir="ltr" style="color:${C.strong};">${v.email}</span>${v.introB}` : v.intro;
  const preheader = k.codeInSubject ? `${v.preheaderA}${v.token}${v.preheaderB}` : v.preheader;

  return `<!doctype html>
<html lang="${v.lang}" dir="${v.dir}" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="format-detection" content="telephone=no,date=no,address=no,email=no,url=no">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>${v.title}</title>
<!-- ONYX · Supabase › Authentication › Emails › "${k.dashboard}" · built by supabase/templates/src/build.mjs -->
<style>
  :root { color-scheme: dark; supported-color-schemes: dark; }
  body { margin: 0 !important; padding: 0 !important; width: 100% !important; }
  a[x-apple-data-detectors] { color: inherit !important; text-decoration: none !important; font: inherit !important; }
  @media (max-width: 540px) {
    .onyx-outer { padding: 24px 12px !important; }
    .onyx-card { padding: 26px 20px 24px !important; border-radius: 16px !important; }
    .onyx-title { font-size: 22px !important; }
    .onyx-code { font-size: 30px !important; letter-spacing: 6px !important; padding-left: 6px !important; }
  }
</style>
</head>
<body class="body" style="margin:0;padding:0;background:${C.bg};" bgcolor="${C.bg}">
<div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;mso-hide:all;font-size:1px;line-height:1px;color:${C.bg};">${preheader}${'&#847;&zwnj;&nbsp;'.repeat(40)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.bg}" style="background:${C.bg};">
  <tr>
    <td class="onyx-outer" align="center" style="padding:40px 16px;">
      <!--[if mso]><table role="presentation" align="center" width="520" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
      <table role="presentation" align="center" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;">
        <tr>
          <td class="onyx-card" bgcolor="${C.card}" style="padding:32px 32px 30px;background-color:${C.card};background-image:radial-gradient(120% 70% at 50% 0%, rgba(16,185,129,0.14), rgba(16,185,129,0) 62%);border:1px solid ${C.cardLine};border-radius:20px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="padding:0 0 26px;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td style="vertical-align:middle;"><img src="${LOGO}" width="36" height="36" alt="" style="display:block;width:36px;height:36px;border:0;border-radius:10px;"></td>
                      <td style="vertical-align:middle;padding:0 12px;font:800 16px/1 ${SANS};letter-spacing:0.08em;color:${C.muted};">ONYX</td>
                    </tr>
                  </table>
                </td>
              </tr>
              <tr>
                <td>
                  <span style="display:inline-block;padding:4px 10px;border-radius:999px;background:${C.pill};font:700 11px/1.4 ${SANS};letter-spacing:0.06em;text-transform:uppercase;color:${C.accentText};">${v.eyebrow}</span>
                </td>
              </tr>
              <tr>
                <td style="padding:14px 0 0;">
                  <h1 class="onyx-title" style="margin:0;font:800 24px/1.3 ${SANS};color:${C.strong};">${v.title}</h1>
                </td>
              </tr>
              <tr>
                <td style="padding:10px 0 0;">
                  ${p(`font:400 15px/1.6 ${SANS};color:${C.body};`, intro)}
                </td>
              </tr>${k.code ? codeBox : changedBox}${button}${notes}
            </table>
          </td>
        </tr>
        <tr>
          <td align="center" style="padding:22px 12px 0;font:400 12px/1.7 ${SANS};color:${C.faint};">
            ${v.sentToA}<span dir="ltr"${kind === 'email_change' ? ' style="overflow-wrap:anywhere;word-break:break-word;"' : ''}>${v.email}</span>${v.sentToB}<br>
            <span style="font-weight:700;letter-spacing:0.08em;color:${C.muted};">ONYX</span> · ${v.tagline}<br>
            ${v.auto}
          </td>
        </tr>
      </table>
      <!--[if mso]></td></tr></table><![endif]-->
    </td>
  </tr>
</table>
</body>
</html>
`;
}

/* ------------------------------------------------------------------ */
/* Go template                                                         */
/* ------------------------------------------------------------------ */

const goStr = (s) => JSON.stringify(s);
const varName = (key) => `$${key}`;

function goTemplate(kind) {
  const keys = Object.keys(texts(kind, 'en'));
  const assign = (lang, op) => {
    const tx = texts(kind, lang);
    const parts = [`$lang ${op} ${goStr(lang)}`, `$dir ${op} ${goStr(RTL.includes(lang) ? 'rtl' : 'ltr')}`, ...keys.map((key) => `${varName(key)} ${op} ${goStr(tx[key])}`)];
    return parts.map((x) => `{{- ${x} -}}`).join('');
  };
  const lines = ['{{- $l := printf "%v" .Data.locale -}}', assign('en', ':=')];
  LANGS.filter((l) => l !== 'en').forEach((lang, i) => lines.push(`{{- ${i ? 'else if' : 'if'} eq $l ${goStr(lang)} -}}${assign(lang, '=')}`));
  lines.push('{{- end -}}');
  const v = { lang: '{{ $lang }}', dir: '{{ $dir }}', token: '{{ .Token }}', email: kind === 'email_change' ? '{{ .NewEmail }}' : '{{ .Email }}', siteUrl: '{{ .SiteURL }}', tokenHash: '{{ .TokenHash }}' };
  for (const key of keys) v[key] = `{{ ${varName(key)} }}`;
  return `${lines.join('\n')}\n${layout(kind, v)}`;
}

function goSubject(kind) {
  // Supabase validates the unrendered source, so a 15-language conditional
  // cannot fit its 255-character Subject field. Keep localization in the body.
  if (KINDS[kind].codeInSubject) return '{{ .Token }} · ONYX email confirmation';
  return prep('en', T.en[kind].subject);
}

/* ------------------------------------------------------------------ */
/* Minimal Go template interpreter – checks the generated templates     */
/* ------------------------------------------------------------------ */

/** Supports exactly what goTemplate/goSubject emit; anything else throws. */
function runGo(src, data) {
  const vars = new Map();
  const stack = []; // { taken, active }
  const active = () => stack.every((s) => s.active);
  let out = '';
  const re = /\{\{(-?)\s*([\s\S]*?)\s*(-?)\}\}/g;
  let last = 0;
  let trimNext = false;
  const lit = (s) => JSON.parse(s);
  const field = (path) => path.split('.').filter(Boolean).reduce((o, k) => (o == null ? undefined : o[k]), data);
  for (let m; (m = re.exec(src)); ) {
    let text = src.slice(last, m.index);
    if (trimNext) text = text.replace(/^\s+/, '');
    if (m[1]) text = text.replace(/\s+$/, '');
    if (active()) out += text;
    last = re.lastIndex;
    trimNext = Boolean(m[3]);
    const a = m[2];
    let mm;
    if ((mm = a.match(/^(?:(else) )?if eq (\$\w+) ("(?:[^"\\]|\\.)*")$/))) {
      const value = String(vars.get(mm[2]));
      if (mm[1]) {
        const top = stack[stack.length - 1];
        if (!top) throw new Error('else without if');
        top.active = !top.taken && value === lit(mm[3]);
        top.taken ||= top.active;
      } else {
        if (active() && !vars.has(mm[2])) throw new Error(`unknown ${mm[2]}`);
        const on = value === lit(mm[3]);
        stack.push({ taken: on, active: on });
      }
    } else if (a === 'else') {
      const top = stack[stack.length - 1];
      top.active = !top.taken;
      top.taken = true;
    } else if (a === 'end') {
      if (!stack.pop()) throw new Error('end without if');
    } else if ((mm = a.match(/^(\$\w+) (:?=) (.+)$/))) {
      if (!active()) continue;
      if (mm[2] === ':=' && stack.length) throw new Error(`:= inside a block: ${a}`);
      if (mm[2] === '=' && !vars.has(mm[1])) throw new Error(`assignment to undeclared ${mm[1]}`);
      const rhs = mm[3];
      const pf = rhs.match(/^printf "%v" \.([\w.]+)$/);
      vars.set(mm[1], pf ? String(field(pf[1]) ?? '<nil>') : lit(rhs));
    } else if ((mm = a.match(/^(\$\w+)$/))) {
      if (!active()) continue;
      if (!vars.has(mm[1])) throw new Error(`unknown ${mm[1]}`);
      out += vars.get(mm[1]);
    } else if ((mm = a.match(/^\.([\w.]+)$/))) {
      if (active()) out += field(mm[1]) ?? '';
    } else throw new Error(`unsupported action: {{ ${a} }}`);
  }
  if (stack.length) throw new Error('missing end');
  let tail = src.slice(last);
  if (trimNext) tail = tail.replace(/^\s+/, '');
  return out + tail;
}

/* ------------------------------------------------------------------ */
/* Build                                                               */
/* ------------------------------------------------------------------ */

const SAMPLE = { Token: '48291736', TokenHash: 'preview', SiteURL: 'https://onyxchat.site', Email: 'preview@onyx.invalid', NewEmail: 'new-preview@onyx.invalid' };
const LOCAL_LOGO = `data:image/png;base64,${readFileSync(join(root, 'public/brand/onyx-logo-512.png')).toString('base64')}`;

function preview(kind, lang) {
  const v = { lang, dir: RTL.includes(lang) ? 'rtl' : 'ltr', token: SAMPLE.Token, email: kind === 'email_change' ? SAMPLE.NewEmail : SAMPLE.Email, siteUrl: SAMPLE.SiteURL, tokenHash: SAMPLE.TokenHash, ...texts(kind, lang) };
  return layout(kind, v);
}

/** Check actual rendered destinations, not only equality with the preview. */
function verifyLinks(kind, html, data) {
  const links = [...html.matchAll(/<a\b[^>]*\bhref="([^"]+)"/g)];
  if (links.length !== 1) throw new Error(`${kind}: expected exactly one action link`);
  const link = new URL(links[0][1].replaceAll('&amp;', '&'));
  const expected = new URL(data.SiteURL);
  if (link.origin !== expected.origin || link.pathname !== expected.pathname || link.hash) {
    throw new Error(`${kind}: action does not lead directly to ONYX`);
  }
  if (KINDS[kind].code) {
    if (link.searchParams.get('token_hash') !== data.TokenHash || link.searchParams.get('type') !== KINDS[kind].type || [...link.searchParams].length !== 2) {
      throw new Error(`${kind}: wrong verification token or event type`);
    }
  } else if (link.search) throw new Error(`${kind}: security notification must not contain an authentication token`);
  if (!html.includes(`src="${LOGO}"`)) throw new Error(`${kind}: missing public ONYX logo`);
  if (/localhost|YOUR-PROJECT/.test(html)) throw new Error(`${kind}: development URL in production email`);
}

if (!resolve(previewDir).startsWith(resolve(root) + sep) || resolve(previewDir) !== resolve(root, 'supabase/templates/preview')) throw new Error('Preview cleanup target must stay inside this project');
rmSync(previewDir, { recursive: true, force: true });
mkdirSync(previewDir, { recursive: true });
mkdirSync(textDir, { recursive: true });

const subjects = [];
const textSections = [];
let checks = 0;
for (const kind of Object.keys(KINDS)) {
  const tpl = goTemplate(kind);
  const subject = goSubject(kind);
  if (subject.length > 255 || Buffer.byteLength(subject, 'utf8') > 255 || /[\r\n]/.test(subject)) throw new Error(`${kind}: Subject source exceeds the dashboard limit or contains a line break`);
  checks++;
  writeFileSync(join(outDir, `${kind}.html`), tpl);
  // No labels, Markdown or preview values in these files: select all and copy.
  writeFileSync(join(textDir, `${kind}.txt`), tpl);
  writeFileSync(join(textDir, `${kind}-subject.txt`), subject);
  textSections.push(`${'='.repeat(72)}\n${KINDS[kind].dashboard}\n${'='.repeat(72)}\n\nBETREFF (Subject):\n${subject}\n\nHTML-QUELLTEXT (Body / Source):\n${tpl}`);
  subjects.push({ kind, subject });

  for (const lang of LANGS) {
    const expected = preview(kind, lang);
    const got = runGo(tpl, { ...SAMPLE, Data: { locale: lang } });
    if (got !== expected) throw new Error(`${kind}/${lang}: template output differs from preview`);
    // The preview embeds the local logo, so it also works before the upload and from file://.
    writeFileSync(join(previewDir, `${kind}.${lang}.html`), expected.replaceAll(LOGO, LOCAL_LOGO));
    const subj = runGo(subject, { ...SAMPLE, Data: { locale: lang } });
    const want = KINDS[kind].codeInSubject ? `${SAMPLE.Token} · ONYX email confirmation` : prep('en', T.en[kind].subject);
    if (subj !== want) throw new Error(`${kind}/${lang}: subject "${subj}" ≠ "${want}"`);
    if (subj.length > 255 || /[\r\n]/.test(subj)) throw new Error(`${kind}/${lang}: rendered subject is invalid`);
    checks++;
    if (kind === 'email_change') {
      // Native anonymous users have no original Email; NewEmail carries the address being linked.
      const guest = runGo(tpl, { ...SAMPLE, Email: '', Data: { locale: lang } });
      if (guest !== expected || !guest.includes(SAMPLE.Token) || !guest.includes(SAMPLE.NewEmail)) throw new Error(`${kind}/${lang}: guest email is missing its code or new address`);
      verifyLinks(kind, guest, SAMPLE);
      checks++;
    }
    checks += 2;
    for (const SiteURL of ['https://onyxchat.site', 'https://onyxchat.site/']) {
      const data = { ...SAMPLE, SiteURL, Data: { locale: lang } };
      verifyLinks(kind, runGo(tpl, data), data);
      checks++;
    }
  }
  // Accounts without (or with an unknown) language get English.
  for (const data of [{}, { locale: 'xx' }, null]) {
    if (runGo(tpl, { ...SAMPLE, Data: data }) !== preview(kind, 'en')) throw new Error(`${kind}: fallback is not English`);
    if (runGo(subject, { ...SAMPLE, Data: data }) !== runGo(subject, { ...SAMPLE, Data: { locale: 'en' } })) throw new Error(`${kind}: invalid fallback subject`);
    checks++;
    checks++;
  }
  const kb = (Buffer.byteLength(tpl) / 1024).toFixed(1);
  console.log(`${kind}.html  ${kb} KB  (dashboard: ${KINDS[kind].dashboard})`);
}

writeFileSync(
  join(outDir, 'SUBJECTS.md'),
  `# Betreffzeilen der ONYX-Mails

Erzeugt von \`npm run emails\` – nicht von Hand ändern (Texte: \`src/strings.mjs\`).
Jede Zeile komplett in das Feld **Subject** des jeweiligen Reiters kopieren. Supabase erlaubt höchstens 255 Zeichen im ungerenderten Betreff. Deshalb sind diese Betreffzeilen kurz und englisch; der Mailinhalt bleibt in allen 15 Sprachen aus dem Konto (\`user_metadata.locale\`) verfügbar.

${subjects.map(({ kind, subject }) => `## ${KINDS[kind].dashboard} ← \`${kind}.html\`\n\n\`\`\`\n${subject}\n\`\`\`\n`).join('\n')}`,
);

writeFileSync(
  join(textDir, 'ONYX-Mailvorlagen.txt'),
  `ONYX – alle ${Object.keys(KINDS).length} Supabase-Mailvorlagen\n\nDie einzelnen Dateien <name>.txt enthalten nur den HTML-Quelltext für Body / Source.\nDie Dateien <name>-subject.txt enthalten nur den kurzen englischen Betreff für Subject (maximal 255 Zeichen).\nBeide jeweils vollständig kopieren und im passenden Supabase-Reiter speichern.\nAlle 15 Sprachen sind im Mailinhalt enthalten; die Go-Platzhalter unverändert lassen.\nDiese Sammeldatei dient als Übersicht: nicht komplett in eine einzige Vorlage einfügen.\n\n${textSections.join('\n\n')}`,
);

const cards = Object.keys(KINDS)
  .map((kind) => `<option value="${kind}">${KINDS[kind].dashboard}</option>`)
  .join('');
const langs = LANGS.map((l) => `<option value="${l}">${l}</option>`).join('');
writeFileSync(
  join(previewDir, 'index.html'),
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ONYX emails</title>
<style>
body{margin:0;background:#1b1f22;color:${C.text};font:14px/1.5 Inter,'Segoe UI',system-ui,sans-serif}
header{position:sticky;top:0;display:flex;gap:12px;align-items:center;flex-wrap:wrap;padding:12px 16px;background:#0b0f12;border-bottom:1px solid #232b31}
select{background:#161c21;color:#f1f5f6;border:1px solid #2c363d;border-radius:8px;padding:6px 10px;font:inherit}
main{display:flex;gap:24px;flex-wrap:wrap;justify-content:center;padding:24px 16px}
figure{margin:0}figcaption{margin-bottom:8px;color:${C.muted};font-size:12px}
iframe{border:0;border-radius:12px;background:#07090b;box-shadow:0 10px 40px rgba(0,0,0,.5)}
.d{width:640px;height:820px}.m{width:375px;height:820px}
@media (max-width:700px){.d{display:none}}
</style></head><body>
<header><strong>ONYX · auth emails</strong><select id="k">${cards}</select><select id="l">${langs}</select><span style="color:${C.muted}">Sample code ${SAMPLE.Token}</span></header>
<main><figure class="dfig"><figcaption>Desktop · 640 px</figcaption><iframe class="d" id="d"></iframe></figure><figure><figcaption>Phone · 375 px</figcaption><iframe class="m" id="m"></iframe></figure></main>
<script>
const k=document.getElementById('k'),l=document.getElementById('l');
const q=new URLSearchParams(location.hash.slice(1));if(q.get('k'))k.value=q.get('k');if(q.get('l'))l.value=q.get('l');
function show(){const src=k.value+'.'+l.value+'.html';d.src=src;m.src=src;location.hash='k='+k.value+'&l='+l.value}
k.onchange=l.onchange=show;show();
</script></body></html>
`,
);

console.log(`\n${checks} checks OK – templates render every language exactly like the preview.`);
console.log(`Logo: ${LOGO}`);
console.log(`Preview: ${join(previewDir, 'index.html')}`);
console.log(`Copy-ready text files: ${textDir}`);

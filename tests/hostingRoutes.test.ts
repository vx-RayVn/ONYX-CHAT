import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { reservedPaths } from '../website/routes.js';

// Check the actual Apache/LiteSpeed shortlink rules when physical paths are absent,
// as observed in front of Hostinger's managed Node server. Not an Apache emulator.
const rules = await readFile(new URL('../public/.htaccess', import.meta.url), 'utf8');
const exclusion = rules.match(/^\s*RewriteCond %\{REQUEST_URI\} !(\S+) \[NC\]\s*$/m);
const redirect = rules.match(/^\s*RewriteRule (\S+) \/invite\/\$1 \[R=302,L\]\s*$/m);
assert.ok(exclusion && redirect, 'Expected the real fallback shortlink rule');
const excluded = new RegExp(exclusion[1], 'i'), pattern = new RegExp(redirect[1]);
const target = (uri: string) => { const pathname = new URL(uri, 'https://onyxchat.site').pathname; return excluded.test(pathname) ? null : pathname.slice(1).match(pattern)?.[1] ?? null; };

test('Hostinger shortlinks never capture any reserved public or app route', () => {
  for (const name of reservedPaths) for (const suffix of ['', '/', '?from=fixture']) {
    assert.equal(target('/' + name + suffix), null, name + suffix);
    assert.equal(target('/' + name.toUpperCase() + suffix), null, name.toUpperCase() + suffix);
  }
});
test('Hostinger keeps real short invitations while leaving canonical and asset paths alone', () => {
  for (const url of ['/3ibbk3x7kh', '/3ibbk3x7kh/', '/i/3ibbk3x7kh', '/i/3ibbk3x7kh/']) assert.equal(target(url), '3ibbk3x7kh');
  for (const url of ['/', '/invite/3ibbk3x7kh', '/_onyx/health', '/assets/app-Test123.js', '/website/site.css', '/brand/favicon-32.png']) assert.equal(target(url), null, url);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { externalHttpUrl } from '../src/lib/externalUrl.ts';

test('message links refuse executable, relative, credential and control-character URLs', () => {
  for (const url of ['javascript:alert(1)', 'jAvAsCrIpT:alert(1)', 'java\nscript:alert(1)', 'data:text/html,<script>alert(1)</script>', 'vbscript:msgbox(1)', 'file:///a', '//example.org', '/app', 'https://user:pass@example.org', ' https://example.org', 'https://example.org/\u0000a', undefined, {}, 'https://example.org/' + 'a'.repeat(8200)]) assert.equal(externalHttpUrl(url), undefined);
  assert.equal(externalHttpUrl('https://example.org/a?b=1#c'), 'https://example.org/a?b=1#c');
  assert.equal(externalHttpUrl('http://example.org/a'), 'http://example.org/a');
});

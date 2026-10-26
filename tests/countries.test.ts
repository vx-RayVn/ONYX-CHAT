import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalCountryCode, countryOptions } from '../src/lib/countries.ts';

test('legacy country aliases use the actual flag region', () => {
  assert.equal(canonicalCountryCode('DD'), 'DE');
  assert.equal(canonicalCountryCode('uk'), 'GB');
  assert.equal(canonicalCountryCode(' FX '), 'FR');
  assert.equal(canonicalCountryCode('not-a-country'), '');
});

test('registration offers Germany once and stores DE rather than DD', () => {
  for (const language of ['de', 'en', 'ja', 'zh-CN']) {
    const options = countryOptions(language);
    assert.ok(options.some(({ code }) => code === 'DE'));
    assert.ok(!options.some(({ code }) => ['DD', 'UK', 'FX'].includes(code)));
    assert.equal(new Set(options.map(({ code }) => code)).size, options.length);
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { messageEmbeds } from '../src/lib/externalUrl.ts';

test('malformed remote embed JSON cannot become React children, actions or non-array fields', () => {
  assert.deepEqual(messageEmbeds(null), []);
  const result = messageEmbeds([null, 1, [], { title: { bad: true }, fields: 'not an array', action: { label: {}, url: 'javascript:alert(1)' } }, { fields: [null, {}, { name: {}, value: 'x' }, { name: 'Name', value: 'Value', inline: 'false' }], action: { label: 'Unsafe', url: 'javascript:alert(1)' }, color: 'red;position:fixed' }]);
  assert.equal(result.length, 2);
  assert.equal(result[0].title, undefined);
  assert.equal(result[0].fields, undefined);
  assert.equal(result[1].action, undefined);
  assert.equal(result[1].color, undefined);
  assert.deepEqual(result[1].fields, [{ name: 'Name', value: 'Value', inline: false }]);
});

test('remote embed bounds retain valid content and safe links', () => {
  const value = { title: 'a'.repeat(5000), fields: Array.from({ length: 30 }, () => ({ name: 'Name', value: 'Value', inline: true })), color: '#12abef', image: 'https://example.invalid/image.png', action: { label: 'Open', url: 'https://example.invalid/' } };
  const result = messageEmbeds(Array.from({ length: 20 }, () => value));
  assert.equal(result.length, 10);
  assert.equal(result[0].title?.length, 4096);
  assert.equal(result[0].fields?.length, 25);
  assert.equal(result[0].color, '#12abef');
  assert.equal(result[0].image, value.image);
  assert.deepEqual(result[0].action, value.action);
});

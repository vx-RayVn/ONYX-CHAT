import test from 'node:test';
import assert from 'node:assert/strict';
import { screenCaptureAvailability, screenCaptureFailure, screenCapturePlatform } from '../src/voice/screenCapture.ts';

test('screen capture uses actual capabilities, secure context and policy, not an OS version promise', () => {
  assert.equal(screenCaptureAvailability({ secure: true, capture: () => {} }), null);
  assert.equal(screenCaptureAvailability({ secure: true, capture: undefined }), 'unavailable');
  assert.equal(screenCaptureAvailability({ secure: false, capture: undefined }), 'insecure');
  assert.equal(screenCaptureAvailability({ secure: true, capture: () => {}, policyAllowed: false }), 'policy');
  assert.equal(screenCaptureAvailability({ secure: true, capture: () => {}, policyAllowed: true }), null);
});

test('help recognises iPhone, desktop-style iPad, Android tablet and the actual browser name', () => {
  assert.deepEqual(screenCapturePlatform('Mozilla/5.0 (iPhone; CPU iPhone OS 27_0 like Mac OS X) Version/27.0 Mobile/15E148 Safari/604.1'), { device: 'iphone', browser: 'Safari' });
  assert.deepEqual(screenCapturePlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X) Version/26.0 Safari/605.1.15', 'MacIntel', 5), { device: 'ipad', browser: 'Safari' });
  assert.deepEqual(screenCapturePlatform('Mozilla/5.0 (iPad; CPU OS 26_0) CriOS/150.0 Mobile Safari/604.1'), { device: 'ipad', browser: 'Chrome' });
  assert.deepEqual(screenCapturePlatform('Mozilla/5.0 (Linux; Android 15; Tablet) Chrome/156.0 Safari/537.36 SamsungBrowser/29.0'), { device: 'android', browser: 'Samsung Internet' });
  assert.deepEqual(screenCapturePlatform('Mozilla/5.0 (Linux; Android 15) Firefox/156.0'), { device: 'android', browser: 'Firefox' });
  assert.deepEqual(screenCapturePlatform('Mozilla/5.0 Chrome/156.0 Safari/537.36 EdgA/156.0'), { device: 'desktop', browser: 'Edge' });
  assert.deepEqual(screenCapturePlatform('Unknown'), { device: 'desktop', browser: null });
});

test('capture failures distinguish permissions, missing sources, OS restrictions and unexpected bugs', () => {
  for (const name of ['NotAllowedError', 'PermissionDeniedError', 'SecurityError']) assert.equal(screenCaptureFailure({ name }), 'permission');
  assert.equal(screenCaptureFailure({ name: 'AbortError' }), 'failed');
  assert.equal(screenCaptureFailure({ name: 'NotSupportedError' }), 'unsupported');
  assert.equal(screenCaptureFailure({ name: 'DeviceUnsupportedError' }), 'unsupported');
  assert.equal(screenCaptureFailure({ name: 'InvalidStateError' }), 'activation');
  assert.equal(screenCaptureFailure({ name: 'NotFoundError' }), 'source');
  assert.equal(screenCaptureFailure({ name: 'NotReadableError' }), 'busy');
  assert.equal(screenCaptureFailure(new TypeError('bad constraints')), 'failed');
  assert.equal(screenCaptureFailure(null), 'failed');
});

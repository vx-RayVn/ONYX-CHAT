import { test, expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { accessToken, roomService } from '../../supabase/functions/_shared/livekit.ts';

const cfg = { url: 'ws://127.0.0.1:7880', apiKey: process.env.ONYX_E2E_KEY!, apiSecret: process.env.ONYX_E2E_SECRET! };
const rooms = roomService(cfg);
declare global { interface Window { __onyxVoiceE2E: any } }
const state = (page: Page) => page.evaluate(() => window.__onyxVoiceE2E.state());

type CaptureFixture = { ua?: string; platform?: string; touch?: number; capture?: boolean; panel?: boolean; liveSettings?: boolean };
async function participant(browser: Browser, identity: string, mobile = false, capture: CaptureFixture = {}) {
  const context = await browser.newContext({ permissions: ['microphone', 'camera'], viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 },
    ...(mobile ? { isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Mobile Safari/537.36' } : {}),
    ...(capture.ua ? { userAgent: capture.ua } : {}) });
  if ((mobile && capture.capture !== true) || capture.capture === false) await context.addInitScript(() => Object.defineProperty(navigator.mediaDevices, 'getDisplayMedia', { configurable: true, value: undefined }));
  if (capture.platform || capture.touch !== undefined) await context.addInitScript(({ platform, touch }) => {
    if (platform) Object.defineProperty(navigator, 'platform', { value: platform });
    if (touch !== undefined) Object.defineProperty(navigator, 'maxTouchPoints', { value: touch });
  }, capture);
  // No real account or remote backend. Only token issuance/database indicators are fixtures;
  // media, signaling, permission changes and reconnection use the real local LiveKit server.
  await context.route('**/functions/v1/voice', async (route) => {
    const body = route.request().postDataJSON();
    const room = `${body.target === 'e2e-call' ? 'dm' : 'channel'}:${body.target}`;
    const token = await accessToken(cfg, identity, { roomJoin: true, room, canPublish: true, canSubscribe: true, canPublishData: false,
      canPublishSources: ['microphone', 'camera', 'screen_share', 'screen_share_audio'] }, 300);
    await route.fulfill({ json: { url: cfg.url, token, room, kind: body.target === 'e2e-call' ? 'dm' : 'channel', channelId: body.target,
      callId: 'e2e-call-id', callStarted: false, canSpeak: true, canVideo: true, canScreen: true, serverMute: false, serverDeaf: false } });
  });
  await context.route('**/rest/v1/rpc/voice_set_self', (route) => route.fulfill({ json: null }));
  const page = await context.newPage();
  const failures: string[] = [];
  page.on('pageerror', (e) => failures.push(e.message));
  await page.goto(`/?voice-e2e&identity=${identity}${capture.panel ? '&voice-panel' : ''}${capture.liveSettings ? '&live-settings' : ''}`);
  await page.waitForFunction(() => !!window.__onyxVoiceE2E);
  return { context, page, failures };
}

let contexts: BrowserContext[] = [];
test.afterEach(async () => {
  for (const context of contexts) {
    for (const page of context.pages()) await page.evaluate(() => window.__onyxVoiceE2E?.leave()).catch(() => {});
    await context.close();
  }
  contexts = [];
});

async function pair(browser: Browser, mobile = false, capture: CaptureFixture = {}) {
  const a = await participant(browser, 'alice', mobile, capture), b = await participant(browser, 'bob');
  contexts.push(a.context, b.context);
  await a.page.getByTestId('join-first').click();
  await b.page.getByTestId('join-first').click();
  await expect.poll(async () => (await state(a.page)).status).toBe('connected');
  await expect.poll(async () => (await state(b.page)).peers.length).toBe(1);
  return { a, b };
}

test('two contexts: receive real audio, mute, deafen, volume boost, output and leave', async ({ browser }) => {
  const { a, b } = await pair(browser);
  await expect.poll(() => b.page.evaluate(() => window.__onyxVoiceE2E.level('alice'))).toBeGreaterThan(0.01);
  await a.page.evaluate(() => window.__onyxVoiceE2E.mute());
  await expect.poll(async () => (await state(b.page)).peers[0]?.tracks.find((t: any) => t.source === 'microphone')?.muted).toBe(true);
  await a.page.evaluate(() => window.__onyxVoiceE2E.mute());
  await expect.poll(async () => (await state(b.page)).peers[0]?.tracks.find((t: any) => t.source === 'microphone')?.muted).toBe(false);
  await b.page.evaluate(() => window.__onyxVoiceE2E.volume('alice', 2));
  expect((await state(b.page)).peers[0].tracks.find((t: any) => t.source === 'microphone').volume).toBe(2);
  await b.page.evaluate(() => window.__onyxVoiceE2E.output());
  await b.page.evaluate(() => window.__onyxVoiceE2E.deafen());
  await expect.poll(async () => (await state(b.page)).peers[0]?.tracks.find((t: any) => t.source === 'microphone')?.enabled).toBe(false);
  expect((await state(b.page)).peers[0].tracks.find((t: any) => t.source === 'microphone').volume).toBe(0);
  await b.page.evaluate(() => window.__onyxVoiceE2E.deafen());
  await expect.poll(async () => (await state(b.page)).peers[0]?.tracks.find((t: any) => t.source === 'microphone')?.enabled).toBe(true);
  await a.page.evaluate(() => window.__onyxVoiceE2E.leave());
  await expect.poll(async () => (await state(b.page)).peers.length).toBe(0);
  expect((await state(a.page)).audioElements).toBe(0);
  expect(a.failures).toEqual([]); expect(b.failures).toEqual([]);
});

test('optional noise filter falls back on a local SFU and gain changes preserve audio', async ({ browser }) => {
  const { a, b } = await pair(browser);
  await expect.poll(async () => (await state(b.page)).peers[0]?.tracks.some((t: any) => t.source === 'microphone' && t.subscribed)).toBe(true);
  await a.page.evaluate(() => window.__onyxVoiceE2E.processing(true, 140));
  await expect.poll(async () => (await state(a.page)).noiseFilter).toBe('fallback');
  await expect.poll(() => b.page.evaluate(() => window.__onyxVoiceE2E.level('alice'))).toBeGreaterThan(0.001);
  await a.page.evaluate(() => window.__onyxVoiceE2E.processing(false, 100));
  await expect.poll(() => b.page.evaluate(() => window.__onyxVoiceE2E.level('alice'))).toBeGreaterThan(0.001);
  await a.page.evaluate(() => window.__onyxVoiceE2E.leave());
  expect((await state(a.page)).local).toEqual([]);
  expect(a.failures).toEqual([]);
});

test('App37 in-call noise selector updates the real capture without reconnecting or unmuting', async ({ browser }) => {
  const { a, b } = await pair(browser, false, { liveSettings: true });
  const capture = () => a.page.evaluate(() => {
    const publication = window.__onyxVoiceE2E.roomHandle().localParticipant.getTrackPublication('microphone');
    return { sid: publication.trackSid, noise: publication.track.getSourceTrackSettings().noiseSuppression, muted: publication.isMuted };
  });
  const initial = await capture();
  const choose = async (name: string) => {
    await a.page.getByRole('button', { name: 'Noise suppression', exact: true }).click();
    await a.page.getByRole('menuitemradio', { name, exact: false }).click();
    await expect(a.page.getByRole('menu')).toBeHidden();
  };
  await choose('Standard noise suppression');
  await expect.poll(async () => (await capture()).noise).toBe(true);
  await choose('Enhanced noise suppression (Krisp)');
  await expect.poll(async () => (await state(a.page)).noiseFilter).toBe('fallback');
  await expect.poll(() => b.page.evaluate(() => window.__onyxVoiceE2E.level('alice'))).toBeGreaterThan(0.001);
  expect((await capture()).sid).toBe(initial.sid);
  await a.page.evaluate(() => window.__onyxVoiceE2E.mute());
  await expect.poll(async () => (await capture()).muted).toBe(true);
  await choose('Off');
  await expect.poll(async () => (await capture()).noise).toBe(false);
  expect((await capture()).muted).toBe(true);
  expect((await capture()).sid).toBe(initial.sid);
  expect((await state(a.page)).status).toBe('connected');
  expect(a.failures).toEqual([]);
});

test('camera/screen publications and UpdateParticipant remove already published sources', async ({ browser }) => {
  const { a, b } = await pair(browser);
  await a.page.evaluate(() => window.__onyxVoiceE2E.camera(true));
  await expect.poll(async () => (await state(b.page)).peers[0]?.tracks.some((t: any) => t.source === 'camera' && t.subscribed)).toBe(true);
  await a.page.getByTestId('start-screen').click();
  await expect.poll(async () => (await state(b.page)).peers[0]?.tracks.some((t: any) => t.source === 'screen_share' && t.subscribed)).toBe(true);
  const room = (await state(a.page)).room;
  await rooms.updatePermission(room, 'alice', { canSubscribe: true, canPublishSources: ['camera'] });
  await expect.poll(async () => (await state(a.page)).grants).toEqual({ speak: false, video: true, screen: false });
  await expect.poll(async () => (await state(b.page)).peers[0]?.tracks.some((t: any) => t.source === 'microphone' || t.source === 'screen_share')).toBe(false);
  await rooms.updatePermission(room, 'alice', { canSubscribe: true, canPublishSources: ['microphone'] });
  await expect.poll(async () => (await state(a.page)).grants).toEqual({ speak: true, video: false, screen: false });
  await expect.poll(async () => (await state(b.page)).peers[0]?.tracks.some((t: any) => t.source === 'camera')).toBe(false);
  await expect.poll(() => b.page.evaluate(() => window.__onyxVoiceE2E.level('alice'))).toBeGreaterThan(0.01);
});

test('fast switches and leaving during camera capture do not keep a connection or tracks', async ({ browser }) => {
  const a = await participant(browser, 'alice'); contexts.push(a.context);
  await a.page.evaluate(async () => {
    const api = window.__onyxVoiceE2E;
    await Promise.all([api.join(), api.join('e2e-second')]);
  });
  await expect.poll(async () => (await state(a.page)).room).toBe('channel:e2e-second');
  await expect.poll(async () => (await state(a.page)).status).toBe('connected');
  await a.page.evaluate(async () => { const api = window.__onyxVoiceE2E; await Promise.all([api.camera(true), api.leave()]); });
  await expect.poll(async () => (await state(a.page)).status).toBe('idle');
  expect((await state(a.page)).self.camera).toBe(false);
  expect((await state(a.page)).local).toEqual([]);
  expect((await state(a.page)).audioElements).toBe(0);
});

test('phone viewport: channel and call controls stay inside the viewport', async ({ browser }) => {
  const { a, b } = await pair(browser, true);
  await expect(a.page.locator('.voice-notice')).toHaveCount(0);
  await a.page.locator('.vcontrols').getByRole('button', { name: 'Share screen', exact: true }).click();
  await expect(a.page.getByText('Screen sharing unavailable', { exact: true })).toBeVisible();
  const help = a.page.getByRole('dialog', { name: 'Screen sharing unavailable' });
  await expect(help.getByText('Chrome on this Android device does not provide screen capture to websites. ONYX cannot enable a feature missing from the browser.', { exact: true })).toBeVisible();
  await expect(help.getByText('Your call stays connected. You can still watch other people’s streams.', { exact: true })).toBeVisible();
  expect((await state(a.page)).status).toBe('connected');
  await a.page.screenshot({ path: 'test-results/screen-help-android.png' });
  await help.getByRole('button', { name: 'Got it', exact: true }).click();
  for (const label of ['Microphone', 'Sound', 'Camera', 'Disconnect']) {
    const control = a.page.getByRole('button', { name: label, exact: true }).first();
    await expect(control).toBeVisible();
    const box = await control.boundingBox(); expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.x + box!.width).toBeLessThanOrEqual(391);
  }
  await a.page.getByTestId('call').click();
  await b.page.getByTestId('call').click();
  await expect.poll(async () => (await state(a.page)).peers.length).toBe(1);
  await expect.poll(async () => (await state(a.page)).status).toBe('connected');
  await expect(a.page.getByRole('button', { name: 'Hang up', exact: true })).toBeVisible();
  expect(await a.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await a.page.screenshot({ path: 'test-results/chromium-mobile-call.png' });
  await a.page.setViewportSize({ width: 844, height: 390 });
  const hangup = await a.page.getByRole('button', { name: 'Hang up', exact: true }).boundingBox();
  expect(hangup!.y).toBeGreaterThanOrEqual(0);
  expect(hangup!.y + hangup!.height).toBeLessThanOrEqual(390);
  await a.page.screenshot({ path: 'test-results/chromium-mobile-call-landscape.png' });
});

for (const fixture of [
  { name: 'iphone', ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 Version/26.0 Mobile/15E148 Safari/604.1', device: 'iPhone', browser: 'Safari' },
  { name: 'ipad', ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Version/26.0 Safari/605.1.15', platform: 'MacIntel', touch: 5, device: 'iPad', browser: 'Safari' },
  { name: 'desktop', ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:156.0) Gecko/20100101 Firefox/156.0', device: '', browser: 'Firefox' },
]) {
  test(`${fixture.name}: missing capture gets device-specific help only on request, including the sidebar`, async ({ browser }) => {
    const a = await participant(browser, 'alice', fixture.name !== 'desktop', { ...fixture, capture: false, panel: true }); contexts.push(a.context);
    if (fixture.name === 'ipad') await a.page.setViewportSize({ width: 768, height: 1024 });
    await a.page.getByTestId('join-first').click();
    await expect.poll(async () => (await state(a.page)).status).toBe('connected');
    await expect(a.page.getByRole('dialog')).toHaveCount(0);
    await expect(a.page.locator('.voice-notice')).toHaveCount(0);
    await a.page.locator('.vcontrols').getByRole('button', { name: 'Share screen', exact: true }).click();
    const dialog = a.page.getByRole('dialog', { name: 'Screen sharing unavailable' });
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveCSS('opacity', '1');
    await expect(dialog).toContainText(fixture.device ? `${fixture.browser} on this ${fixture.device} does not provide screen capture` : 'Firefox does not provide screen capture');
    await expect(dialog).toContainText('Your call stays connected.');
    await a.page.screenshot({ path: `test-results/screen-help-${fixture.name}.png` });
    if (fixture.name === 'iphone') {
      await a.page.setViewportSize({ width: 844, height: 390 });
      const box = await dialog.boundingBox();
      expect(box!.y).toBeGreaterThanOrEqual(0);
      expect(box!.y + box!.height).toBeLessThanOrEqual(391);
      await expect(dialog.getByRole('button', { name: 'Got it', exact: true })).toBeInViewport();
    }
    await dialog.getByRole('button', { name: 'Got it', exact: true }).click();
    await a.page.locator('.voice-panel').getByRole('button', { name: 'Share screen', exact: true }).click();
    await expect(dialog).toBeVisible();
    expect((await state(a.page)).status).toBe('connected');
    expect((await state(a.page)).self.screen).toBe(false);
    if (fixture.name === 'iphone' || fixture.name === 'ipad') {
      await dialog.getByRole('button', { name: 'Got it', exact: true }).click();
      if (fixture.name === 'iphone') await a.page.setViewportSize({ width: 390, height: 844 });
      const language = fixture.name === 'iphone' ? 'de' : 'ar';
      await a.page.evaluate(async (lang) => {
        const i18n = await import('/src/i18n/index.ts');
        await i18n.loadLanguage(lang);
      }, language);
      await a.page.locator('.voice-panel').getByRole('button', { name: 'Share screen', exact: true }).click();
      const translated = a.page.getByRole('dialog');
      await expect(translated).toHaveCSS('opacity', '1');
      await expect(translated).toContainText(fixture.name === 'iphone' ? 'Safari auf diesem iPhone' : 'Safari');
      expect(await a.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const translatedBox = await translated.boundingBox();
      const viewportWidth = await a.page.evaluate(() => innerWidth);
      expect(translatedBox!.x).toBeGreaterThanOrEqual(0);
      expect(translatedBox!.x + translatedBox!.width).toBeLessThanOrEqual(viewportWidth + 1);
      await a.page.screenshot({ path: `test-results/screen-help-${fixture.name}-${language}.png` });
    }
    expect(a.failures).toEqual([]);
  });
}

test('mobile Safari-shaped capabilities can really publish: no blanket mobile or version block', async ({ browser }) => {
  // Chromium with mobile/Safari identifiers checks our feature decision, NOT the real iOS implementation.
  const { a, b } = await pair(browser, true, { capture: true, ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 27_0 like Mac OS X) AppleWebKit/605.1.15 Version/27.0 Mobile/15E148 Safari/604.1' });
  expect((await state(a.page)).support.screenShare).toBe(true);
  await a.page.locator('.vcontrols').getByRole('button', { name: 'Share screen', exact: true }).click();
  await expect(a.page.getByText('This browser can share the picture, but not screen audio. You can still speak through your microphone.', { exact: true })).toBeVisible();
  await a.page.getByRole('menuitem', { name: /Sharp – for text and code/ }).click();
  await expect.poll(async () => (await state(b.page)).peers[0]?.tracks.some((track: any) => track.source === 'screen_share' && track.subscribed)).toBe(true);
  await expect(a.page.getByRole('dialog')).toHaveCount(0);
  await a.page.locator('.vcontrols').getByRole('button', { name: 'Share screen', exact: true }).click();
  await expect.poll(async () => (await state(a.page)).self.screen).toBe(false);
  expect((await state(a.page)).status).toBe('connected');
  expect(a.failures).toEqual([]);
});

test('capture errors stay honest and never interrupt the ongoing audio call', async ({ browser }) => {
  const { a, b } = await pair(browser);
  for (const [name, text] of [
    ['NotAllowedError', 'Screen sharing was cancelled or permission was denied.'],
    ['NotSupportedError', 'The browser reported that this type of screen capture is not supported.'],
    ['InvalidStateError', 'Return to the ONYX tab'],
    ['NotFoundError', 'The browser could not find a screen, window or tab to share.'],
    ['NotReadableError', 'The operating system could not start screen capture.'],
    ['TypeError', 'Screen capture failed unexpectedly.'],
  ]) {
    await a.page.evaluate((errorName) => Object.defineProperty(navigator.mediaDevices, 'getDisplayMedia', {
      configurable: true, value: () => Promise.reject(new DOMException('Synthetic local capture failure', errorName)),
    }), name);
    await a.page.locator('.vcontrols').getByRole('button', { name: 'Share screen', exact: true }).click();
    await a.page.getByRole('menuitem', { name: /Sharp – for text and code/ }).click();
    const dialog = a.page.getByRole('dialog', { name: 'Screen sharing unavailable' });
    await expect(dialog).toContainText(text);
    expect((await state(a.page)).self.screen).toBe(false);
    expect((await state(a.page)).status).toBe('connected');
    await dialog.getByRole('button', { name: 'Got it', exact: true }).click();
  }
  await expect.poll(() => b.page.evaluate(() => window.__onyxVoiceE2E.level('alice'))).toBeGreaterThan(0.001);
  expect(a.failures).toEqual([]);
});

test('real Room API: missing room is harmless and signed webhook int64 fields map correctly', async ({ browser }) => {
  expect(await rooms.listParticipants(`missing-${process.env.ONYX_E2E_RUN}`)).toEqual([]);
  await rooms.removeParticipant(`missing-${process.env.ONYX_E2E_RUN}`, 'missing');
  const { a } = await pair(browser);
  const room = (await state(a.page)).room;
  await expect.poll(async () => {
    const events = await (await fetch('http://127.0.0.1:7891')).json();
    return events.filter((e: any) => e.raw.event === 'participant_joined' && e.raw.room?.name === room && e.raw.participant?.identity === 'alice').length;
  }).toBeGreaterThan(0);
  const events = await (await fetch('http://127.0.0.1:7891')).json();
  const joined = events.findLast((e: any) => e.raw.event === 'participant_joined' && e.raw.participant?.identity === 'alice');
  expect(joined.mapped.identity).toBe('alice'); expect(Number.isFinite(joined.mapped.at)).toBe(true);
  expect(joined.mapped.at).toBeGreaterThan(Date.now() / 1000 - 60);
  await test.info().attach('actual-webhook-format', { body: JSON.stringify(joined.raw, null, 2), contentType: 'application/json' });
});

test('reload restores only the channel, while explicit leave clears the destination', async ({ browser }) => {
  const a = await participant(browser, 'alice'); contexts.push(a.context);
  await a.page.getByTestId('join-first').click();
  await expect.poll(async () => (await state(a.page)).status).toBe('connected');
  const room = (await state(a.page)).room;
  await a.page.reload();
  await expect.poll(async () => (await state(a.page)).status).toBe('connected');
  expect((await state(a.page)).room).toBe(room);
  expect((await state(a.page)).self.camera).toBe(false);
  await a.page.evaluate(() => window.__onyxVoiceE2E.leave());
  expect(await a.page.evaluate(() => localStorage.getItem('onyx-voice-resume'))).toBeNull();
  await a.page.reload();
  await a.page.waitForFunction(() => !!window.__onyxVoiceE2E);
  expect((await state(a.page)).status).toBe('idle');
});

test('a delayed old disconnect cannot overwrite the next room or remove its audio', async ({ browser }) => {
  const { a, b } = await pair(browser);
  await a.page.evaluate(() => {
    const api = window.__onyxVoiceE2E, old = api.roomHandle(), original = old.disconnect.bind(old);
    old.disconnect = async (...args: any[]) => { await original(...args); await new Promise((resolve) => { api.releaseDisconnect = resolve; }); };
    void api.join('e2e-second');
  });
  await a.page.waitForFunction(() => !!window.__onyxVoiceE2E.releaseDisconnect);
  await a.page.evaluate(() => window.__onyxVoiceE2E.join('e2e-third'));
  await a.page.evaluate(() => window.__onyxVoiceE2E.releaseDisconnect());
  await expect.poll(async () => (await state(a.page)).room).toBe('channel:e2e-third');
  await expect.poll(async () => (await state(a.page)).status).toBe('connected');
  await b.page.evaluate(() => window.__onyxVoiceE2E.join('e2e-third'));
  await expect.poll(() => a.page.evaluate(() => window.__onyxVoiceE2E.level('bob'))).toBeGreaterThan(0.01);
});

test('local preview: a microphone permission request finishing after leave stops every track', async ({ browser }) => {
  const a = await participant(browser, 'alice'); contexts.push(a.context);
  await a.context.addInitScript(() => {
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    const w = window as any;
    w.capturedMedia = [];
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      const stream = await original(constraints);
      w.capturedMedia.push(...stream.getTracks());
      await new Promise((resolve) => { w.releaseCapture = resolve; });
      return stream;
    };
  });
  await a.page.goto('/?voice-e2e&identity=alice&local');
  await a.page.waitForFunction(() => !!window.__onyxVoiceE2E);
  await a.page.getByTestId('join-first').click();
  await a.page.waitForFunction(() => !!(window as any).releaseCapture);
  await a.page.evaluate(() => window.__onyxVoiceE2E.leave());
  await a.page.evaluate(() => (window as any).releaseCapture());
  await expect.poll(() => a.page.evaluate(() => (window as any).capturedMedia.every((track: MediaStreamTrack) => track.readyState === 'ended'))).toBe(true);
  expect((await state(a.page)).status).toBe('idle');
});

test('signaling network interruption reconnects and resumes audio', async ({ browser }) => {
  const a = await participant(browser, 'alice'), b = await participant(browser, 'bob'); contexts.push(a.context, b.context);
  const sockets: any[] = [];
  let offline = false;
  await a.page.routeWebSocket(/127\.0\.0\.1:7880/, (socket) => {
    if (offline) { socket.close({ code: 1011, reason: 'test network offline' }); return; }
    const server = socket.connectToServer(); sockets.push({ socket, server });
  });
  await a.page.getByTestId('join-first').click(); await b.page.getByTestId('join-first').click();
  await expect.poll(() => b.page.evaluate(() => window.__onyxVoiceE2E.level('alice'))).toBeGreaterThan(0.01);
  offline = true;
  for (const { socket, server } of sockets) { socket.close({ code: 1011 }); server.close({ code: 1011 }); }
  await expect.poll(async () => (await state(a.page)).status).toBe('reconnecting');
  offline = false;
  await expect.poll(async () => (await state(a.page)).status, { timeout: 30_000 }).toBe('connected');
  await expect.poll(() => b.page.evaluate(() => window.__onyxVoiceE2E.level('alice'))).toBeGreaterThan(0.01);
});

test('an elsewhere broadcast during token issuance cannot cancel its own new join', async ({ browser }) => {
  const a = await participant(browser, 'alice'); contexts.push(a.context);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await a.page.route('**/functions/v1/voice', async (route) => { await gate; await route.fallback(); });
  await a.page.evaluate(() => { void window.__onyxVoiceE2E.join(); });
  await expect.poll(async () => (await state(a.page)).status).toBe('connecting');
  await a.page.evaluate(() => window.__onyxVoiceE2E.elsewhere('channel:c_onyx_lounge'));
  release();
  await expect.poll(async () => (await state(a.page)).status).toBe('connected');
  await a.page.evaluate(() => window.__onyxVoiceE2E.elsewhere('channel:c_onyx_lounge'));
  await expect.poll(async () => (await state(a.page)).status).toBe('idle');
});

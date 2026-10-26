import { test, expect } from '@playwright/test';
import { accessToken } from '../../supabase/functions/_shared/livekit.ts';

test('browser engine: two real media connections, camera, deafen and mobile layout', async ({ browser, browserName }) => {
  const contexts = [];
  try {
    const pages = [];
    for (const identity of ['alice', 'bob']) {
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, ...(browserName === 'firefox' ? {} : { permissions: ['microphone', 'camera'] }) });
      contexts.push(context);
      await context.route('**/functions/v1/voice', async (route) => {
        const room = `channel:${route.request().postDataJSON().target}`;
        const cfg = { url: 'ws://127.0.0.1:7880', apiKey: process.env.ONYX_E2E_KEY!, apiSecret: process.env.ONYX_E2E_SECRET! };
        const token = await accessToken(cfg, identity, { roomJoin: true, room, canPublish: true, canSubscribe: true, canPublishSources: ['microphone', 'camera'] }, 300);
        await route.fulfill({ json: { url: cfg.url, token, room, kind: 'channel', canSpeak: true, canVideo: true, canScreen: false } });
      });
      await context.route('**/rest/v1/rpc/voice_set_self', (route) => route.fulfill({ json: null }));
      const page = await context.newPage(); pages.push(page);
      await page.goto(`/?voice-e2e&identity=${identity}`);
      await page.waitForFunction(() => !!window.__onyxVoiceE2E);
      if (!(await page.evaluate(() => window.__onyxVoiceE2E.state().support.rtc))) {
        // Windows' Playwright WebKit port has no WebRTC. Verify the honest UI,
        // keep this explicitly separate from a Safari media test.
        expect(browserName).toBe('webkit');
        await page.setViewportSize({ width: 390, height: 844 });
        await expect(page.getByRole('button', { name: 'Join voice channel', exact: true }).last()).toBeDisabled();
        await expect(page.getByText('This browser can’t connect to voice or video calls. Try a current version of Chrome, Edge, Firefox or Safari.', { exact: true })).toBeVisible();
        await test.info().attach('platform-limit', { body: 'Windows WebKit: no WebRTC implementation; layout/unsupported UI checked. Real Safari media remains a device test.', contentType: 'text/plain' });
        return;
      }
      await page.getByTestId('join-first').click();
      await expect.poll(() => page.evaluate(() => window.__onyxVoiceE2E.state().status)).toBe('connected');
    }
    const [a, b] = pages;
    await a.evaluate(() => window.__onyxVoiceE2E.sound());
    if (await a.evaluate(() => !('setSinkId' in AudioContext.prototype) && 'setSinkId' in HTMLMediaElement.prototype)) {
      expect(await a.evaluate(() => (document.querySelector('#onyx-voice-sounds') as HTMLAudioElement)?.srcObject instanceof MediaStream)).toBe(true);
    }
    await a.evaluate(() => window.__onyxVoiceE2E.stopSounds());
    expect(await a.locator('#onyx-voice-sounds').count()).toBe(0);
    await expect.poll(() => b.evaluate(() => window.__onyxVoiceE2E.state().peers[0]?.tracks.some((p: any) => p.source === 'microphone' && p.subscribed))).toBe(true);
    await expect.poll(() => b.evaluate(() => window.__onyxVoiceE2E.level('alice'))).toBeGreaterThan(0.001);
    await a.bringToFront();
    await a.getByRole('button', { name: 'Camera', exact: true }).click();
    try {
      await expect.poll(() => b.evaluate(() => window.__onyxVoiceE2E.state().peers[0]?.tracks.some((p: any) => p.source === 'camera' && p.subscribed))).toBe(true);
    } catch (error) {
      await test.info().attach('media-state', { body: JSON.stringify({ a: await a.evaluate(() => window.__onyxVoiceE2E.state()), b: await b.evaluate(() => window.__onyxVoiceE2E.state()) }), contentType: 'application/json' });
      throw error;
    }
    await b.getByRole('button', { name: 'Sound', exact: true }).click();
    await expect.poll(() => b.evaluate(() => window.__onyxVoiceE2E.state().peers[0]?.tracks.find((p: any) => p.source === 'microphone')?.enabled)).toBe(false);
    await a.setViewportSize({ width: 390, height: 844 });
    expect(await a.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await a.screenshot({ path: `test-results/${browserName}-voice-mobile.png` });
    await a.getByTestId('call').click();
    await b.getByTestId('call').click();
    await expect.poll(() => a.evaluate(() => window.__onyxVoiceE2E.state().status)).toBe('connected');
    await expect.poll(() => a.evaluate(() => window.__onyxVoiceE2E.state().peers.length)).toBe(1);
    await expect(a.getByRole('button', { name: 'Hang up', exact: true })).toBeVisible();
    expect(await a.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await a.screenshot({ path: `test-results/${browserName}-call-mobile.png` });
    for (const page of pages) await page.evaluate(() => window.__onyxVoiceE2E.leave());
    await expect.poll(() => a.evaluate(() => window.__onyxVoiceE2E.state().audioElements)).toBe(0);
  } finally { for (const context of contexts) await context.close(); }
});

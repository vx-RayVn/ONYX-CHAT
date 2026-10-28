import { defineConfig } from '@playwright/test';
import path from 'node:path';

export default defineConfig({
  testDir: '.', testMatch: '*.spec.ts', fullyParallel: false, workers: 1, timeout: 60_000,
  expect: { timeout: 15_000 }, reporter: 'list', use: { baseURL: 'http://127.0.0.1:5173', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', testMatch: 'voice.spec.ts', use: { browserName: 'chromium', permissions: ['microphone', 'camera'], launchOptions: { args: [
    '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream',
    `--use-file-for-fake-audio-capture=${path.join(process.cwd(), '.tools/voice-tone.wav')}`,
    '--autoplay-policy=no-user-gesture-required', '--auto-select-desktop-capture-source=Entire screen',
  ] } } },
  { name: 'edge', testMatch: 'platform.spec.ts', use: { browserName: 'chromium', channel: 'msedge', launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required', '--disable-gpu', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding'] } } },
  { name: 'firefox', testMatch: 'platform.spec.ts', use: { browserName: 'firefox', launchOptions: { firefoxUserPrefs: { 'media.navigator.streams.fake': true, 'media.navigator.permission.disabled': true, 'media.autoplay.default': 0 } } } },
  { name: 'webkit', testMatch: 'platform.spec.ts', use: { browserName: 'webkit' } },
  { name: 'mobile', testMatch: ['mobile.spec.ts','game-activity.spec.ts','website.spec.ts','website-native.spec.ts','bugs.spec.ts','app14.spec.ts','account-security.spec.ts','guest-access.spec.ts','touch-polish.spec.ts','account-switching.spec.ts','auth-entry.spec.ts','realtime.spec.ts','discovery-folders.spec.ts','commerce.spec.ts','release-polish.spec.ts','commerce-polish36.spec.ts','call-layout37.spec.ts','security.spec.ts','deletion.spec.ts'], use: { browserName:'chromium', viewport:{width:390,height:844},hasTouch:true,isMobile:true } },
  { name: 'mobile-webkit', testMatch:['mobile.spec.ts','game-activity.spec.ts','website.spec.ts','website-native.spec.ts','bugs.spec.ts','app14.spec.ts','account-security.spec.ts','guest-access.spec.ts','touch-polish.spec.ts','account-switching.spec.ts','auth-entry.spec.ts','realtime.spec.ts','discovery-folders.spec.ts','commerce.spec.ts','release-polish.spec.ts','commerce-polish36.spec.ts','call-layout37.spec.ts','security.spec.ts','deletion.spec.ts'],use:{browserName:'webkit',viewport:{width:390,height:844},hasTouch:true,isMobile:true} },
  { name: 'ui', testMatch: ['ui.spec.ts','game-activity.spec.ts','website.spec.ts','website-native.spec.ts','bugs.spec.ts','app14.spec.ts','account-security.spec.ts','guest-access.spec.ts','touch-polish.spec.ts','account-switching.spec.ts','auth-entry.spec.ts','realtime.spec.ts','discovery-folders.spec.ts','commerce.spec.ts','release-polish.spec.ts','commerce-polish36.spec.ts','call-layout37.spec.ts','security.spec.ts','deletion.spec.ts'], use: { browserName: 'chromium' } },
  { name: 'ui-firefox', testMatch: ['ui.spec.ts','game-activity.spec.ts','website.spec.ts','website-native.spec.ts','bugs.spec.ts','app14.spec.ts','account-security.spec.ts','guest-access.spec.ts','touch-polish.spec.ts','account-switching.spec.ts','auth-entry.spec.ts','realtime.spec.ts','discovery-folders.spec.ts','commerce.spec.ts','release-polish.spec.ts','commerce-polish36.spec.ts','call-layout37.spec.ts','security.spec.ts','deletion.spec.ts'], use: { browserName: 'firefox' } },
  { name: 'ui-webkit', testMatch: ['ui.spec.ts','game-activity.spec.ts','website.spec.ts','website-native.spec.ts','bugs.spec.ts','app14.spec.ts','account-security.spec.ts','guest-access.spec.ts','touch-polish.spec.ts','account-switching.spec.ts','auth-entry.spec.ts','realtime.spec.ts','discovery-folders.spec.ts','commerce.spec.ts','release-polish.spec.ts','commerce-polish36.spec.ts','call-layout37.spec.ts','security.spec.ts','deletion.spec.ts'], use: { browserName: 'webkit' } }],
});

import { test, expect } from '@playwright/test';

test('untrusted embed actions cannot launch executable URLs', async ({ page }) => {
  await page.route('https://**', route => route.fulfill({ status: 204 }));
  await page.route('**/rest/v1/**', route => route.fulfill({ json: [] }));
  await page.route('**/functions/v1/**', route => route.fulfill({ status: 401, json: {} }));
  await page.goto('/app?ui-e2e');
  await page.evaluate(async () => {
    const { useStore } = await import('/src/store/store.ts');
    useStore.setState(state => {
      const channel = Object.values(state.channels).find(c => c.type === 'text');
      if (!channel) throw Error('Synthetic text channel missing');
      state.view = { kind: 'server', serverId: channel.serverId, channelId: channel.id };
      state.messages[channel.id] = [{ id: 'synthetic-unsafe-embed', channelId: channel.id, authorId: state.meId, content: '[Synthetic masked link](https://example.invalid/destination)', type: 'default', createdAt: Date.now(), attachments: [], reactions: [], embeds: [
        { title: 'Unsafe synthetic link', url: 'javascript:window.__unsafe=1', action: { label: 'Unsafe action', url: 'javascript:window.__unsafe=1' } },
        { title: 'Safe synthetic link', url: 'https://example.invalid/', action: { label: 'Safe action', url: 'https://example.invalid/' } },
      ] }];
    });
    const { useUI } = await import('/src/store/ui.ts');
    useUI.getState().setMobilePanel('main');
  });
  await expect(page.getByText('Unsafe synthetic link', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Unsafe synthetic link' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Unsafe action' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Safe synthetic link' })).toHaveAttribute('href', 'https://example.invalid/');
  await expect(page.getByRole('button', { name: 'Safe action' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Synthetic masked link' })).toHaveAttribute('title', 'https://example.invalid/destination');
  expect(await page.evaluate(() => (window as any).__unsafe)).toBeUndefined();
});

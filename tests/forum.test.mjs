import test from 'node:test';
import assert from 'node:assert/strict';
import { createHarness } from './harness.mjs';
import { createPhoneStore } from '../src/store.js';
import { createContextReader } from '../src/context.js';
import { createApiSettings, createModelClient } from '../src/api.js';
import { createForumService } from '../src/forum.js';

test('refresh replaces the batch; reading posts is free and preserves main messages', async () => {
  const main = [{ mes: '在街上散步。', is_user: false }];
  const h = createHarness({ messages: main, settings: { qianqianjie: { apiUrl: 'https://example.invalid', apiKey: 'key', apiModel: 'm' } }, completion: { choices: [{ message: { content: '{"posts":[{"title":"晚风","author":"路人甲","content":"今晚很凉快","comments":[{"author":"路人乙","text":"适合散步"}]},{"title":"小店","author":"路人丙","content":"新开了一家面馆"}]}' } }] } });
  const target = h.host.captureChat(), store = createPhoneStore({ target });
  await store.replaceForum([{ id: 'old', title: '旧帖' }]);
  const service = createForumService({ store, contextReader: createContextReader({ target, store }), modelClient: createModelClient({ host: h.host, sourceProvider: createApiSettings({ host: h.host }) }) });
  assert.equal(h.modelRequests.length, 0);
  await service.refresh();
  assert.equal(store.read().forum.posts.length, 2);
  assert.equal(service.getPost('old'), undefined);
  assert.equal(service.getPost(store.read().forum.posts[0].id).comments[0].text, '适合散步');
  assert.equal(h.modelRequests.length, 1);
  assert.deepEqual(main, [{ mes: '在街上散步。', is_user: false }]);
});

import { parsePayload } from './api.js';
import { FORUM_PROMPT } from './prompts.js';

export function createForumService({ store, contextReader, modelClient }) {
  return {
    getPost: id => store.read().forum.posts.find(x => x.id === id),
    async refresh() {
      const context = await contextReader.readForForum();
      const reply = await modelClient.complete({
        system: FORUM_PROMPT,
        messages: [{ role: 'user', content: JSON.stringify(context) }],
      });
      const posts = parsePayload(reply, 'forum').map(x => ({ ...x, id: globalThis.crypto.randomUUID() }));
      await store.replaceForum(posts);
      return posts;
    },
  };
}

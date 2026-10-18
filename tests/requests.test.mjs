import test from 'node:test';
import assert from 'node:assert/strict';
import { createHostAdapter } from '../src/host.js';

test('requests use the current fetch chain when a logger installs after the phone', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => Response.json({ path: 'before-logger' });
    const host = createHostAdapter({ contextProvider: () => ({ getRequestHeaders: () => ({}) }) });
    globalThis.fetch = async () => Response.json({ path: 'through-logger' });
    assert.deepEqual(await (await host.request('/offline-test', {})).json(), { path: 'through-logger' });
  } finally { globalThis.fetch = original; }
});

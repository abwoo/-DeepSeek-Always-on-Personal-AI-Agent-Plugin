import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Context } from '@deepseek-ai/cordis';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import * as core from '../../src/host/index.js';

test('real Cordis lifecycle: core Fetch routes and durable memory work without an HTTP server', async () => {
  const ctx = new Context();
  const dir = await mkdtemp(join(tmpdir(), 'always-on-carrier-'));
  const routes = new Map<string, { fetch: (request: Request) => Promise<Response> }>();
  // Peer services are fixtures. Cordis, plugin startup/disposal, API and SQLite are real.
  const release = Object.entries({
    schedule: { catalog: async () => [] },
    agents: { list: () => [] },
    sessions: {},
    tools: { guard: () => {}, register: () => {} },
    systemPrompt: {},
    connection: { fetch: { register: (route: any) => {
      routes.set(route.path, route);
      return () => routes.delete(route.path);
    } } },
  }).map(([key, value]) => ctx.provide(key, value));
  const fiber = ctx.plugin(core, { dataDir: dir });
  try {
    await fiber.await();
    assert.equal(fiber.state, 2, 'Core must activate over native Connection without webServer');
    const route = routes.get('/api/always-on');
    assert.ok(route);
    assert.ok(routes.has('/api/always-on-sw.js'));
    const read = async () => {
      const response = await route.fetch(new Request('https://carrier.invalid/api/always-on'));
      assert.equal(response.status, 200);
      return response.json();
    };
    assert.equal((await read()).online, true);
    const saved = await route.fetch(new Request('https://carrier.invalid/api/always-on', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'memory.save', data: {
        kind: 'fact', content: 'Consented native-carrier memory', source: 'Explicit test user', consent: true,
      } }),
    }));
    assert.equal(saved.status, 200);
    const memoryId = (await saved.json()).result.id;
    assert.ok(memoryId);
    const removeServer = ctx.provide('webServer', {});
    await fiber.await();
    removeServer();
    await fiber.await();
    assert.equal(fiber.state, 2);
    assert.equal(routes.get('/api/always-on'), route, 'HTTP service lifecycle must not unload native routes');
    assert.ok((await read()).memories.some((memory: any) => memory.id === memoryId));
  } finally {
    await fiber.dispose();
    assert.equal(routes.size, 0, 'Core disposal must release both native routes');
    release.reverse().forEach(dispose => dispose());
    await rm(dir, { recursive: true, force: true });
  }
});

test('real Cordis lifecycle: Always-on readiness is withheld until native recovery completes', async () => {
  const ctx = new Context();
  const dir = await mkdtemp(join(tmpdir(), 'always-on-readiness-'));
  let releaseCatalog!: () => void;
  let started!: () => void;
  const recovery = new Promise<void>(resolve => { releaseCatalog = resolve; });
  const entered = new Promise<void>(resolve => { started = resolve; });
  const routes = new Map<string, unknown>();
  const releases = Object.entries({
    schedule: { catalog: async () => { started(); await recovery; return []; } },
    agents: { list: () => [] }, sessions: {}, systemPrompt: {},
    tools: { guard: () => {}, register: () => {} },
    connection: { fetch: { register: (route: any) => {
      routes.set(route.path, route); return () => routes.delete(route.path);
    } } },
  }).map(([name, value]) => ctx.provide(name, value));
  const fiber = ctx.plugin(core, { dataDir: dir });
  try {
    await entered;
    assert.equal(ctx.get('alwaysOn'), undefined, 'Managed dependents must not start during native recovery');
    assert.equal(routes.size, 0);
    releaseCatalog();
    await fiber.await();
    assert.equal(fiber.state, 2);
    assert.ok(ctx.get('alwaysOn'));
    assert.ok(routes.has('/api/always-on'));
    assert.ok(routes.has('/api/always-on-sw.js'));
  } finally {
    releaseCatalog();
    await fiber.dispose();
    releases.reverse().forEach(dispose => dispose());
    await rm(dir, { recursive: true, force: true });
  }
});

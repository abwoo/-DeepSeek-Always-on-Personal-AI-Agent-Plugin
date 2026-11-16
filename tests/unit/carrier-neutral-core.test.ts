import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Context } from '@deepseek-ai/cordis';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import * as core from '../../src/host/index.js';
import { Store } from '../../src/host/storage.js';
import { Notifications } from '../../src/host/notifications.js';
import { Coordinator } from '../../src/host/tasks.js';
import { ScheduleInputError } from '@deepseek-ai/dsh-schedule';
import { randomUUID } from 'node:crypto';

test('real Cordis lifecycle: core Fetch routes and durable memory work without an HTTP server', async () => {
  const ctx = new Context();
  const dir = await mkdtemp(join(tmpdir(), 'always-on-carrier-'));
  const routes = new Map<string, { fetch: (request: Request) => Promise<Response> }>();
  // Peer services are fixtures. Cordis, plugin startup/disposal, API and SQLite are real.
  const release = Object.entries({
    schedule: { catalog: async () => [] },
    sessionController: {},
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
    sessionController: {},
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

test('real Cordis startup: native new-once recovery waits for SessionController and retains task identities', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'always-on-session-readiness-'));
  const scheduleId = 'schedule-' + randomUUID(), sessionId = 'session-' + randomUUID();
  const seed = new Store(join(dir, 'state.sqlite'));
  const coordinator = new Coordinator(seed, {
    create: async () => ({ id: scheduleId, target: { sessionId } }),
    edit: async () => ({}), run: async () => {},
  }, new Notifications(seed));
  const task = await coordinator.create({
    title: 'Native controller startup proof', instruction: 'Read-only fixture',
    timing: { kind: 'after', after_seconds: 3600 },
  });
  seed.put('tasks', task.id, { ...task, suspendedForUnload: true });
  seed.close();

  function host(plugin: any) {
    const ctx = new Context();
    const routes = new Map<string, any>();
    let status = 'paused', resumes = 0, catalogs = 0;
    const releases = Object.entries({
      schedule: {
        catalog: async () => {
          catalogs++;
          return [{ id: scheduleId, status, prompt: '[ALWAYS_ON_TRIGGER] ' + task.id,
            target: { kind: 'new_once', sessionId } }];
        },
        edit: async (request: any) => {
          assert.equal(request.id, scheduleId, 'Recovery must use the existing native Schedule');
          if (request.patch.active && !ctx.get('sessionController'))
            throw new ScheduleInputError('invalid_rule', 'This Host cannot create Sessions; choose an existing Session target.');
          status = request.patch.active ? 'active' : 'paused';
          if (request.patch.active) resumes++;
          return { id: scheduleId, status };
        },
        create: async () => { throw new Error('Recovery must not recreate a Schedule or Session'); },
      },
      agents: { list: () => [] }, sessions: {}, systemPrompt: {},
      tools: { guard: () => {}, register: () => {} },
      connection: { fetch: { register: (route: any) => {
        routes.set(route.path, route); return () => routes.delete(route.path);
      } } },
    }).map(([name, value]) => ctx.provide(name, value));
    const fiber = ctx.plugin(plugin, { dataDir: dir });
    return { ctx, fiber, routes, resumes: () => resumes, catalogs: () => catalogs,
      close: async () => { await fiber.dispose(); releases.reverse().forEach(dispose => dispose()); } };
  }

  // Reproduce the exact native arming refusal with the old missing dependency.
  const unsafe = host({ ...core, inject: core.inject.filter(name => name !== 'sessionController') });
  try {
    await assert.rejects(unsafe.fiber.await(), /This Host cannot create Sessions/);
    assert.equal(unsafe.fiber.state, 3);
    assert.equal(unsafe.routes.size, 0);
  } finally { await unsafe.close(); }

  const fixed = host(core);
  let removeController: (() => void) | undefined;
  try {
    await fixed.fiber.await();
    assert.equal(fixed.fiber.state, 0, 'Core must wait for the actual Session creation provider');
    assert.equal(fixed.catalogs(), 0);
    assert.equal(fixed.resumes(), 0);
    assert.equal(fixed.ctx.get('alwaysOn'), undefined);
    removeController = fixed.ctx.provide('sessionController', {});
    await fixed.fiber.await();
    assert.equal(fixed.fiber.state, 2);
    assert.equal(fixed.resumes(), 1);
    const snapshot = await (await fixed.routes.get('/api/always-on').fetch(
      new Request('https://carrier.invalid/api/always-on'))).json();
    const retained = snapshot.tasks.find((value: any) => value.id === task.id);
    assert.equal(retained.scheduleId, scheduleId);
    assert.equal(retained.sessionId, sessionId);
    assert.equal(retained.state, 'active');
    assert.equal(retained.suspendedForUnload, false);

    removeController(); removeController = undefined;
    await fixed.fiber.await();
    assert.equal(fixed.fiber.state, 0);
    assert.equal(fixed.routes.size, 0);
    removeController = fixed.ctx.provide('sessionController', {});
    await fixed.fiber.await();
    assert.equal(fixed.fiber.state, 2);
    assert.equal(fixed.resumes(), 2);
    assert.equal(fixed.ctx.alwaysOn.coordinator.requireTask(task.id).sessionId, sessionId);
  } finally {
    await fixed.close();
    removeController?.();
    await rm(dir, { recursive: true, force: true });
  }
});

test('real Cordis startup never promotes an unconfirmed native recovery receipt to an active task', async () => {
  for (const mode of ['negative', 'wrong-id', 'paused', 'incomplete-create'] as const) {
    const dir = await mkdtemp(join(tmpdir(), 'always-on-receipt-'));
    const scheduleId = 'schedule-' + randomUUID(), sessionId = 'session-' + randomUUID();
    const seed = new Store(join(dir, 'state.sqlite'));
    const coordinator = new Coordinator(seed, {
      create: async () => ({ id: scheduleId, target: { sessionId } }), edit: async () => ({}), run: async () => {},
    }, new Notifications(seed));
    const task = await coordinator.create({ title: 'Recovery receipt proof', instruction: 'Fixture only',
      timing: { kind: 'after', after_seconds: 3600 } });
    seed.put('tasks', task.id, { ...task, state: mode === 'incomplete-create' ? 'configuring' : 'active',
      suspendedForUnload: mode !== 'incomplete-create' });
    seed.close();
    const ctx = new Context(), routes = new Map<string, any>();
    let edits = 0;
    const releases = Object.entries({
      sessionController: {}, agents: { list: () => [] }, sessions: {}, systemPrompt: {},
      tools: { guard: () => {}, register: () => {} },
      schedule: {
        catalog: async () => [{ id: scheduleId, status: mode === 'incomplete-create' ? 'active' : 'paused',
          prompt: '[ALWAYS_ON_TRIGGER] ' + task.id, target: { kind: 'new_once', sessionId } }],
        edit: async (request: any) => {
          edits++; assert.equal(request.id, scheduleId);
          return mode === 'wrong-id' ? { id: 'another-schedule', status: 'active' }
            : mode === 'paused' ? { id: scheduleId, status: 'paused' }
              : { id: scheduleId, code: 'schedule_not_found' };
        },
        create: async () => { throw new Error('Recovery must not recreate native identities'); },
      },
      connection: { fetch: { register: (route: any) => {
        routes.set(route.path, route); return () => routes.delete(route.path);
      } } },
    }).map(([name, value]) => ctx.provide(name, value));
    const fiber = ctx.plugin(core, { dataDir: dir });
    try {
      await fiber.await();
      assert.equal(fiber.state, 2, 'One unconfirmed task must not remove the healthy API');
      const response = await routes.get('/api/always-on').fetch(new Request('https://carrier.invalid/api/always-on'));
      assert.equal(response.status, 200);
      const retained = (await response.json()).tasks.find((value: any) => value.id === task.id);
      assert.equal(retained.state, 'error');
      assert.match(retained.error, /unconfirmed/);
      assert.equal(retained.scheduleId, scheduleId);
      assert.equal(retained.sessionId, sessionId);
      assert.equal(retained.suspendedForUnload, false);
      assert.equal(edits, 1);
    } finally {
      await fiber.dispose();
      releases.reverse().forEach(dispose => dispose());
      await rm(dir, { recursive: true, force: true });
    }
  }
});

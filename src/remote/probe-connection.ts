/** Phase 0 Node transport probe. Not a shipping Desktop/mobile authentication flow. */
import { Context } from '@deepseek-ai/cordis';
import { installConnection, type ConnectionWebSocket } from '@deepseek-ai/dsh-client-connection/client';
import * as registry from '@deepseek-ai/dsh-typert-registry/client';
import * as gateway from '@deepseek-ai/dsh-api-gateway/client';
import { TYPERT_REMOTE } from '@deepseek-ai/dsh-api-session-controller/remote';
import WebSocket from 'ws';

export function validateAuthority(input: string, allowLoopback = false): URL {
  const url = new URL(input);
  const local = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('Authority must be an origin without credentials, path, query or fragment');
  }
  if (url.protocol !== 'https:' && !(allowLoopback && local && url.protocol === 'http:')) {
    throw new Error('HTTPS is required; HTTP is allowed only in explicit loopback probes');
  }
  return url;
}

/** Uses only exported SDK entrypoints; no local Host, no local Session copy, no Agent loop. */
export async function connectProbe(authority: string, launchToken: string, allowLoopback = false) {
  const base = validateAuthority(authority, allowLoopback);
  const exchange = new URL('connect', base);
  exchange.searchParams.set('token', launchToken);
  exchange.searchParams.set('interactions', 'none');
  const login = await fetch(exchange, { redirect: 'manual', signal: AbortSignal.timeout(15000) });
  if (login.status !== 302) throw new Error(`Harness API authentication rejected: HTTP ${login.status}`);
  const cookie = login.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ');
  if (!cookie) throw new Error('Harness did not issue an API credential');
  const ctx = new Context();
  const sockets = new Set<WebSocket>();
  let alive = true;
  installConnection(ctx, {
    interactions: 'none',
    location: { hostname: base.hostname },
    transport: {
      // Never use ownsHost=true to grant a remote connection local authority.
      streamBaseUrl: base.href,
      fetch: (input, init) => {
        if (!alive) throw new Error('Remote connection is closed');
        const target = new URL(input, base);
        if (target.origin !== base.origin) throw new Error('Cross-origin transport rejected');
        const headers = new Headers(init.headers);
        headers.set('cookie', cookie);
        const timeout = AbortSignal.timeout(15000);
        const signal = init.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
        return fetch(target, { ...init, headers, signal, redirect: 'error' });
      },
      createWebSocket: (input) => {
        const target = new URL(input);
        if (target.host !== base.host || target.protocol !== (base.protocol === 'https:' ? 'wss:' : 'ws:')) {
          throw new Error('Cross-origin socket rejected');
        }
        const socket = new WebSocket(input, { headers: { cookie }, followRedirects: false });
        sockets.add(socket);
        socket.on('close', () => sockets.delete(socket));
        return socket as unknown as ConnectionWebSocket;
      },
    },
  });
  registry.apply(ctx);
  gateway.apply(ctx);
  try {
    await ctx.remote.$mount(TYPERT_REMOTE);
    // Unary calls do not imply a live API peer. Wait for the real lifecycle socket.
    await new Promise<void>((resolve, reject) => {
      const socket = [...sockets][0];
      if (!socket) return reject(new Error('Harness lifecycle socket was not created'));
      if (socket.readyState === WebSocket.OPEN) return resolve();
      const timer = setTimeout(() => reject(new Error('Harness lifecycle socket timed out')), 15000);
      socket.once('open', () => { clearTimeout(timer); resolve(); });
      socket.once('error', () => { clearTimeout(timer); reject(new Error('Harness lifecycle socket failed')); });
    });
    return {
      authority: base.origin,
      session: ctx.remote.session,
      async close() {
        alive = false;
        await ctx.fiber.dispose();
        for (const socket of sockets) socket.terminate();
      },
    };
  } catch (error) {
    alive = false;
    await ctx.fiber.dispose();
    for (const socket of sockets) socket.terminate();
    throw error;
  }
}

import { Context } from '@deepseek-ai/cordis';
import type {} from '@deepseek-ai/dsh-client-connection';
import type {} from '@deepseek-ai/dsh-session';
import { installConnection } from '@deepseek-ai/dsh-client-connection/client';
import * as registry from '@deepseek-ai/dsh-typert-registry/client';
import * as gateway from '@deepseek-ai/dsh-api-gateway/client';
import { TYPERT_REMOTE } from '@deepseek-ai/dsh-api-session-controller/remote';
/** Public in-process Connection carrier. There is no HTTP owner token and no new Agent loop. */
export async function nativeClient(host: Context) {
  const peer = host.connection.createPeer({ principal: { kind: 'owner' }, interactions: 'none' });
  const handler = host.connection.createSharedFetchHandler('/api');
  const client = new Context();
  installConnection(client, {
    interactions: 'none',
    location: { hostname: 'personal-agent.internal' },
    transport: {
      fetch: (input, init) =>
        handler.fetch(new Request(new URL(input, 'http://personal-agent.internal/'), init), peer),
      openStream: () => {
        throw new Error('Use bounded Session events; stream carrier is not exposed');
      },
    },
  });
  registry.apply(client);
  gateway.apply(client);
  await client.remote.$mount(TYPERT_REMOTE);
  return {
    session: client.remote.session,
    core: async (method: 'GET' | 'POST', body?: unknown) => {
      const response = await handler.fetch(
        new Request('http://personal-agent.internal/api/always-on', {
          method,
          headers: { 'content-type': 'application/json' },
          ...(method === 'POST' ? { body: JSON.stringify(body) } : {}),
        }),
        peer,
      );
      const data = await response.json();
      if (!response.ok || data.ok === false) throw new Error('native_core_rejected');
      return data;
    },
    flush: async (id: string) => {
      const session = host.sessions.get(id as never);
      if (!session || !(await host.sessions.flush(session)))
        throw new Error('session_flush_failed');
    },
    close: async () => {
      await client.fiber.dispose();
      await peer.dispose();
    },
  };
}

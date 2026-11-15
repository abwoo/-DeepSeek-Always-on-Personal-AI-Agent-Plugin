import { isIP } from 'node:net';
import type { IncomingMessage } from 'node:http';
import { GatewayError } from '../managed/store.js';
export function normalizeAddress(value: string): string {
  if (value.includes('%') || !isIP(value)) throw new GatewayError(400, 'invalid_client_address');
  if (isIP(value) === 4) return value;
  const canonical = new URL('http://[' + value + ']/').hostname.slice(1, -1);
  const mapped = /^::ffff:([a-f0-9]{1,4}):([a-f0-9]{1,4})$/.exec(canonical);
  if (!mapped) return canonical;
  const high = parseInt(mapped[1]!, 16),
    low = parseInt(mapped[2]!, 16);
  return [high >>> 8, high & 255, low >>> 8, low & 255].join('.');
}
/** One reviewed edge hop. Arbitrary XFF/Forwarded headers are never identity. */
export function requestNetwork(
  req: IncomingMessage,
  publicOrigin: string,
  trusted: Set<string>,
  allowLoopback = false,
) {
  const peer = normalizeAddress(req.socket.remoteAddress ?? '');
  const proxy =
    trusted.has(peer) &&
    req.headers['x-forwarded-proto'] === 'https' &&
    req.headers.host === new URL(publicOrigin).host;
  const tls = 'encrypted' in req.socket && req.socket.encrypted;
  const local = peer === '127.0.0.1' || peer === '::1';
  if (!tls && !proxy && !(allowLoopback && local)) throw new GatewayError(403, 'https_required');
  if (!proxy) return { peer, client: peer, proxy: false };
  const supplied = req.headers['x-always-on-client-ip'];
  if (typeof supplied !== 'string') throw new GatewayError(400, 'proxy_client_address_required');
  // A list, duplicate header, port, bracketed literal or scoped address is rejected.
  return { peer, client: normalizeAddress(supplied), proxy: true };
}

import { GatewayError } from '../managed/store.js';
/** Count bytes while reading, rather than allocating an unbounded upstream body first. */
export async function boundedText(response: Response, max = 2 * 1024 * 1024) {
  if (!response.body) return '';
  const reader = response.body.getReader(),
    chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > max) {
        await reader.cancel().catch(() => {});
        throw new GatewayError(502, 'agent_response_too_large');
      }
      chunks.push(value);
    }
    return Buffer.concat(chunks, size).toString('utf8');
  } finally {
    reader.releaseLock();
  }
}

import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import { snapshotSchema } from '@abwoo/always-on-client';
import type { ManagedSnapshot } from '@abwoo/always-on-client';
import type { AccountConnection } from '@abwoo/always-on-client/account';
const options = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };
let serial = Promise.resolve();
const prefix = (c: AccountConnection) =>
  `always-on.cache.${c.account.id}.${c.credentials.deviceId}`;
async function removeGeneration(base: string, entry: { generation: string; count: number } | null) {
  if (entry)
    for (let i = 0; i < Math.min(entry.count, 64); i++)
      await SecureStore.deleteItemAsync(`${base}.${entry.generation}.${i}`);
}
/** Bounded OS-encrypted stale snapshot. No model keys or transient chat frames are cached. */
export async function saveOfflineSnapshot(c: AccountConnection, state: ManagedSnapshot) {
  const work = async () => {
    const base = prefix(c),
      previous = JSON.parse((await SecureStore.getItemAsync(base)) ?? 'null');
    if (previous?.revision === state.revision) return;
    const data = {
      ...state,
      tasks: state.tasks.slice(0, 20),
      runs: state.runs.slice(0, 20),
      memories: state.memories.slice(0, 20),
      inbox: state.inbox.slice(0, 20),
      goals: state.goals.slice(0, 20),
    };
    let value = JSON.stringify(data);
    while (value.length > 24000) {
      const list = [data.tasks, data.runs, data.memories, data.inbox, data.goals].sort(
        (a, b) => JSON.stringify(b).length - JSON.stringify(a).length,
      )[0]!;
      if (!list.length) return;
      list.pop();
      value = JSON.stringify(data);
    }
    const pending = JSON.parse((await SecureStore.getItemAsync(base + '.pending')) ?? 'null');
    if (pending && pending.generation !== previous?.generation)
      await removeGeneration(base, pending);
    const points = Array.from(value),
      generation = Crypto.randomUUID(),
      count = Math.ceil(points.length / 400);
    await SecureStore.setItemAsync(
      base + '.pending',
      JSON.stringify({ generation, count }),
      options,
    );
    for (let i = 0; i < count; i++)
      await SecureStore.setItemAsync(
        `${base}.${generation}.${i}`,
        points.slice(i * 400, (i + 1) * 400).join(''),
        options,
      );
    await SecureStore.setItemAsync(
      base,
      JSON.stringify({
        generation,
        count,
        revision: state.revision,
        savedAt: new Date().toISOString(),
        authorityId: state.authorityId,
      }),
      options,
    );
    await removeGeneration(base, previous);
    await SecureStore.deleteItemAsync(base + '.pending');
  };
  const p = serial.then(work, work);
  serial = p.catch(() => {});
  return p;
}
export async function loadOfflineSnapshot(c: AccountConnection) {
  const base = prefix(c),
    raw = await SecureStore.getItemAsync(base);
  if (!raw) return null;
  const entry = JSON.parse(raw);
  if (entry.authorityId !== c.credentials.authorityId || entry.count > 64 || entry.count < 1)
    return null;
  let value = '';
  for (let i = 0; i < entry.count; i++) {
    const part = await SecureStore.getItemAsync(`${base}.${entry.generation}.${i}`);
    if (!part) return null;
    value += part;
  }
  const snapshot = snapshotSchema.parse(JSON.parse(value));
  if (
    snapshot.authorityId !== c.credentials.authorityId ||
    snapshot.ownerId !== c.credentials.ownerId
  )
    return null;
  return { snapshot, savedAt: entry.savedAt };
}
export async function clearOfflineSnapshot(c: AccountConnection) {
  await serial;
  const base = prefix(c),
    raw = await SecureStore.getItemAsync(base);
  if (raw) await removeGeneration(base, JSON.parse(raw));
  await SecureStore.deleteItemAsync(base);
}

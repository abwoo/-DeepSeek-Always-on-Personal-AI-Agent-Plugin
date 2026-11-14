import * as SecureStore from 'expo-secure-store';
import type { ConnectionRecord, OperationStorage, PendingOperation } from '@abwoo/always-on-client';
import { credentialsSchema, managedOrigin } from '@abwoo/always-on-client';
import {accountConnectionSchema,type AccountConnection} from '@abwoo/always-on-client/account';
const options = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };
const key = 'always-on.connection.v2';
export async function loadConnection(): Promise<ConnectionRecord | null> {
  // Fail closed if the OS credential store is unavailable (including a mis-signed native build).
  const probe = 'always-on.storage-check.v2',
    nonce = String(Date.now()) + String(Math.random());
  try {
    await SecureStore.setItemAsync(probe, nonce, options);
    if ((await SecureStore.getItemAsync(probe)) !== nonce)
      throw Error('Secure credential storage verification failed');
  } finally {
    await SecureStore.deleteItemAsync(probe);
  }
  const value = await SecureStore.getItemAsync(key);
  if (!value) return null;
  try {
    const record = JSON.parse(value);
    return {
      origin: managedOrigin(record.origin),
      credentials: credentialsSchema.parse(record.credentials),
    };
  } catch {
    await SecureStore.deleteItemAsync(key);
    return null;
  }
}
export async function saveConnection(value: ConnectionRecord) {
  await SecureStore.setItemAsync(key, JSON.stringify(value), options);
}
export async function clearConnection() {
  await SecureStore.deleteItemAsync(key);
}
const productKey='always-on.account.v3';
export async function loadProductConnection():Promise<AccountConnection|null>{
  await loadConnection(); // Reuse the real OS secure-store round-trip; do not attach legacy paired state to an account.
  const raw=await SecureStore.getItemAsync(productKey);if(!raw)return null;
  const record=accountConnectionSchema.parse(JSON.parse(raw));managedOrigin(record.origin);return record;
}
export async function saveProductConnection(record:AccountConnection){
  accountConnectionSchema.parse(record);await SecureStore.setItemAsync(productKey,JSON.stringify(record),options);
}
export async function clearProductConnection(){await SecureStore.deleteItemAsync(productKey);}
export function operationStorage(deviceId: string): OperationStorage {
  const index = `always-on.pending.${deviceId}`;
  let serial = Promise.resolve();
  const execute = <T>(fn: () => Promise<T>) => {
    const next = serial.then(fn, fn);
    serial = next.then(
      () => {},
      () => {},
    );
    return next;
  };
  const ids = async (): Promise<string[]> =>
    JSON.parse((await SecureStore.getItemAsync(index)) ?? '[]');
  return {
    save: (operation) =>
      execute(async () => {
        const list = await ids();
        if (!list.includes(operation.operationId) && list.length >= 20)
          throw new Error('Resolve pending operations before submitting more work');
        const entry = `always-on.op.${deviceId}.${operation.operationId}`;
        await SecureStore.setItemAsync(entry, JSON.stringify(operation), options);
        if (!list.includes(operation.operationId))
          await SecureStore.setItemAsync(
            index,
            JSON.stringify([...list, operation.operationId]),
            options,
          );
      }),
    remove: (id) =>
      execute(async () => {
        await SecureStore.deleteItemAsync(`always-on.op.${deviceId}.${id}`);
        await SecureStore.setItemAsync(
          index,
          JSON.stringify((await ids()).filter((v) => v !== id)),
          options,
        );
      }),
    list: () =>
      execute(async () => {
        const list: PendingOperation[] = [];
        for (const id of await ids()) {
          const value = await SecureStore.getItemAsync(`always-on.op.${deviceId}.${id}`);
          if (value) list.push(JSON.parse(value));
        }
        await SecureStore.setItemAsync(
          index,
          JSON.stringify(list.map((v) => v.operationId)),
          options,
        );
        return list;
      }),
  };
}

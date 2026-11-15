// Explicit test doubles for OS-only services; no secret/private credential enters an artifact.
const w = window as any;
const values = new Map<string, string>();
w.__secureKeys = () => Array.from(values.keys());
export const WHEN_UNLOCKED_THIS_DEVICE_ONLY = 'fixture';
export async function getItemAsync(key: string) {
  if (key === 'always-on.account.v3' && !values.has(key) && w.__initialConnection) {
    values.set(key, JSON.stringify(w.__initialConnection));
    delete w.__initialConnection;
  }
  return values.get(key) ?? null;
}
export async function setItemAsync(key: string, value: string) {
  if (w.__failCacheChunk && key.startsWith('always-on.cache.') && key.endsWith('.1'))
    throw Error('Injected OS cache write interruption');
  values.set(key, value);
  if (key === 'always-on.account.v3') {
    const c = JSON.parse(value);
    w.__boundIdentity = { accountId: c.account.id, authorityId: c.credentials.authorityId };
  }
}
export async function deleteItemAsync(key: string) {
  values.delete(key);
}
export const randomUUID = () => crypto.randomUUID();
export const getRandomBytes = (n: number) => crypto.getRandomValues(new Uint8Array(n));
export const CryptoDigestAlgorithm = { SHA256: 'SHA-256' },
  CryptoEncoding = { BASE64: 'base64' };
export async function digestStringAsync(_a: any, text: string) {
  return btoa(
    String.fromCharCode(
      ...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))),
    ),
  );
}
export const modelName = 'Browser component adapter',
  isDevice = false;
export const makeRedirectUri = () => 'deepseek-always-on://oauth/return';
export const openAuthSessionAsync = async (authorizeUrl: string) => {
  const state = new URL(authorizeUrl).searchParams.get('state');
  const response = await window.fetch(
    'https://service-fixture.invalid/account/v1/callback?state=' +
      encodeURIComponent(state!) +
      '&code=' +
      encodeURIComponent(w.__subject ?? 'bob'),
  );
  if (!response.ok) throw Error('Local identity adapter callback failed');
  return { type: 'success', url: (await response.json()).nativeCallback };
};
export const maybeCompleteAuthSession = () => {};
export const setNotificationHandler = () => {};
export const addNotificationReceivedListener = () => ({ remove() {} }),
  addNotificationResponseReceivedListener = () => ({ remove() {} });
export const getLastNotificationResponseAsync = async () => null;
export const requestPermissionsAsync = async () => ({ status: 'denied' });
export const fetch = async (...a: any[]) => {
  const response = await (window.fetch as any)(...a);
  if (String(a[0]).endsWith('/account/v1/login/start') && response.ok)
    w.__loginId = (await response.clone().json()).loginId;
  return response;
};
export default { expoConfig: { extra: { serviceOrigin: 'https://service-fixture.invalid' } } };

export const AndroidImportance = { HIGH: 4 };
export const setNotificationChannelAsync = async () => {};
export const getExpoPushTokenAsync = async () => {
  throw Error('Native push is not available in the browser adapter');
};

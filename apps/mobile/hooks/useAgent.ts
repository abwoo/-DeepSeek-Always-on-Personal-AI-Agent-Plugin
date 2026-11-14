import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  AppState,
  KeyboardAvoidingView,
  Linking,
  StatusBar,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import * as Crypto from 'expo-crypto';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { fetch as nativeFetch } from 'expo/fetch';
import {
  ManagedClient,
  resultBeforeSeq,
  conversationRows,
  type ConnectionRecord,
  type ManagedAction,
  type ManagedSnapshot,
} from '@abwoo/always-on-client';
import {
  loadProductConnection,
  saveProductConnection,
  clearProductConnection,
  operationStorage,
} from '../credentials';
import { loadOfflineSnapshot, saveOfflineSnapshot, clearOfflineSnapshot } from '../cache';
import {
  AccountApi,
  AccountManagedClient,
  ApiError,
  type AccountConnection,
} from '@abwoo/always-on-client/account';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});
const transport = nativeFetch as unknown as typeof fetch;
export const uuid = () => Crypto.randomUUID();
export type Page =
  | 'Tasks'
  | 'Goals'
  | 'Chat'
  | 'Memory'
  | 'Inbox'
  | 'Activity'
  | 'Devices'
  | 'Settings';
export const pages: Page[] = [
  'Tasks',
  'Goals',
  'Chat',
  'Memory',
  'Inbox',
  'Activity',
  'Devices',
  'Settings',
];
export const friendly = (error: unknown) =>
  error instanceof Error ? error.message : 'Request failed';

export function useAgent() {
  const [connection, setConnection] = useState<AccountConnection | null>(null),
    [loading, setLoading] = useState(true),
    [storageReady, setStorageReady] = useState(false),
    [deviceName, setDeviceName] = useState(Device.modelName ?? 'My device');
  const [snapshot, setSnapshot] = useState<ManagedSnapshot | null>(null),
    [online, setOnline] = useState(false),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [page, setPage] = useState<Page>('Tasks'),
    [pending, setPending] = useState<any[]>([]);
  const [title, setTitle] = useState(''),
    [instruction, setInstruction] = useState(''),
    [minutes, setMinutes] = useState('1440'),
    [schedule, setSchedule] = useState<'every' | 'daily' | 'once'>('every'),
    [date, setDate] = useState(new Date(Date.now() + 3600000)),
    [picker, setPicker] = useState<'date' | 'time' | null>(null),
    [research, setResearch] = useState(true);
  const [memory, setMemory] = useState(''),
    [kind, setKind] = useState<'fact' | 'preference' | 'project' | 'goal'>('fact'),
    [consent, setConsent] = useState(false),
    [editing, setEditing] = useState<string | undefined>();
  const [editingVersion, setEditingVersion] = useState<number | undefined>();
  const [sessions, setSessions] = useState<any[]>([]),
    [sessionId, setSessionId] = useState(''),
    [session, setSession] = useState<any>(null),
    [focusedRun, setFocusedRun] = useState<any>(null),
    [message, setMessage] = useState(''),
    [notice, setNotice] = useState<any>(null),
    [devices, setDevices] = useState<any[]>([]),
    [pairInfo, setPairInfo] = useState<any>(null),
    [pushStatus, setPushStatus] = useState<any>(null);
  const [liveText, setLiveText] = useState(''),[liveTool,setLiveTool]=useState('');
  const eventCursor = useRef<{ after: number; epoch?: string; live?: number }>({ after: 0 });
  const active = useRef(true),
    selected = useRef(''),
    focused = useRef<any>(null),
    refreshing = useRef(false),
    inFlight = useRef(false),
    currentDevice = useRef<string | undefined>(undefined);
  currentDevice.current = connection?.credentials.deviceId;
  selected.current = sessionId;
  focused.current = focusedRun;
  const storage = useMemo(
    () => (connection ? operationStorage(connection.credentials.deviceId) : undefined),
    [connection?.credentials.deviceId],
  );
  const client = useMemo(
    () =>
      connection
        ? new AccountManagedClient(connection, saveProductConnection, storage, transport)
        : null,
    [connection, storage],
  );
  const report = useCallback(
    async (e: unknown) => {
      setError(friendly(e));
      setOnline(false);
      if (e instanceof ApiError && e.status === 401) {
        if (connection) await clearOfflineSnapshot(connection).catch(() => {});
        await clearProductConnection();
        setConnection(null);
        setSnapshot(null);
        setSessionId('');
        selected.current = '';
        focused.current = null;
        setFocusedRun(null);
        setSession(null);
        setSessions([]);
        setPending([]);
        setNotice(null);
        setDevices([]);
        setPushStatus(null);
      }
    },
    [connection],
  );
  const refresh = useCallback(async () => {
    if (!client || !active.current || refreshing.current) return;
    refreshing.current = true;
    try {
      const state = await client.snapshot();
      if (currentDevice.current !== client.credentials.deviceId) return;
      setSnapshot(state);
      if (connection) void saveOfflineSnapshot(connection, state).catch(() => {});
      setOnline(true);
      setError('');
      setPending((await client.reconcile()).filter((r) => r.status !== 'committed'));
      if (selected.current) {
        const target = focused.current;
        const updated = target ? (state.runs.find((r) => r.id === target.id) ?? target) : null;
        if (updated) {
          focused.current = updated;
          setFocusedRun(updated);
        }
        const history = await client.readSession(
          selected.current,
          updated ? resultBeforeSeq(updated) : undefined,
        );
        if (history.sessionId === selected.current && focused.current?.id === updated?.id)
          setSession(history);
      }
    } catch (e) {
      if (currentDevice.current === client.credentials.deviceId) await report(e);
    } finally {
      refreshing.current = false;
    }
  }, [client, report]);
  useEffect(() => {
    loadProductConnection()
      .then(async (record) => {
        setConnection(record);
        if (record) {
          const cached = await loadOfflineSnapshot(record).catch(() => null);
          if (cached) setSnapshot(cached.snapshot);
        }
        setStorageReady(true);
      })
      .catch((e) => setError(friendly(e)))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    active.current = AppState.currentState === 'active';
    const subscription = AppState.addEventListener('change', (state) => {
      active.current = state === 'active';
      if (active.current) refresh();
    });
    refresh();
    const timer = setInterval(() => refresh(), 10000);
    return () => {
      subscription.remove();
      clearInterval(timer);
    };
  }, [refresh]);
  useEffect(() => {
    if (!client) return;
    let stopped = false;
    const run = async () => {
      while (!stopped) {
        if (!active.current) {
          await new Promise((r) => setTimeout(r, 1000));
          continue;
        }
        const target = selected.current;
        try {
          const result = await client.events(eventCursor.current, target || undefined);
          if (stopped || currentDevice.current !== client.credentials.deviceId) return;
          eventCursor.current = { after: result.revision, epoch: result.epoch, live: result.live };
          if (result.resetLive) setLiveText('');
          for (const frame of result.frames ?? []) {
            if (frame.sessionId !== selected.current || focused.current) continue;
            if (frame.kind === 'start' || frame.kind === 'end'){setLiveText('');setLiveTool('');}
            if(frame.kind==='tool-progress'&&frame.data.name)setLiveTool(String(frame.data.name));
            if (frame.kind === 'text-delta')
              setLiveText((text) => (text + String(frame.data.text)).slice(-24000));
          }
          if (result.items?.length || result.resetLive) await refresh();
          await new Promise((r) => setTimeout(r, 100));
        } catch (e) {
          if (stopped) return;
          if (e instanceof ApiError && e.status === 410) {
            eventCursor.current = { after: 0 };
            setLiveText('');
            await refresh();
          } else {
            await report(e);
            await new Promise((r) => setTimeout(r, 2000));
          }
        }
      }
    };
    void run();
    return () => {
      stopped = true;
    };
  }, [client, refresh, report]);
  async function perform(work: () => Promise<unknown>) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError('');
    try {
      await work();
      await refresh();
    } catch (e) {
      setError(friendly(e));
      if (
        !(e instanceof ApiError && e.status < 500) &&
        !(e instanceof Error && e.name === 'ZodError')
      )
        setOnline(false);
      if (client)
        setPending(
          (await client.reconcile().catch(() => [])).filter((r) => r.status !== 'committed'),
        );
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  const mutate = (command: ManagedAction) => client!.mutate(uuid(), command);
  async function signIn() {
    await perform(async () => {
      const service = String(Constants.expoConfig?.extra?.serviceOrigin ?? '');
      if (!service) throw Error('Sign-in service is not available in this development build.');
      const verifier = Crypto.getRandomBytes(32);
      const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
      // Base64url, using the native byte source. 32 bytes produce a 43-character PKCE verifier.
      let bits = 0,
        value = 0,
        proof = '';
      for (const byte of verifier) {
        value = (value << 8) | byte;
        bits += 8;
        while (bits >= 6) {
          bits -= 6;
          proof += alphabet[(value >>> bits) & 63];
        }
      }
      if (bits) proof += alphabet[(value << (6 - bits)) & 63];
      const redirectUri = AuthSession.makeRedirectUri({
        scheme: 'deepseek-always-on',
        path: 'oauth/return',
      });
      // Native browser session; the maintained server OIDC library validates its own S256/code/state/nonce exchange.
      const api = new AccountApi(service, transport);
      const hash = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, proof, {
        encoding: Crypto.CryptoEncoding.BASE64,
      });
      const challenge = hash.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      const started = await api.start({
        challenge,
        name: deviceName,
        platform: Platform.OS === 'ios' ? 'ios' : 'android',
        mobile: true,
      });
      const result = await WebBrowser.openAuthSessionAsync(started.authorizeUrl, redirectUri);
      if (result.type !== 'success') throw Error('Sign in cancelled.');
      const returned = new URL(result.url);
      if (
        returned.protocol !== 'deepseek-always-on:' ||
        returned.hostname !== 'oauth' ||
        returned.pathname !== '/return' ||
        returned.searchParams.get('loginId') !== started.loginId
      )
        throw Error('Invalid sign-in callback');
      let completed = await api.complete(started.loginId, proof);
      for (let n = 0; completed.state !== 'ready' && n < 45; n++) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        completed = await api.complete(started.loginId, proof);
      }
      if (completed.state !== 'ready')
        throw Error('Your agent is still being prepared. Please sign in again shortly.');
      await saveProductConnection(completed.connection);
      setConnection(completed.connection);
    });
  }
  async function logout() {
    if (!client) return;
    await perform(async () => {
      await client.logout();
      if (connection) await clearOfflineSnapshot(connection);
      await clearProductConnection();
      setConnection(null);
      setSnapshot(null);
      setSession(null);
      setSessionId('');
      selected.current = '';
      focused.current = null;
      setFocusedRun(null);
      setNotice(null);
      setDevices([]);
      setPushStatus(null);
      setPending([]);
    });
  }
  async function openSession(id: string) {
    if (!client) return;
    await perform(async () => {
      focused.current = null;
      setFocusedRun(null);
      const value = await client.readSession(id);
      selected.current = id;
      setSessionId(id);
      setSession(value);
      setPage('Chat');
    });
  }
  async function openRun(id: string) {
    if (!client) return;
    await perform(async () => {
      const run = await client.request('/runs/' + id);
      const value = await client.readSession(run.sessionId, resultBeforeSeq(run));
      focused.current = run;
      setFocusedRun(run);
      selected.current = run.sessionId;
      setSessionId(run.sessionId);
      setSession(value);
      setPage('Chat');
    });
  }
  async function enablePush() {
    if (!client || !connection) return;
    await perform(async () => {
      const projectId =
        Constants.easConfig?.projectId ?? Constants.expoConfig?.extra?.eas?.projectId;
      if (!projectId)
        throw Error('Notifications are not available yet. Your Inbox is still available.');
      if (!Device.isDevice)
        throw Error('System notifications require an installed app on a phone.');
      if (Platform.OS === 'android')
        await Notifications.setNotificationChannelAsync('agent-updates', {
          name: 'Agent updates',
          importance: Notifications.AndroidImportance.HIGH,
        });
      const permission = await Notifications.requestPermissionsAsync();
      if (permission.status !== 'granted')
        throw Error('Notification permission was not granted. Inbox remains available.');
      const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
      await client.request('/push/register', { token, projectId });
      Alert.alert('Notifications enabled', 'Inbox remains the authoritative record.');
    });
  }
  useEffect(() => {
    if (!client || !connection) return;
    const handle = async (notification: Notifications.Notification, opened: boolean) => {
      const data = notification.request.content.data ?? {};
      if (
        data.authorityId !== connection.credentials.authorityId ||
        typeof data.noticeId !== 'string'
      )
        return;
      try {
        await client
          .request('/push/ack', {
            noticeId: data.noticeId,
            kind: opened ? 'opened' : 'foreground_received',
          })
          .catch(() => {});
        if (opened) {
          setPage('Inbox');
          setNotice(await client.request('/inbox/' + data.noticeId));
        }
        await refresh();
      } catch (e) {
        setError(friendly(e));
      }
    };
    const received = Notifications.addNotificationReceivedListener((n) => handle(n, false));
    const response = Notifications.addNotificationResponseReceivedListener((r) =>
      handle(r.notification, true),
    );
    Notifications.getLastNotificationResponseAsync().then((r) => {
      if (r) handle(r.notification, true);
    });
    return () => {
      received.remove();
      response.remove();
    };
  }, [client, connection, refresh]);
  const disabled = busy || !online || pending.length > 0;
  const records = (session?.events.records ?? [])
    .filter((r: any) => r.type === 'event')
    .map((r: any) => r.event);
  const rows = conversationRows(records);
  async function loadDevices() {
    await perform(async () => {
      setDevices((await client!.request('/devices')).items);
      setPage('Devices');
    });
  }

  return {
    editingVersion,
    setEditingVersion,
    liveText,liveTool,
    connection,
    setConnection,
    loading,
    setLoading,
    storageReady,
    setStorageReady,
    deviceName,
    setDeviceName,
    snapshot,
    setSnapshot,
    online,
    setOnline,
    error,
    setError,
    busy,
    setBusy,
    page,
    setPage,
    pending,
    setPending,
    title,
    setTitle,
    instruction,
    setInstruction,
    minutes,
    setMinutes,
    schedule,
    setSchedule,
    date,
    setDate,
    picker,
    setPicker,
    research,
    setResearch,
    memory,
    setMemory,
    kind,
    setKind,
    consent,
    setConsent,
    editing,
    setEditing,
    sessions,
    setSessions,
    sessionId,
    setSessionId,
    session,
    setSession,
    focusedRun,
    setFocusedRun,
    message,
    setMessage,
    notice,
    setNotice,
    devices,
    setDevices,
    pairInfo,
    setPairInfo,
    pushStatus,
    setPushStatus,
    active,
    selected,
    focused,
    refreshing,
    inFlight,
    currentDevice,
    storage,
    client,
    report,
    refresh,
    perform,
    mutate,
    signIn,
    logout,
    openSession,
    openRun,
    enablePush,
    disabled,
    records,
    rows,
    loadDevices,
  };
}

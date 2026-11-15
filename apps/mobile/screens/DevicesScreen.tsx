import React from 'react';
import { View, Switch, Alert, Linking } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Button, Field, Text } from '../ui';
import { useAgentState } from '../state';
import { useUi } from '../theme';
import { uuid } from '../hooks/useAgent';
export function DevicesScreen() {
  const {
    connection,
    devicesLoading,
    online,
    error,
    busy,
    title,
    devices,
    setDevices,
    pushStatus,
    setPushStatus,
    active,
    storage,
    client,
    perform,
    logout,
    disabled,
  } = useAgentState();
  const { styles } = useUi();
  return (
    <>
      <View style={styles.card}>
        <Text style={styles.heading}>Access and notifications</Text>
        <Text selectable>Authority: {connection!.credentials.authorityId}</Text>
        <Button
          title="Check notification delivery"
          disabled={disabled}
          onPress={() => perform(async () => setPushStatus(await client!.request('/push/status')))}
        />
        {pushStatus ? (
          <View>
            <Text style={styles.footnote}>
              {pushStatus.configured ? 'Push service configured' : 'Push service not configured'} ·{' '}
              {pushStatus.registration?.active
                ? 'This device opted in'
                : 'This device not subscribed'}
            </Text>
            {pushStatus.admissionLimitReached ? (
              <Text style={styles.error}>
                Notification storage is full. Contact the service operator; Inbox results are
                retained.
              </Text>
            ) : null}
            <Text style={styles.footnote}>
              A service-provider receipt does not confirm that this phone displayed the
              notification.
            </Text>
            {pushStatus.deliveries.map((d: any) => (
              <Text key={d.notice_id} style={styles.footnote}>
                {d.status}
                {d.error ? ' · ' + d.error : ''}
              </Text>
            ))}
          </View>
        ) : null}
        <Button
          title="Disable this device's push"
          disabled={disabled}
          onPress={() =>
            perform(async () => {
              await client!.request('/push/disable', {});
              setPushStatus(await client!.request('/push/status'));
            })
          }
        />
        <Button title="Sign out" danger disabled={busy} onPress={logout} />
      </View>
      {devicesLoading ? (
        <Text>Loading devices…</Text>
      ) : !devices.length && online ? (
        <Text>No devices found.</Text>
      ) : null}
      {devices.map((d) => (
        <View key={d.id} style={styles.card}>
          <Text verbatim style={styles.heading}>
            {d.name}
          </Text>
          <Text>
            {d.platform} · {d.revoked ? 'Revoked' : 'Active'}
          </Text>
          <Button
            title="Revoke device"
            disabled={disabled || !!d.revoked || d.id === connection!.credentials.deviceId}
            danger
            onPress={() =>
              perform(async () => {
                await client!.request('/devices/revoke', { deviceId: d.id });
                setDevices((await client!.request('/devices')).items);
              })
            }
          />
        </View>
      ))}
    </>
  );
}

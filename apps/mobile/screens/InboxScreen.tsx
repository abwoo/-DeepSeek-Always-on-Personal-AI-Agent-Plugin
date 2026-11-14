import React from 'react';
import { View, Switch, Alert, Linking } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Button, Field, Text } from '../ui';
import { useAgentState } from '../state';
import { useUi } from '../theme';
import { uuid } from '../hooks/useAgent';
export function InboxScreen() {
  const { snapshot, online, busy, title, notice, perform, mutate, openRun, disabled } =
    useAgentState();
  const { styles } = useUi();
  return (
    <>
      {notice ? (
        <View style={styles.card}>
          <Text style={styles.heading}>{notice.title}</Text>
          <Text selectable verbatim>
            {notice.summary}
          </Text>
          <Button
            title="Open task result"
            disabled={busy || !online}
            onPress={() => openRun(notice.runId)}
          />
          <Button
            title="Mark read"
            disabled={disabled}
            onPress={() => perform(() => mutate({ action: 'inbox.read', data: { id: notice.id } }))}
          />
        </View>
      ) : null}
      {snapshot?.inbox.map((n) => (
        <View key={n.id} style={styles.card}>
          <Text style={styles.heading}>
            {n.read ? '' : '● '}
            {n.title}
          </Text>
          <Text selectable verbatim>
            {n.summary}
          </Text>
          <Text style={styles.footnote}>{new Date(n.createdAt).toLocaleString()}</Text>
          <Button
            title="Mark read"
            disabled={disabled || n.read}
            onPress={() => perform(() => mutate({ action: 'inbox.read', data: { id: n.id } }))}
          />
          <Button
            title="Open task result"
            disabled={busy || !online}
            onPress={() => openRun(n.runId)}
          />
        </View>
      ))}
    </>
  );
}

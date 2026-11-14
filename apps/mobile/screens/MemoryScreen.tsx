import React from 'react';
import { View, Switch, Alert, Linking } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Button, Field, Text } from '../ui';
import { useAgentState } from '../state';
import { useUi } from '../theme';
import { uuid } from '../hooks/useAgent';
export function MemoryScreen() {
  const {
    editingVersion,
    setEditingVersion,
    snapshot,
    title,
    memory,
    setMemory,
    kind,
    setKind,
    consent,
    setConsent,
    editing,
    setEditing,
    sessions,
    perform,
    mutate,
    disabled,
  } = useAgentState();
  const { styles } = useUi();
  return (
    <>
      <View style={styles.card}>
        <Text style={styles.heading}>{editing ? 'Edit saved memory' : 'Save a memory'}</Text>
        <View style={styles.row}>
          {(['fact', 'preference', 'project', 'goal'] as const).map((k) => (
            <Button key={k} title={k === kind ? '✓ ' + k : k} onPress={() => setKind(k)} />
          ))}
        </View>
        <Field label="Information to remember" value={memory} onChange={setMemory} multiline />
        <View style={styles.switchRow}>
          <Text style={styles.flexText}>I allow this information to be used across sessions.</Text>
          <Switch value={consent} onValueChange={setConsent} />
        </View>
        <Button
          title="Save with my consent"
          disabled={disabled || !consent || !memory.trim()}
          onPress={() =>
            perform(async () => {
              await mutate({
                action: 'memory.save',
                data: {
                  ...(editing ? { id: editing, expectedVersion: editingVersion } : {}),
                  kind,
                  content: memory,
                  source: 'Explicit mobile user consent',
                  consent: true,
                },
              });
              setMemory('');
              setEditing(undefined);
              setConsent(false);
            })
          }
        />
      </View>
      {snapshot?.memories.map((m) => (
        <View key={m.id} style={styles.card}>
          <Text style={styles.heading}>
            {m.kind} · {m.consent ? 'Saved' : 'Awaiting consent'}
          </Text>
          <Text selectable verbatim>
            {m.content}
          </Text>
          <Text style={styles.footnote}>
            {m.source} · {new Date(m.updatedAt).toLocaleString()}
          </Text>
          <View style={styles.row}>
            <Button
              title={m.consent ? 'Edit' : 'Review and confirm'}
              onPress={() => {
                setMemory(m.content);
                setKind(m.kind as typeof kind);
                setEditing(m.id);
                setEditingVersion(Number(m.version ?? 0));
                setConsent(false);
              }}
            />
            <Button
              title="Delete"
              danger
              disabled={disabled}
              onPress={() => perform(() => mutate({ action: 'memory.delete', data: { id: m.id } }))}
            />
          </View>
        </View>
      ))}
    </>
  );
}

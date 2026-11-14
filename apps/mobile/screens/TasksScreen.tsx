import React from 'react';
import { View, Switch, Alert, Linking } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Button, Field, Text } from '../ui';
import { useAgentState } from '../state';
import { useUi } from '../theme';
import { uuid } from '../hooks/useAgent';
export function TasksScreen() {
  const {
    snapshot,
    online,
    busy,
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
    kind,
    active,
    perform,
    mutate,
    openRun,
    disabled,
  } = useAgentState();
  const { styles } = useUi();
  return (
    <>
      <View style={styles.card}>
        <Text style={styles.heading}>Create a task</Text>
        <Field label="Task name" value={title} onChange={setTitle} />
        <Field
          label="What should your agent do?"
          value={instruction}
          onChange={setInstruction}
          multiline
        />
        <View style={styles.row}>
          {(['every', 'daily', 'once'] as const).map((s) => (
            <Button key={s} title={s === schedule ? '✓ ' + s : s} onPress={() => setSchedule(s)} />
          ))}
        </View>
        {schedule === 'every' ? (
          <Field label="Interval in minutes" value={minutes} onChange={setMinutes} />
        ) : (
          <>
            <Text>{schedule === 'once' ? date.toLocaleString() : date.toLocaleTimeString()}</Text>
            <View style={styles.row}>
              {schedule === 'once' ? (
                <Button title="Choose date" onPress={() => setPicker('date')} />
              ) : null}
              <Button title="Choose time" onPress={() => setPicker('time')} />
            </View>
            {picker ? (
              <DateTimePicker
                value={date}
                mode={picker}
                onChange={(_, next) => {
                  setPicker(null);
                  if (next) setDate(next);
                }}
              />
            ) : null}
          </>
        )}
        <View style={styles.switchRow}>
          <Text style={styles.flexText}>Allow read-only web research</Text>
          <Switch value={research} onValueChange={setResearch} />
        </View>
        <Button
          title="Create task"
          disabled={disabled || !title.trim() || !instruction.trim()}
          onPress={() =>
            perform(async () => {
              const timing =
                schedule === 'every'
                  ? { kind: 'every' as const, every_seconds: Number(minutes) * 60 }
                  : schedule === 'once'
                    ? { kind: 'at' as const, at: date.toISOString() }
                    : {
                        kind: 'daily' as const,
                        daily: {
                          time: `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`,
                          time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                        },
                      };
              await mutate({
                action: 'task.create',
                data: {
                  title,
                  instruction,
                  timing,
                  allowedTools: research ? ['web_search', 'web_fetch'] : [],
                },
              });
              setTitle('');
              setInstruction('');
            })
          }
        />
        <Text style={styles.footnote}>
          Default budget: 30 runs, 8 model steps and 3 minutes per run. External writes require
          native Harness approval.
        </Text>
      </View>
      {snapshot?.tasks.map((task) => (
        <View key={task.id} style={styles.card}>
          <Text verbatim style={styles.heading}>
            {task.title}
          </Text>
          <Text>
            {task.state} · next:{' '}
            {task.nextScheduledAt ? new Date(task.nextScheduledAt).toLocaleString() : '—'}
          </Text>
          <Text verbatim>{task.instruction}</Text>
          <View style={styles.row}>
            <Button
              title={task.state === 'active' ? 'Pause' : 'Resume'}
              disabled={disabled || task.state === 'cancelled'}
              onPress={() =>
                perform(() =>
                  mutate({
                    action: 'task.control',
                    data: {
                      id: task.id,
                      state: task.state === 'active' ? 'paused' : 'active',
                    },
                  }),
                )
              }
            />
            <Button
              title="Cancel"
              danger
              disabled={disabled}
              onPress={() =>
                perform(() =>
                  mutate({
                    action: 'task.control',
                    data: { id: task.id, state: 'cancelled' },
                  }),
                )
              }
            />
            <Button
              title="Run now"
              disabled={disabled || task.state !== 'active'}
              onPress={() => perform(() => mutate({ action: 'task.run', data: { id: task.id } }))}
            />
          </View>
          {snapshot.runs
            .filter((r) => r.taskId === task.id)
            .slice(0, 5)
            .map((run) => (
              <View key={run.id}>
                <Text>{run.status}</Text>
                {run.result ? <Text verbatim>{run.result.summary}</Text> : null}
                <Button
                  title="Open execution conversation"
                  disabled={busy || !online}
                  onPress={() => openRun(run.id)}
                />
              </View>
            ))}
        </View>
      ))}
    </>
  );
}

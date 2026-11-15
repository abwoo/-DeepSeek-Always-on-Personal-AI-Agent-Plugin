import { intervalSeconds } from '../forms';
import React from 'react';
import { View, Switch, Alert, Linking } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Button, Field, Text } from '../ui';
import { useAgentState } from '../state';
import { useUi } from '../theme';
import { uuid } from '../hooks/useAgent';
export function GoalsScreen() {
  const {
    snapshot,
    title,
    setTitle,
    instruction,
    setInstruction,
    minutes,
    setMinutes,
    active,
    client,
    perform,
    mutate,
    disabled,
  } = useAgentState();
  const { styles } = useUi();
  return (
    <>
      <View style={styles.card}>
        <Text style={styles.heading}>Ongoing goal</Text>
        <Field label="Goal name" maxLength={120} value={title} onChange={setTitle} />
        <Field
          label="What should the agent monitor?"
          maxLength={12000}
          value={instruction}
          onChange={setInstruction}
          multiline
        />
        <Field label="Check every N minutes" value={minutes} onChange={setMinutes} />
        <Button
          title="Authorize bounded goal"
          disabled={disabled || !title.trim() || !instruction.trim()}
          onPress={() =>
            perform(async () => {
              await client!.createGoal(uuid(), {
                title,
                instruction,
                everySeconds: intervalSeconds(minutes),
                allowedTools: ['web_search', 'web_fetch'],
                maxRuns: 30,
              });
              setTitle('');
              setInstruction('');
            })
          }
        />
        <Text>
          Uses native Schedule and the existing read-only task guard. No-change checks remain
          silent.
        </Text>
      </View>
      {snapshot?.goals.map((goal) => (
        <View key={goal.id} style={styles.card}>
          <Text verbatim style={styles.heading}>
            {goal.title}
          </Text>
          <Text verbatim>{goal.instruction}</Text>
          <Text>Task: {goal.taskId}</Text>
          <Text>{String(goal.state ?? 'active')}</Text>
          {goal.lastRun ? <Text>{String((goal.lastRun as any).status)}</Text> : null}
          <View style={styles.row}>
            <Button
              title="Pause goal"
              disabled={disabled || goal.state === 'cancelled'}
              onPress={() =>
                perform(() =>
                  mutate({
                    action: 'task.control',
                    data: { id: goal.taskId, state: 'paused' },
                  }),
                )
              }
            />
            <Button
              title="Resume goal"
              disabled={disabled || goal.state === 'cancelled'}
              onPress={() =>
                perform(() =>
                  mutate({
                    action: 'task.control',
                    data: { id: goal.taskId, state: 'active' },
                  }),
                )
              }
            />
          </View>
        </View>
      ))}
    </>
  );
}

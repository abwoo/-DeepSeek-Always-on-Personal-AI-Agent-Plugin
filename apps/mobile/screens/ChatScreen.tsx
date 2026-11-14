import React from 'react';
import { View, Switch, Alert, Linking } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Button, Field, Text } from '../ui';
import { useAgentState } from '../state';
import { useUi } from '../theme';
import { uuid, friendly } from '../hooks/useAgent';
export function ChatScreen() {
  const {
    liveText,liveTool,
    online,
    error,
    setError,
    busy,
    title,
    sessions,
    sessionId,
    setSessionId,
    session,
    setSession,
    focusedRun,
    setFocusedRun,
    message,
    setMessage,
    selected,
    focused,
    client,
    perform,
    mutate,
    openSession,
    disabled,
    rows,
  } = useAgentState();
  const { styles } = useUi();
  return (
    <>
      <Button
        title="New conversation"
        disabled={disabled}
        onPress={() =>
          perform(async () => {
            const result = await mutate({
              action: 'session.create',
              data: { creationId: 'session-' + uuid() },
            });
            const value = await client!.readSession(result.result.sessionId);
            focused.current = null;
            setFocusedRun(null);
            selected.current = result.result.sessionId;
            setSessionId(result.result.sessionId);
            setSession(value);
          })
        }
      />
      {sessions.map((item) => (
        <Button
          key={item.sessionId}
          title={item.sessionId}
          disabled={disabled}
          onPress={() => openSession(item.sessionId)}
        />
      ))}
      {sessionId ? (
        <>
          <Text selectable style={styles.footnote}>
            {sessionId}
          </Text>
          <Text>
            {session?.state?.running
              ? 'Agent running'
              : session?.state?.pendingInput?.length
                ? 'Requires attention on the managed Host'
                : 'Last confirmed conversation'}
          </Text>
          {focusedRun ? (
            <View style={styles.card}>
              <Text style={styles.heading}>Selected task execution · {focusedRun.status}</Text>
              <Text selectable style={styles.footnote}>
                {focusedRun.id}
              </Text>
              {focusedRun.result ? (
                <>
                  <Text selectable verbatim>
                    {focusedRun.result.summary}
                  </Text>
                  {focusedRun.result.sources.map((url: string) => (
                    <Button
                      key={url}
                      title={url}
                      onPress={() => {
                        if (url.startsWith('https://'))
                          void Linking.openURL(url).catch((e) => setError(friendly(e)));
                      }}
                    />
                  ))}
                </>
              ) : null}
              {focusedRun.error ? <Text style={styles.error}>{focusedRun.error}</Text> : null}
              <Button
                title="Continue this conversation"
                disabled={busy || !online}
                onPress={() => openSession(sessionId)}
              />
            </View>
          ) : null}
          {liveTool&&!focusedRun?<View style={styles.card}><Text>Preparing tool call</Text><Text verbatim>{liveTool}</Text></View>:null}
          {liveText && !focusedRun ? (
            <View style={styles.card}>
              <Text>Live partial reply</Text>
              <Text verbatim selectable>
                {liveText}
              </Text>
            </View>
          ) : null}
          {rows.map((row) => (
            <View key={row.id} style={styles.card}>
              <Text style={styles.heading}>
                {row.role === 'received'
                  ? 'Input received'
                  : row.role === 'assistant'
                    ? 'Agent'
                    : row.role === 'you'
                      ? 'You'
                      : 'Task / context'}
              </Text>
              <Text selectable verbatim>
                {row.text}
              </Text>
            </View>
          ))}
          {!focusedRun ? (
            <>
              <Field label="Message your agent" value={message} onChange={setMessage} multiline />
              <Button
                title="Send"
                disabled={disabled || !message.trim()}
                onPress={() =>
                  perform(async () => {
                    await mutate({
                      action: 'session.prompt',
                      data: { sessionId, text: message },
                    });
                    setMessage('');
                    setSession(await client!.readSession(sessionId));
                  })
                }
              />
              <Text style={styles.footnote}>
                An input receipt is not confirmation of model or business success.
              </Text>
            </>
          ) : null}
        </>
      ) : null}
    </>
  );
}

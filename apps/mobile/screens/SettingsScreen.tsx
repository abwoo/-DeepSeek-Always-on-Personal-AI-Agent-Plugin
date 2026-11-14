import React from 'react';
import { View, Share } from 'react-native';
import { Button, Text } from '../ui';
import { useAgentState } from '../state';
import { useUi } from '../theme';
export function SettingsScreen() {
  const { connection, logout, busy, error, client, perform, snapshot, online } = useAgentState(),
    { styles, language, setLanguage, theme, setTheme } = useUi();
  return (
    <View style={styles.card}>
      <Text style={styles.heading}>Account and settings</Text>
      <Text>Personal Agent conversations are hosted separately from local Harness workspaces.</Text>
      <Text>Language</Text>
      <View style={styles.row}>
        <Button
          title={(language === 'en' ? '✓ ' : '') + 'English'}
          onPress={() => setLanguage('en')}
        />
        <Button
          title={(language === 'zh' ? '✓ ' : '') + '简体中文'}
          onPress={() => setLanguage('zh')}
        />
      </View>
      <Text>Appearance</Text>
      <View style={styles.row}>
        {(['system', 'light', 'dark'] as const).map((mode) => (
          <Button
            key={mode}
            title={(theme === mode ? '✓ ' : '') + mode}
            onPress={() => setTheme(mode)}
          />
        ))}
      </View>
      <Text>
        Closing this app does not stop authorized cloud tasks. Local file and desktop actions
        require that device to be online and explicitly permitted.
      </Text>
      {snapshot?.usage ? (
        <>
          <Text>Daily model usage</Text>
          <Text>{snapshot.usage.steps} / 300</Text>
          <Text>{snapshot.usage.tokens} / 250000</Text>
        </>
      ) : null}
      {connection ? (
        <Button
          title="Export personal agent records"
          disabled={busy || !online}
          onPress={() =>
            perform(async () => {
              const data = await client!.request('/export');
              await Share.share({ message: JSON.stringify(data, null, 2) });
            })
          }
        />
      ) : null}
      <Text>
        Deleted memories are excluded from future requests. Historical conversations and retained
        backups are not retroactively erased.
      </Text>
      {connection ? <Button title="Sign out" danger disabled={busy} onPress={logout} /> : null}
      <Text style={styles.footnote}>
        Signing out revokes this device; it does not delete your hosted tasks or memories.
      </Text>
    </View>
  );
}

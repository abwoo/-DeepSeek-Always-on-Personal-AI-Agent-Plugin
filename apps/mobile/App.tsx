import React from 'react';
import {View,ScrollView,Pressable,StatusBar,KeyboardAvoidingView,Platform,Alert} from 'react-native';
import {SafeAreaProvider,SafeAreaView} from 'react-native-safe-area-context';
import {UiProvider,useUi} from './theme';
import {AgentState} from './state';
import {useAgent,pages} from './hooks/useAgent';
import {Button,Text} from './ui';
import {TasksScreen} from './screens/TasksScreen';
import {GoalsScreen} from './screens/GoalsScreen';
import {ChatScreen} from './screens/ChatScreen';
import {MemoryScreen} from './screens/MemoryScreen';
import {InboxScreen} from './screens/InboxScreen';
import {DevicesScreen} from './screens/DevicesScreen';
import {ActivityScreen} from './screens/ActivityScreen';
import {SettingsScreen} from './screens/SettingsScreen';
function AppContent(){const state=useAgent(),{styles}=useUi();return <AgentState.Provider value={state}><Product/></AgentState.Provider>;}
function Product(){const {connection, setConnection, loading, setLoading, storageReady, setStorageReady, deviceName, setDeviceName, snapshot, setSnapshot, online, setOnline, error, setError, busy, setBusy, page, setPage, pending, setPending, title, setTitle, instruction, setInstruction, minutes, setMinutes, schedule, setSchedule, date, setDate, picker, setPicker, research, setResearch, memory, setMemory, kind, setKind, consent, setConsent, editing, setEditing, sessions, setSessions, sessionId, setSessionId, session, setSession, focusedRun, setFocusedRun, message, setMessage, notice, setNotice, devices, setDevices, pairInfo, setPairInfo, pushStatus, setPushStatus, active, selected, focused, refreshing, inFlight, currentDevice, storage, client, report, refresh, perform, mutate, signIn, logout, openSession, openRun, enablePush, disabled, records, rows, loadDevices}=React.useContext(AgentState)!;const {styles}=useUi();
  if(loading)return <View style={styles.container}><Text>Loading secure connection…</Text></View>;
  if(!connection)return <ScrollView testID={storageReady?'secure-storage-ready':'secure-storage-unavailable'} contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
    <Text style={styles.title}>Your Personal Agent</Text><Text style={styles.subtitle}>Sign in to continue with your shared agent, tasks and memory.</Text>
    <Button title="Sign in" disabled={busy||!storageReady} onPress={signIn}/>
    {error?<Text accessibilityRole="alert" style={styles.error}>{error}</Text>:null}
    <Text style={styles.footnote}>Development preview · Production acceptance is still open.</Text>
    <SettingsScreen/>
  </ScrollView>;
  return (
    <View style={styles.fill}>
      <View style={styles.header}>
        <Text style={styles.title}>Always-on</Text>
        <Text numberOfLines={1} style={styles.subtitle}>
          {'Personal Agent'} ·{' '}
          {online ? 'Connected' : 'Offline — last confirmed data'}
        </Text>
        <View style={styles.row}>
          <Button title="Refresh" disabled={busy} onPress={() => refresh()} />
          <Button title="Notifications" disabled={disabled} onPress={enablePush} />
        </View>
      </View>
      <ScrollView
        horizontal
        style={styles.tabs}
        contentContainerStyle={styles.tabContent}
        showsHorizontalScrollIndicator={false}
      >
        {pages.map((p) => (
          <Pressable
            key={p}
            accessibilityRole="tab"
            accessibilityState={{ selected: page === p }}
            onPress={() => {
              setPage(p);
              if (p === 'Chat' && client)
                client
                  .sessions()
                  .then((s) => setSessions(s.items))
                  .catch(report);
              if (p === 'Devices') loadDevices();
            }}
            style={[styles.tab, page === p && styles.selected]}
          >
            <Text style={styles.tabText}>{p}</Text>
          </Pressable>
        ))}
      </ScrollView>
      <ScrollView
        style={styles.fill}
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        {error ? (
          <Text accessibilityRole="alert" style={styles.error}>
            {error}
          </Text>
        ) : null}
        {pending.length ? (
          <View style={styles.card}>
            <Text style={styles.heading}>Requests requiring review</Text>
            <Text>
              Unknown/not-recorded requests are never replayed. Check remote state before submitting
              a replacement.
            </Text>
            {pending.map((p) => (
              <View key={p.operationId}>
                <Text selectable>
                  {p.action} · {p.status} · {p.operationId}
                </Text>
                <Button
                  title="Dismiss after review"
                  onPress={() =>
                    Alert.alert(
                      'Dismiss this marker?',
                      'This does not undo or repeat any server work.',
                      [
                        { text: 'Cancel', style: 'cancel' },
                        {
                          text: 'Dismiss',
                          onPress: () =>
                            perform(async () => {
                              await storage!.remove(p.operationId);
                            }),
                        },
                      ],
                    )
                  }
                />
              </View>
            ))}
          </View>
        ) : null}
        {!snapshot ? (
          <Text>
            Connect to load your agent. The server continues working while this app is closed.
          </Text>
        ) : null}
        {page === 'Tasks' ? <TasksScreen /> : null}
        {page === 'Goals' ? <GoalsScreen /> : null}
        {page === 'Chat' ? <ChatScreen /> : null}
        {page === 'Memory' ? <MemoryScreen /> : null}
        {page === 'Inbox' ? <InboxScreen /> : null}
        {page === 'Devices' ? <DevicesScreen /> : null}
        {page === 'Activity' ? <ActivityScreen /> : null}
        {page === 'Settings' ? <SettingsScreen /> : null}
      </ScrollView>
      <View style={styles.footer}>
        <Text style={styles.footnote}>
          Development preview · Your managed Host keeps the shared state
        </Text>
      </View>
    </View>
  );
}function Shell(){const {styles,dark}=useUi();return <SafeAreaProvider><StatusBar barStyle={dark?'light-content':'dark-content'}/><SafeAreaView style={styles.fill} edges={['top','bottom']}><KeyboardAvoidingView style={styles.fill} behavior={Platform.OS==='ios'?'padding':undefined}><AppContent/></KeyboardAvoidingView></SafeAreaView></SafeAreaProvider>;}
export default function App(){return <UiProvider><Shell/></UiProvider>;}

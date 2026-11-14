import React from 'react';
import {View} from 'react-native';
import {Button,Text} from '../ui';
import {useAgentState} from '../state';
import {useUi} from '../theme';
export function ActivityScreen(){const {snapshot,openRun,busy,online}=useAgentState(),{styles}=useUi();return <>
  <Text style={styles.heading}>Activity</Text>{!snapshot?.runs.length?<Text>No task executions yet.</Text>:null}
  {snapshot?.runs.map(run=><View key={run.id} style={styles.card}><Text>{run.status}</Text><Text verbatim>{String(run.result?.summary??run.error??run.id)}</Text><Button title="Open task result" disabled={busy||!online} onPress={()=>openRun(run.id)}/></View>)}
</>;}

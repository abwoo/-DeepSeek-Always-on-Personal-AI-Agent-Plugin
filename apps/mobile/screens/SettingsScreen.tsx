import React from 'react';
import {View} from 'react-native';
import {Button,Text} from '../ui';
import {useAgentState} from '../state';
import {useUi} from '../theme';
export function SettingsScreen(){
  const {connection,logout,busy,error}=useAgentState(),{styles,language,setLanguage,theme,setTheme}=useUi();
  return <View style={styles.card}><Text style={styles.heading}>Account and settings</Text>
    <Text>Personal Agent conversations are hosted separately from local Harness workspaces.</Text>
    <Text>Language</Text><View style={styles.row}><Button title={(language==='en'?'✓ ':'')+'English'} onPress={()=>setLanguage('en')}/><Button title={(language==='zh'?'✓ ':'')+'简体中文'} onPress={()=>setLanguage('zh')}/></View>
    <Text>Appearance</Text><View style={styles.row}>{(['system','light','dark'] as const).map(mode=><Button key={mode} title={(theme===mode?'✓ ':'')+mode} onPress={()=>setTheme(mode)}/>)}</View>
    <Text>Closing this app does not stop authorized cloud tasks. Local file and desktop actions require that device to be online and explicitly permitted.</Text>
    <Button title="Sign out" danger disabled={busy} onPress={logout}/>
    <Text style={styles.footnote}>Signing out revokes this device; it does not delete your hosted tasks or memories.</Text>
  </View>;
}

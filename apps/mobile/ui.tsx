import React from 'react';
import {Pressable,Text as NativeText,TextInput,View,type TextProps} from 'react-native';
import {useUi} from './theme';
export function Text({children,verbatim=false,style,...props}:TextProps&{verbatim?:boolean}){
  const {colors,t}=useUi();
  return <NativeText {...props} style={[{color:colors.text},style]}>{verbatim?children:React.Children.map(children,child=>typeof child==='string'?t(child):child)}</NativeText>;
}
export function Button({title,onPress,disabled=false,danger=false}:{title:string;onPress:()=>void;disabled?:boolean;danger?:boolean}){
  const {styles,t}=useUi();return <Pressable accessibilityRole="button" accessibilityLabel={t(title)} disabled={disabled} onPress={onPress} style={[styles.button,danger&&styles.danger,disabled&&styles.disabled]}><Text style={styles.buttonText}>{t(title)}</Text></Pressable>;
}
export function Field({label,value,onChange,multiline=false,secret=false}:{label:string;value:string;onChange:(s:string)=>void;multiline?:boolean;secret?:boolean}){
  const {styles,t}=useUi();return <View style={styles.field}><Text style={styles.label}>{t(label)}</Text><TextInput accessibilityLabel={t(label)} autoCapitalize="none" autoCorrect={false} secureTextEntry={secret} multiline={multiline} value={value} onChangeText={onChange} style={[styles.input,multiline&&styles.multiline]}/></View>;
}

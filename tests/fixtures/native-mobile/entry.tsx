// Copied only into a temporary Android engineering flavor by the QA build script.
// Production AppEntry and production APK never include this bootstrap.
import React,{useEffect,useState} from 'react';
import {registerRootComponent} from 'expo';
import {fetch} from 'expo/fetch';
import {Text,View} from 'react-native';
import App from './App';
import {loadProductConnection,saveProductConnection} from './credentials';
function EngineeringBootstrap(){
 const [ready,setReady]=useState(false),[error,setError]=useState('');
 useEffect(()=>{let active=true;(async()=>{
  if(!await loadProductConnection()){
   const response=await fetch('https://127.0.0.1:8443/engineering/bootstrap');
   if(!response.ok)throw Error('Native engineering bootstrap unavailable');
   await saveProductConnection(await response.json());
  }
  if(active)setReady(true);
 })().catch(()=>{if(active)setError('Engineering bootstrap failed; inspect the private QA backend.');});return()=>{active=false;};},[]);
 return ready?<App/>:<View><Text>{error||'Engineering bootstrap: actual Harness, fixture identity/model'}</Text></View>;
}
registerRootComponent(EngineeringBootstrap);

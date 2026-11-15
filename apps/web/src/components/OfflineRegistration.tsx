'use client';
import {useEffect} from 'react';

export function OfflineRegistration(){
  useEffect(()=>{
    if(!('serviceWorker' in navigator)||!window.isSecureContext)return;
    // Registration does not cache responses. The worker only stores a generic
    // offline page, and never intercepts account, seller or API requests.
    navigator.serviceWorker.register('/sw.js',{scope:'/'}).catch(()=>{});
  },[]);
  return null;
}

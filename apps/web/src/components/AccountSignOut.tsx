'use client';

import {useRef,useState} from 'react';
import type {Locale} from '@/lib/i18n';
import {logoutCurrentAccount} from '@/lib/account-logout-client.mjs';

const labels={
 kk:{
  signOut:'Аккаунттан шығу',busy:'Шығу орындалуда…',
  localOnly:'Бұл құрылғыдағы кіру cookie-і өшірілді, бірақ серверде сессияның тоқтатылғаны расталмады. Басқа құрылғылардағы сессияларды тексеріңіз.',
  failed:'Шығу расталмады. Қайта көріңіз.',
  back:'Каталогқа қайту',
 },
 ru:{
  signOut:'Выйти из аккаунта',busy:'Выход из аккаунта…',
  localOnly:'Cookie входа на этом устройстве удалён, но завершение сеанса на сервере не подтверждено. Проверьте сеансы на других устройствах.',
  failed:'Выход не подтверждён. Повторите попытку.',
  back:'Вернуться в каталог',
 },
} as const;

export function AccountSignOut({locale}:{locale:Locale}){
 const t=labels[locale];
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState('');
 const [localOnly,setLocalOnly]=useState(false);
 const gate=useRef(false);
 async function signOut(){
  if(gate.current)return;
  gate.current=true;setBusy(true);setMessage('');
  try{
   const outcome=await logoutCurrentAccount();
   if(outcome==='confirmed'){
    // A full navigation destroys the private React tree and BFF cache.
    window.location.replace('/'+locale);
    return;
   }
   if(outcome==='local_only'){
    // Backend revocation was not confirmed. Do not claim a successful
    // logout or preserve a retry-able CSRF token in this component.
    setLocalOnly(true);setMessage(t.localOnly);
   }else{
    setMessage(t.failed);
   }
  }finally{
   gate.current=false;setBusy(false);
  }
 }
 return <section aria-label={t.signOut}>
  {!localOnly&&<button type="button" onClick={()=>void signOut()}
    disabled={busy} style={{minHeight:44,padding:'10px 16px',
      borderRadius:10,border:'1px solid currentColor',cursor:'pointer'}}>
    {busy?t.busy:t.signOut}
  </button>}
  {message&&<p role="alert">{message}</p>}
  {localOnly&&<a href={'/'+locale}>{t.back}</a>}
 </section>;
}

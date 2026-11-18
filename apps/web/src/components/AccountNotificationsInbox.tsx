'use client';

import {useCallback,useEffect,useRef,useState} from 'react';
import type {Locale} from '@/lib/i18n';
import type {AccountNotification} from '@/lib/account-notifications-transport.mjs';
import {readNotificationBrowserReply,notificationTopicLabel}
 from '@/lib/account-notifications-ui.mjs';

const strings={
 kk:{title:'Хабарламалар',refresh:'Жаңарту',loading:'Жүктелуде…',
  empty:'Әзірге хабарлама жоқ',error:'Хабарламаларды жүктеу мүмкін болмады.',
  unauthorized:'Сессия аяқталды. Аккаунтқа қайта кіріңіз.',
  note:'Бұл — қосымша ішіндегі хабарлама. SMS немесе email жіберілгенін білдірмейді.'},
 ru:{title:'Уведомления',refresh:'Обновить',loading:'Загрузка…',
  empty:'Уведомлений пока нет',error:'Не удалось загрузить уведомления.',
  unauthorized:'Сессия завершилась. Войдите снова.',
  note:'Это уведомление внутри приложения, оно не подтверждает отправку SMS или email.'},
} as const;

export function AccountNotificationsInbox({locale}:{locale:Locale}){
 const t=strings[locale];
 const [items,setItems]=useState<AccountNotification[]|null>(null);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const generation=useRef(0);
 const active=useRef<AbortController|null>(null);
 const load=useCallback(async()=>{
  if(active.current)return;
  const controller=new AbortController();
  active.current=controller;
  // Never keep an old account's private inbox visible while the backend
  // revalidates the current cookie (including after session revocation).
  setItems(null);setBusy(true);setError('');
  const current=++generation.current;
  try{
   const response=await fetch('/api/account/notifications',{
    credentials:'same-origin',cache:'no-store',redirect:'error',
    headers:{Accept:'application/json'},signal:AbortSignal.any([controller.signal,AbortSignal.timeout(8000)]),
   });
   if(!response.ok)throw new Error(response.status===401?'unauthorized':'unavailable');
   const result=await readNotificationBrowserReply(response);
   if(current===generation.current)setItems(result.items);
  }catch(e){
   if(current===generation.current){
    setItems(null);
    setError(e instanceof Error&&e.message==='unauthorized'?t.unauthorized:t.error);
   }
  }finally{
   if(active.current===controller)active.current=null;
   if(current===generation.current)setBusy(false);
  }
 },[t.error,t.unauthorized]);
 // Schedule the initial load after the effect callback. This avoids a
 // synchronous state cascade and cancels Strict Mode's discarded mount.
 useEffect(()=>{
  const timer=setTimeout(()=>{void load();},0);
  return ()=>{
   clearTimeout(timer);generation.current++;
   const previous=active.current;
   active.current=null;
   previous?.abort();
  };
 },[load]);
 return <section aria-label={t.title}>
  <h2>{t.title}</h2><p>{t.note}</p>
  <button type="button" onClick={()=>void load()} disabled={busy}>
   {busy?t.loading:t.refresh}
  </button>
  {error&&<p role="alert">{error}</p>}
  {!busy&&items?.length===0&&<p role="status">{t.empty}</p>}
  {items&&<ul>{items.map(item=><li key={item.id}>
    <strong>{notificationTopicLabel(locale,item.topic)}</strong> <time dateTime={item.created_at}>
     {item.created_at.slice(0,10)}</time>
   </li>)}</ul>}
 </section>;
}

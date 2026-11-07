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
 const lock=useRef(false);
 const load=useCallback(async()=>{
  if(lock.current)return;
  lock.current=true;setBusy(true);setError('');
  const current=++generation.current;
  try{
   const response=await fetch('/api/account/notifications',{
    credentials:'same-origin',cache:'no-store',redirect:'error',
    headers:{Accept:'application/json'},signal:AbortSignal.timeout(8000),
   });
   if(!response.ok)throw new Error(response.status===401?'unauthorized':'unavailable');
   const result=await readNotificationBrowserReply(response);
   if(current===generation.current)setItems(result.items);
  }catch(e){
   if(current===generation.current){
    setItems(null);
    setError(e instanceof Error&&e.message==='unauthorized'?t.unauthorized:t.error);
   }
  }finally{lock.current=false;if(current===generation.current)setBusy(false);}
 },[t.error,t.unauthorized]);
 useEffect(()=>{void load();return ()=>{generation.current++;};},[load]);
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

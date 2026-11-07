'use client';

import {useCallback,useEffect,useRef,useState} from 'react';
import type {Locale} from '@/lib/i18n';
import {
 loadAccountDevices,revokeOtherAccountDevice,
 type AccountDeviceItem,
} from '@/lib/account-device-client.mjs';
import styles from './AccountDeviceSessions.module.css';

const messages={
 kk:{
  heading:'Құрылғылар мен сессиялар',loading:'Сессиялар жүктелуде…',
  empty:'Белсенді сессия табылмады.',current:'Осы құрылғы',
  unnamed:'Атауы көрсетілмеген құрылғы',lastUsed:'Соңғы белсенділік',
  notRecorded:'Белгісіз',expires:'Мерзімі',revoke:'Шығару',
  busy:'Тоқтатылуда…',refresh:'Жаңарту',error:'Сессияларды жүктеу мүмкін болмады.',
  failed:'Сессияны тоқтату расталмады. Тізімді жаңартыңыз.',
  expired:'Аккаунт сессиясы аяқталды. Қайта кіріңіз.',
  currentError:'Ағымдағы құрылғыдан шығу үшін аккаунттан шығу әрекетін қолданыңыз.',
 },
 ru:{
  heading:'Устройства и сеансы',loading:'Загрузка сеансов…',
  empty:'Активных сеансов нет.',current:'Это устройство',
  unnamed:'Устройство без названия',lastUsed:'Последняя активность',
  notRecorded:'Неизвестно',expires:'Истекает',revoke:'Завершить',
  busy:'Завершается…',refresh:'Обновить',error:'Не удалось загрузить сеансы.',
  failed:'Завершение сеанса не подтверждено. Обновите список.',
  expired:'Сеанс аккаунта завершён. Войдите снова.',
  currentError:'Для выхода на этом устройстве используйте выход из аккаунта.',
 },
} as const;

export function AccountDeviceSessions({locale}:{locale:Locale}){
 const t=messages[locale];
 const [items,setItems]=useState<AccountDeviceItem[]>([]);
 const [csrf,setCsrf]=useState<string|null>(null);
 const [busy,setBusy]=useState<string|null>(null);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState<string|null>(null);
 const requestId=useRef(0);
 const alive=useRef(true);
 const refresh=useCallback(async()=>{
  const seq=++requestId.current;
  setLoading(true);setError(null);
  try{
   const page=await loadAccountDevices();
   if(!alive.current||seq!==requestId.current)return;
   setItems(page.items);setCsrf(page.csrf);
  }catch(err){
   if(!alive.current||seq!==requestId.current)return;
   setCsrf(null);setItems([]);
   setError(err instanceof Error&&err.name==='AccountDeviceAuthenticationRequired'
    ?t.expired:t.error);
  }finally{
   if(alive.current&&seq===requestId.current)setLoading(false);
  }
 },[t.error,t.expired]);
 useEffect(()=>{
  alive.current=true;
  void refresh();
  return ()=>{alive.current=false;requestId.current++;};
 },[refresh]);
 async function revoke(item:AccountDeviceItem){
  if(busy!==null||loading||!csrf||item.current)return;
  setBusy(item.id);setError(null);
  try{
   const outcome=await revokeOtherAccountDevice({sessionId:item.id,csrf});
   if(!alive.current)return;
   if(outcome==='ok'){
    // Trust only the fresh backend list, never optimistic deletion.
    await refresh();
   }else if(outcome==='authentication_required'){
    setCsrf(null);setError(t.expired);
   }else{
    setError(outcome==='current_session'?t.currentError:t.failed);
   }
  }finally{if(alive.current)setBusy(null);}
 }
 const format=(value:string|null)=>value?new Date(value).toLocaleString(locale==='kk'?'kk-KZ':'ru-RU'):t.notRecorded;
 return <section className={styles.panel} aria-labelledby="account-device-title">
  <div className={styles.top}>
   <h2 id="account-device-title">{t.heading}</h2>
   <button type="button" disabled={loading||busy!==null}
    onClick={()=>void refresh()}>{t.refresh}</button>
  </div>
  {loading&&<p role="status">{t.loading}</p>}
  {error&&<p role="alert">{error}</p>}
  {!loading&&!error&&items.length===0&&<p role="status">{t.empty}</p>}
  {items.length>0&&<ul className={styles.list}>{items.map(item=>
   <li key={item.id} className={styles.device}>
    <div>
     <strong>{item.deviceLabel||t.unnamed}</strong>
     {item.current&&<span className={styles.current}>{t.current}</span>}
     <p>{t.lastUsed}: {format(item.lastUsedAt)}</p>
     <p>{t.expires}: {format(item.expiresAt)}</p>
    </div>
    {!item.current&&<button type="button"
     disabled={loading||busy!==null||csrf===null}
     onClick={()=>void revoke(item)}>
      {busy===item.id?t.busy:t.revoke}
    </button>}
   </li>)}</ul>}
 </section>;
}

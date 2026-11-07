'use client';

import {useRef,useState} from 'react';
import type {Locale} from '@/lib/i18n';
import {parseSellerDecisionReceipt} from '@/lib/seller-decision-ui-core.mjs';

type Decision='accept'|'decline';
type Result={id:string;state:'accepted'|'declined';version:number;replayed:boolean};
const copy={
  kk:{accept:'Қабылдау',decline:'Бас тарту',working:'Өңделуде…',
    failed:'Әрекет орындалмады. Өтінім мәртебесін жаңартыңыз.',
    confirm:'Бұл өтінімді қабылдаудан бас тартасыз ба?'},
  ru:{accept:'Принять',decline:'Отклонить',working:'Обработка…',
    failed:'Не удалось выполнить действие. Обновите статус заявки.',
    confirm:'Вы уверены, что хотите отклонить заявку?'},
} as const;

/** Receives a trusted authenticated action from a server-backed parent.
 * Never stores or accepts bearer tokens in browser props.
 */
export function SellerDecisionActions({locale,requestId,version,onDecision,onSuccess}:{
  locale:Locale;requestId:string;version:number;
  onDecision:(requestId:string,action:Decision,version:number,key:string)=>Promise<Result>;
  onSuccess:(result:Result)=>void;
}){
  const t=copy[locale];
  const locked=useRef(false);
  const pendingKey=useRef<{action:Decision;key:string}|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState(false);
  async function submit(action:Decision){
    if(locked.current)return;
    if(action==='decline'&&!window.confirm(t.confirm))return;
    locked.current=true;setBusy(true);setError(false);
    if(pendingKey.current?.action!==action){
      pendingKey.current={action,key:crypto.randomUUID()};
    }
    try{
      const result=await onDecision(requestId,action,version,pendingKey.current.key);
      const verified=parseSellerDecisionReceipt(result,requestId,action,version);
      pendingKey.current=null;
      onSuccess(verified);
    }catch{
      setError(true);
    }finally{locked.current=false;setBusy(false);}
  }
  return <div>
    <div style={{display:'flex',gap:10,flexWrap:'wrap',marginTop:12}}>
      <button type="button" disabled={busy} onClick={()=>void submit('accept')}>
        {busy?t.working:t.accept}
      </button>
      <button type="button" disabled={busy} onClick={()=>void submit('decline')}>
        {t.decline}
      </button>
    </div>
    {error&&<p role="alert">{t.failed}</p>}
  </div>;
}

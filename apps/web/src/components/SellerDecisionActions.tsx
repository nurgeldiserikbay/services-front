'use client';

import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import type {Locale} from '@/lib/i18n';
import {isCurrentSellerDecisionResponse,nextSellerDecisionAttempt,parseSellerDecisionReceipt} from '@/lib/seller-decision-ui-core.mjs';

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
  const validContext=Number.isSafeInteger(version)&&version>=1&&
    version<Number.MAX_SAFE_INTEGER&&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId);
  const locked=useRef(false);
  const pendingKey=useRef<{requestId:string;version:number;action:Decision;key:string}|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState(false);
  const [committed,setCommitted]=useState(false);
  const [committedState,setCommittedState]=useState<Decision|null>(null);
  const committedRef=useRef(false);
  const context=useRef({requestId,version});
  const generation=useRef(0);
  // Invalidate only committed context changes; rendering must remain pure.
  useLayoutEffect(()=>{
    if(context.current.requestId!==requestId||context.current.version!==version){
      context.current={requestId,version};
      generation.current++;
      pendingKey.current=null;
      locked.current=false;
      setBusy(false);
      setError(false);
      committedRef.current=false;
      setCommitted(false);
      setCommittedState(null);
    }
  },[requestId,version]);
  useEffect(()=>()=>{generation.current++;},[]);
  async function submit(action:Decision){
    if(locked.current||committedRef.current||!validContext)return;
    if(action==='decline'&&!window.confirm(t.confirm))return;
    const attemptGeneration=generation.current;
    locked.current=true;setBusy(true);setError(false);
    try{
      pendingKey.current=nextSellerDecisionAttempt(
        pendingKey.current,requestId,version,action,crypto.randomUUID(),
      );
      const result=await onDecision(requestId,action,version,pendingKey.current.key);
      if(!isCurrentSellerDecisionResponse(attemptGeneration,generation.current,
        requestId,context.current.requestId,version,context.current.version))return;
      const verified=parseSellerDecisionReceipt(result,requestId,action,version);
      pendingKey.current=null;
      // A committed decision cannot be submitted again before parent context refreshes.
      committedRef.current=true;
      setCommitted(true);
      setCommittedState(action);
      // A parent callback error must not be mistaken for a failed server decision.
      try{onSuccess(verified);}catch(error){
        console.error('Seller decision committed, but parent update failed',error);
      }
    }catch{
      if(isCurrentSellerDecisionResponse(attemptGeneration,generation.current,
        requestId,context.current.requestId,version,context.current.version))setError(true);
    }finally{
      if(isCurrentSellerDecisionResponse(attemptGeneration,generation.current,
        requestId,context.current.requestId,version,context.current.version)){
        locked.current=false;setBusy(false);
      }
    }
  }
  return <div>
    <div style={{display:'flex',gap:10,flexWrap:'wrap',marginTop:12}}>
      <button type="button" aria-busy={busy} disabled={busy||committed||!validContext} onClick={()=>void submit('accept')}>
        {busy?t.working:t.accept}
      </button>
      <button type="button" aria-busy={busy} disabled={busy||committed||!validContext} onClick={()=>void submit('decline')}>
        {busy?t.working:t.decline}
      </button>
    </div>
    {busy&&<span role="status" aria-live="polite" style={{position:'absolute',width:1,height:1,overflow:'hidden',clipPath:'inset(50%)'}}>{t.working}</span>}
    {committedState&&<p role="status" aria-live="polite">{committedState==='accept'?
      (locale==='kk'?'Өтінім қабылданды':'Заявка принята'):
      (locale==='kk'?'Өтінім қабылданбады':'Заявка отклонена')}</p>}
    {!validContext&&<p role="alert">{locale==='kk'?
      'Өтінім деректері жарамсыз. Бетті жаңартыңыз.':
      'Данные заявки недействительны. Обновите страницу.'}</p>}
    {error&&<p role="alert">{t.failed}</p>}
  </div>;
}

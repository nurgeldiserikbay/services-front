'use client';

import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import type {Locale} from '@/lib/i18n';
import {isCurrentSellerDecisionResponse,nextSellerDecisionAttempt,parseSellerDecisionReceipt} from '@/lib/seller-decision-ui-core.mjs';
import {withSellerDecisionDeadline} from '@/lib/seller-decision-timeout.mjs';

type Decision='accept'|'decline';
type Result={id:string;state:'accepted'|'declined';version:number;replayed:boolean};
const copy={
  kk:{accept:'Қабылдау',decline:'Бас тарту',working:'Өңделуде…',
    failed:'Әрекет орындалмады. Өтінім мәртебесін жаңартыңыз.',
    uncertain:'Сервер жауабы белгісіз. Басқа шешім қабылдамас бұрын өтінім мәртебесін жаңартыңыз.',
    confirm:'Бұл өтінімді қабылдаудан бас тартасыз ба?'},
  ru:{accept:'Принять',decline:'Отклонить',working:'Обработка…',
    failed:'Не удалось выполнить действие. Обновите статус заявки.',
    uncertain:'Ответ сервера неизвестен. Обновите статус заявки перед выбором другого решения.',
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
    typeof requestId==='string'&&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId);
  const locked=useRef(false);
  const pendingKey=useRef<{requestId:string;version:number;action:Decision;key:string}|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState(false);
  const [uncertainAction,setUncertainAction]=useState<Decision|null>(null);
  const [committed,setCommitted]=useState(false);
  const [committedState,setCommittedState]=useState<Decision|null>(null);
  const committedRef=useRef(false);
  const context=useRef({requestId,version});
  const generation=useRef(0);
  // Invalidate only committed context changes; rendering must remain pure.
  useLayoutEffect(()=>{
    if(typeof context.current.requestId!=='string'||typeof requestId!=='string'||
      context.current.requestId.toLowerCase()!==requestId.toLowerCase()||
      context.current.version!==version){
      context.current={requestId,version};
      generation.current++;
      pendingKey.current=null;
      locked.current=false;
      setBusy(false);
      setError(false);
      setUncertainAction(null);
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
      // A stalled action must not lock both buttons forever. Retrying uses the
      // same idempotency key, so an uncertain server outcome is not duplicated.
      // Snapshot the key before the deadline helper schedules its callback.
      // A receipt switch can clear pendingKey.current in the meantime.
      const attemptKey=pendingKey.current.key;
      const result=await withSellerDecisionDeadline(
        ()=>onDecision(requestId,action,version,attemptKey),
      );
      if(!isCurrentSellerDecisionResponse(attemptGeneration,generation.current,
        requestId,context.current.requestId,version,context.current.version))return;
      const verified=parseSellerDecisionReceipt(result,requestId,action,version);
      pendingKey.current=null;
      setUncertainAction(null);
      // A committed decision cannot be submitted again before parent context refreshes.
      committedRef.current=true;
      setCommitted(true);
      setCommittedState(action);
      // A parent callback error must not be mistaken for a failed server decision.
      try{onSuccess(verified);}catch{
        // Callback exceptions may contain private request or account details.
        // The server decision is already committed: do not expose the exception.
        console.error('Seller decision committed, but parent update failed');
      }
    }catch{
      if(isCurrentSellerDecisionResponse(attemptGeneration,generation.current,
        requestId,context.current.requestId,version,context.current.version)){
        setError(true);
        // The server may have committed even when the response was lost.
        // Only the original action may be retried with its idempotency key.
        setUncertainAction(pendingKey.current?.action??null);
      }
    }finally{
      if(isCurrentSellerDecisionResponse(attemptGeneration,generation.current,
        requestId,context.current.requestId,version,context.current.version)){
        locked.current=false;setBusy(false);
      }
    }
  }
  return <div>
    <div style={{display:'flex',gap:10,flexWrap:'wrap',marginTop:12}}>
      <button type="button" aria-busy={busy} disabled={busy||committed||!validContext||uncertainAction==='decline'} onClick={()=>void submit('accept')}>
        {busy?t.working:t.accept}
      </button>
      <button type="button" aria-busy={busy} disabled={busy||committed||!validContext||uncertainAction==='accept'} onClick={()=>void submit('decline')}>
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
    {error&&<p role="alert">{uncertainAction?t.uncertain:t.failed}</p>}
  </div>;
}

'use client';

import {useEffect,useRef,useState} from 'react';
import type {Locale} from '@/lib/i18n';
import {readGuestCompletionUiResponse}
 from '@/lib/guest-completion-ui-core.mjs';
import {RequestMutationGate} from './RequestMutationGate';
import {CustomerScheduleProposal} from './CustomerScheduleProposal';
import {ScheduleResolution} from './ScheduleResolution';
import {readGuestActiveSchedule} from '@/lib/customer-schedule-ui-core.mjs';
import type {ActiveScheduleView} from '@/lib/account-session-transport.mjs';
import styles from './GuestRequestCompletion.module.css';

type Phase='idle'|'challenge'|'verified';
const copy={
 kk:{
  heading:'Қызмет уақытын өзгерту',
  note:'Уақытты өзгерту үшін байланыс арнасына жіберілген кодты растаңыз.',
  start:'Растау кодын сұрау',code:'Алты таңбалы код',
  verify:'Кодты тексеру',
  busy:'Сұрау орындалуда…',failed:'Әрекетті қазір аяқтау мүмкін болмады. Қайта тексеріңіз.',
  finished:'Қайта жоспарлау рұқсаты расталды.',
 },
 ru:{
  heading:'Изменить время услуги',
  note:'Для изменения времени подтвердите код, отправленный на ваш контакт.',
  start:'Запросить код',code:'Шестизначный код',
  verify:'Проверить код',
  busy:'Выполняем запрос…',failed:'Не удалось завершить действие. Проверьте статус заявки.',
  finished:'Доступ к изменению времени подтверждён.',
 },
} as const;
type Props={locale:Locale;requestId:string;onVerified?:(csrf:string)=>void};
const CSRF=/^[A-Za-z0-9_-]{43}$/;

/** No OTP, CSRF or challenge is stored beyond this mounted receipt's memory.
 * The trusted production ingress (not browser JS) must sign network proof.
 * All endpoints remain feature-flagged off until edge/provider approval.
 */
export function GuestRequestSchedule({locale,requestId,onVerified}:Props){
 const t=copy[locale];
 const [phase,setPhase]=useState<Phase>('idle');
 const [challenge,setChallenge]=useState<string|null>(null);
 const [code,setCode]=useState('');
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState(false);
 const [view,setView]=useState<ActiveScheduleView|null>(null);
 const [epoch,setEpoch]=useState(0);
 const version=useRef(0);
 const controller=useRef<AbortController|null>(null);
 const locked=useRef(false);
 const csrf=useRef<string|null>(null);
 const [verifiedCsrf,setVerifiedCsrf]=useState<string|null>(null);
 useEffect(()=>()=>{controller.current?.abort();csrf.current=null;},[]);
 async function send(suffix:string,body?:object){
  controller.current?.abort();
  const abort=new AbortController();controller.current=abort;
  const signal=AbortSignal.any([abort.signal,AbortSignal.timeout(8000)]);
  const headers:Record<string,string>={};
  if(body){headers['Content-Type']='application/json';headers['X-Services-CSRF']=csrf.current??'';}
  const response=await fetch('/api/guest-requests/'+encodeURIComponent(requestId)+'/schedule-access'+suffix,{
   method:body?'POST':'GET',credentials:'same-origin',cache:'no-store',
   redirect:'error',headers,body:body?JSON.stringify(body):undefined,signal,
  });
  return response;
 }
 async function load(){
  if(locked.current||!csrf.current)return;
  locked.current=true;setBusy(true);setError(false);setView(null);
  try{
   controller.current?.abort();const abort=new AbortController();controller.current=abort;
   const signal=AbortSignal.any([abort.signal,AbortSignal.timeout(8000)]);
   const response=await fetch('/api/guest-requests/'+encodeURIComponent(requestId)+'/schedule-proposals/active',{
    method:'POST',credentials:'same-origin',cache:'no-store',redirect:'error',
    headers:{'Content-Type':'application/json','X-Services-CSRF':csrf.current},body:'{}',signal,
   });
   const next=await readGuestActiveSchedule(response,requestId);
   if(signal.aborted||!next||next.request_version<version.current)throw new Error('schedule_unavailable');
   version.current=next.request_version;setView(next);setEpoch(v=>v+1);
  }catch{setError(true);}
  finally{locked.current=false;setBusy(false);}
 }
 async function operation(action:'start'|'verify'){
  if(locked.current||phase==='verified')return;
  locked.current=true;setBusy(true);setError(false);
  try{
   if(action==='start'&&phase==='idle'){
    const bootstrap=await send('/bootstrap');
    const ready=await readGuestCompletionUiResponse(bootstrap,'bootstrap');
    if(typeof ready.csrfToken!=='string'||!CSRF.test(ready.csrfToken))throw new Error('csrf_unavailable');
    csrf.current=ready.csrfToken;
    const response=await send('/challenges',{locale});
    const result=await readGuestCompletionUiResponse(response,'challenge');
    if(typeof result.challengeId!=='string')throw new Error('challenge_unavailable');
    setChallenge(result.challengeId);setPhase('challenge');
   }else if(action==='verify'&&phase==='challenge'&&challenge&&/^[0-9]{6}$/.test(code)){
    const response=await send('/challenges/'+challenge+'/verify',{code});
    const result=await readGuestCompletionUiResponse(response,'verify');
    if(result.verified!==true)throw new Error('verification_failed');
    setCode('');setChallenge(null);setPhase('verified');
    if(csrf.current){setVerifiedCsrf(csrf.current);onVerified?.(csrf.current);}
   }
  }catch{
   setCode('');
   setError(true);
  }finally{locked.current=false;setBusy(false);}
 }
 return <section className={styles.panel} aria-label={t.heading}>
  <h4>{t.heading}</h4>
  <p>{t.note}</p>
  {phase==='idle'&&<button type="button" disabled={busy}
   onClick={()=>void operation('start')}>{t.start}</button>}
  {phase==='challenge'&&<>
   <label htmlFor={'guest-schedule-code-'+requestId}>{t.code}</label>
   <input id={'guest-schedule-code-'+requestId} value={code} inputMode="numeric"
    type="text" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6}
    disabled={busy} onChange={e=>setCode(e.target.value.replace(/[^0-9]/g,'').slice(0,6))}/>
   <button type="button" disabled={busy||code.length!==6}
    onClick={()=>void operation('verify')}>{t.verify}</button>
  </>}
  {phase==='verified'&&<>
   <p role="status">{t.finished}</p>
   {!view&&<button type="button" disabled={busy} onClick={()=>void load()}>{locale==='kk'?'Уақыт ұсынысын көру':'Посмотреть предложение времени'}</button>}
   {view&&verifiedCsrf&&<RequestMutationGate key={requestId+'|'+view.request_version+'|'+epoch}>
    <ScheduleResolution guest view={view} csrf={verifiedCsrf} locale={locale} onChanged={()=>void load()} onRecover={()=>void load()}/>
    {view.can_propose&&<CustomerScheduleProposal guest requestId={requestId} version={view.request_version} csrf={verifiedCsrf} locale={locale} onChanged={()=>void load()} onRecover={()=>void load()}/>}
   </RequestMutationGate>}
  </>}
  {busy&&<p role="status">{t.busy}</p>}
  {error&&<p role="alert" className={styles.error}>{t.failed}</p>}
 </section>;
}

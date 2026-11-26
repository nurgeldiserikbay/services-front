'use client';

import {useEffect,useRef,useState} from 'react';
import type {Locale} from '@/lib/i18n';
import {readGuestCompletionUiResponse}
 from '@/lib/guest-completion-ui-core.mjs';
import styles from './GuestRequestCompletion.module.css';

type Phase='idle'|'challenge'|'verified';
const copy={
 kk:{
  heading:'Қызмет уақытын өзгерту',
  note:'Уақытты өзгерту үшін байланыс арнасына жіберілген кодты растаңыз.',
  start:'Растау кодын сұрау',code:'Алты таңбалы код',
  verify:'Кодты тексеру',confirm:'Қызмет аяқталды деп растау',
  busy:'Сұрау орындалуда…',failed:'Әрекетті қазір аяқтау мүмкін болмады. Қайта тексеріңіз.',
  uncertain:'Нәтиже белгісіз. Күйді жаңартыңыз; сұрауды автоматты түрде қайталамаңыз.',
  finished:'Қайта жоспарлау рұқсаты расталды.',refresh:'Күйді жаңарту',
 },
 ru:{
  heading:'Изменить время услуги',
  note:'Для изменения времени подтвердите код, отправленный на ваш контакт.',
  start:'Запросить код',code:'Шестизначный код',
  verify:'Проверить код',confirm:'Подтвердить завершение услуги',
  busy:'Выполняем запрос…',failed:'Не удалось завершить действие. Проверьте статус заявки.',
  uncertain:'Результат неизвестен. Обновите статус, не отправляйте подтверждение автоматически повторно.',
  finished:'Доступ к изменению времени подтверждён.',refresh:'Обновить статус',
 },
} as const;
type Props={locale:Locale;requestId:string;onVerified:(csrf:string)=>void};
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
 const controller=useRef<AbortController|null>(null);
 const locked=useRef(false);
 const csrf=useRef<string|null>(null);
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
    if(csrf.current)onVerified(csrf.current);
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
  {phase==='verified'&&<p role="status">{t.finished}</p>}
  {busy&&<p role="status">{t.busy}</p>}
  {error&&<p role="alert" className={styles.error}>{t.failed}</p>}
 </section>;
}

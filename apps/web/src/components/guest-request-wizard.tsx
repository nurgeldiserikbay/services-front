'use client';

import {useEffect,useRef,useState,type FormEvent} from 'react';
import {validateInquiryDraft,type InquiryChannel} from '@/lib/guest-inquiry';
import {parseCommittedCreateReceipt} from '@/lib/guest-create-ui';
import type {Locale} from '@/lib/i18n';

type Step='draft'|'verify'|'create'|'done';
type Props={offerId:string;locale:Locale};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TOKEN=/^[A-Za-z0-9_-]{43}$/;

const labels={
  kk:{
    title:'Өтінім қалдыру',intro:'Байланыс дерегіңізді растаған соң өтінім жіберіледі.',
    channel:'Растау арнасы',phone:'SMS',email:'Email',contact:'Телефон немесе email',
    note:'Қысқаша хабарлама (міндетті емес)',
    consent:'Орындаушы менімен осы байланыс арнасы арқылы хабарласуына келісемін.',
    requestCode:'Кодты жіберу',code:'Алты таңбалы код',confirm:'Кодты растау',
    send:'Өтінімді жіберу',back:'Артқа',success:'Өтінім жіберілді',
    successNote:'Орындаушы жауап бергенше өтінім күту күйінде болады.',
    retry:'Қайталап көру',error:'Сұрау орындалмады. Кейінірек қайталаңыз.',
    invalid:'Байланыс дерегін және келісімді тексеріңіз.',
    verified:'Байланыс расталды. Енді өтінімді жіберуге болады.',
  },
  ru:{
    title:'Оставить заявку',intro:'Заявка будет отправлена после подтверждения контакта.',
    channel:'Способ подтверждения',phone:'SMS',email:'Email',contact:'Телефон или email',
    note:'Сообщение (необязательно)',
    consent:'Согласен, чтобы исполнитель связался со мной по указанному контакту.',
    requestCode:'Отправить код',code:'Шестизначный код',confirm:'Подтвердить код',
    send:'Отправить заявку',back:'Назад',success:'Заявка отправлена',
    successNote:'Заявка ожидает ответа исполнителя.',
    retry:'Повторить',error:'Не удалось выполнить запрос. Попробуйте позже.',
    invalid:'Проверьте контакт и согласие.',
    verified:'Контакт подтвержден. Теперь можно отправить заявку.',
  },
} as const;

async function postJson(url:string,body:unknown,signal:AbortSignal):Promise<Response>{
  return fetch(url,{method:'POST',credentials:'same-origin',cache:'no-store',
    redirect:'error',headers:{'Content-Type':'application/json'},
    body:JSON.stringify(body),signal});
}

export function GuestRequestWizard({offerId,locale}:Props){
  const t=labels[locale];
  const [step,setStep]=useState<Step>('draft');
  const [channel,setChannel]=useState<InquiryChannel>('sms');
  const [contact,setContact]=useState('');
  const [note,setNote]=useState('');
  const [consent,setConsent]=useState(false);
  const [code,setCode]=useState('');
  const [challengeId,setChallengeId]=useState('');
  const [csrf,setCsrf]=useState('');
  const [receipt,setReceipt]=useState('');
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const inFlight=useRef(false);
  const controller=useRef<AbortController|null>(null);
  const idempotency=useRef('');
  // Intentionally no localStorage/sessionStorage: contact and proofs live only in memory.
  useEffect(()=>()=>controller.current?.abort(),[]);

  function begin():AbortController|null{
    if(inFlight.current)return null;
    inFlight.current=true;setBusy(true);setError('');
    const next=new AbortController();controller.current=next;return next;
  }
  function end(){
    controller.current=null;inFlight.current=false;setBusy(false);
  }
  async function start(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    const valid=validateInquiryDraft({serviceOfferId:offerId,channel,
      contact,note,consentToContact:consent});
    if(!valid.draft){setError(t.invalid);return;}
    const ctl=begin();if(!ctl)return;
    try{
      // The first GET creates an encrypted HttpOnly CSRF session.
      const init=await fetch('/api/guest-requests/challenges/start',{
        method:'GET',credentials:'same-origin',cache:'no-store',
        redirect:'error',signal:ctl.signal,
      });
      const boot:unknown=await init.json();
      if(init.status!==200||!boot||typeof boot!=='object'||
         !('csrf_token' in boot)||typeof boot.csrf_token!=='string'||
         !TOKEN.test(boot.csrf_token))throw new Error('bootstrap_unavailable');
      const issued=await postJson('/api/guest-requests/challenges/start',{
        channel:valid.draft.channel,contact:valid.draft.contact,locale,
        csrf_token:boot.csrf_token,
      },ctl.signal);
      const raw:unknown=await issued.json();
      if(issued.status!==202||!raw||typeof raw!=='object'||
         !('challenge_id' in raw)||typeof raw.challenge_id!=='string'||
         !UUID.test(raw.challenge_id)||!('csrf_token' in raw)||
         typeof raw.csrf_token!=='string'||!TOKEN.test(raw.csrf_token))
        throw new Error('issue_unavailable');
      setChallengeId(raw.challenge_id.toLowerCase());
      setCsrf(raw.csrf_token);setStep('verify');
    }catch{if(!ctl.signal.aborted)setError(t.error);}
    finally{end();}
  }
  async function verify(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(!/^[0-9]{6}$/.test(code)){setError(t.invalid);return;}
    const ctl=begin();if(!ctl)return;
    try{
      const response=await postJson(
        '/api/guest-requests/challenges/verify',
        {challenge_id:challengeId,csrf_token:csrf,code},ctl.signal);
      const raw:unknown=await response.json();
      if(response.status!==200||!raw||typeof raw!=='object'||
         !('verified' in raw)||raw.verified!==true||
         !('csrf_token' in raw)||typeof raw.csrf_token!=='string'||
         !TOKEN.test(raw.csrf_token))throw new Error('verification_failed');
      setCsrf(raw.csrf_token);setCode('');setStep('create');
    }catch{if(!ctl.signal.aborted)setError(t.error);}
    finally{end();}
  }
  async function create(event:FormEvent<HTMLFormElement>){
    event.preventDefault();const ctl=begin();if(!ctl)return;
    try{
      if(!idempotency.current)idempotency.current='guest_'+crypto.randomUUID().replaceAll('-','');
      const response=await postJson('/api/guest-requests',{
        service_offer_id:offerId,consent_to_contact:true,note,
        csrf_token:csrf,idempotency_key:idempotency.current,
      },ctl.signal);
      const raw:unknown=await response.json();
      const result=parseCommittedCreateReceipt(raw);
      if(response.status!==201||!result)throw new Error('create_failed');
      setReceipt(result.id);setStep('done');setContact('');setNote('');
      setConsent(false);setCsrf('');setChallengeId('');
    }catch{if(!ctl.signal.aborted)setError(t.error);}
    finally{end();}
  }

  return <section className="guestWizard" aria-labelledby="guest-request-heading">
    <h2 id="guest-request-heading">{t.title}</h2>
    <p>{t.intro}</p>
    {step==='draft'&&<form onSubmit={start}>
      <fieldset disabled={busy}>
        <legend>{t.channel}</legend>
        <label><input type="radio" name="guest-channel" checked={channel==='sms'}
          onChange={()=>setChannel('sms')}/> {t.phone}</label>
        <label><input type="radio" name="guest-channel" checked={channel==='email'}
          onChange={()=>setChannel('email')}/> {t.email}</label>
      </fieldset>
      <label htmlFor="guest-contact">{t.contact}</label>
      <input id="guest-contact" required autoComplete={channel==='sms'?'tel':'email'}
        type={channel==='sms'?'tel':'email'} value={contact} disabled={busy}
        maxLength={320} onChange={e=>setContact(e.target.value)}
        placeholder={channel==='sms'?'+77001234567':'name@example.com'}/>
      <label htmlFor="guest-note">{t.note}</label>
      <textarea id="guest-note" maxLength={1000} value={note} disabled={busy}
        onChange={e=>setNote(e.target.value)} rows={3}/>
      <label className="guestConsent"><input type="checkbox" checked={consent}
        disabled={busy} onChange={e=>setConsent(e.target.checked)} required/>
        {t.consent}</label>
      <button disabled={busy} type="submit">{t.requestCode}</button>
    </form>}
    {step==='verify'&&<form onSubmit={verify}>
      <label htmlFor="guest-code">{t.code}</label>
      <input id="guest-code" autoComplete="one-time-code" inputMode="numeric"
        pattern="[0-9]{6}" maxLength={6} required value={code} disabled={busy}
        onChange={e=>setCode(e.target.value)}/>
      <button disabled={busy} type="submit">{t.confirm}</button>
    </form>}
    {step==='create'&&<form onSubmit={create}>
      <p role="status">{t.verified}</p>
      <button disabled={busy} type="submit">{t.send}</button>
    </form>}
    {step==='done'&&<div role="status">
      <strong>{t.success}</strong><p>{t.successNote}</p>
      <p className="guestReceipt">{receipt}</p>
    </div>}
    {error&&<p role="alert" className="guestError">{error}</p>}
  </section>;
}

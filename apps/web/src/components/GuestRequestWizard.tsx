'use client';

import {useRef,useState} from 'react';
import type {Locale} from '@/lib/i18n';
import type {GuestInquiryDraft} from '@/lib/guest-inquiry';
import {GuestInquiryDraft as DraftStep} from './GuestInquiryDraft';
import {GuestOtpStep,type OtpVerificationResult} from './GuestOtpStep';
import {GuestRequestReceipt} from './GuestRequestReceipt';
import {parseCommittedCreateReceipt} from '@/lib/guest-create-ui';
import styles from './GuestRequestWizard.module.css';

type Challenge=Readonly<{challengeId:string;expiresInSeconds:number}>;
type Created=Readonly<{id:string;state:'pending'}>;
type Step='draft'|'otp'|'ready'|'submitting'|'receipt';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const copy={
  kk:{
    startError:'Растау кодын сұрау мүмкін болмады. Қайталап көріңіз.',
    ready:'Байланыс расталды. Өтінімді жіберу үшін төмендегі батырманы басыңыз.',
    submit:'Өтінімді жіберу',submitting:'Жіберілуде…',
    submitError:'Өтінімнің жіберілгені расталмады. Сол өтінімді қайта жіберуге болады.',
    back:'Басқа байланыс дерегін енгізу',
    retryNotice:'Қайта жібергенде сол өтінімнің кілті қолданылады. Қосарланған өтінім жасалмауы тиіс.',
  },
  ru:{
    startError:'Не удалось запросить код подтверждения. Повторите попытку.',
    ready:'Контакт подтверждён. Отправьте заявку кнопкой ниже.',
    submit:'Отправить заявку',submitting:'Отправляем…',
    submitError:'Отправка заявки не подтверждена. Можно повторить ту же операцию.',
    back:'Указать другой контакт',
    retryNotice:'Повторная отправка использует тот же ключ операции, чтобы не создавать дубль.',
  },
} as const;

/**
 * A UI-only staged workflow, NOT a live booking endpoint.
 * Parent supplies approved same-origin BFF callbacks and sets secure cookies.
 * Never mount in a public offer page until OTP delivery, network budgets,
 * verified BFF and backend create HTTP endpoint have passed security review.
 *
 * Confirmation appears ONLY after a validated backend-committed receipt.
 */
export function GuestRequestWizard({
  locale,serviceOfferId,onStartChallenge,onVerifyChallenge,onCreateRequest,statusEnabled=false,
}:{
  locale:Locale;
  serviceOfferId:string;
  statusEnabled?:boolean;
  onStartChallenge:(draft:GuestInquiryDraft)=>Promise<Challenge>;
  onVerifyChallenge:(challengeId:string,code:string)=>Promise<OtpVerificationResult>;
  onCreateRequest:(draft:GuestInquiryDraft,idempotencyKey:string)=>Promise<Created>;
}){
  const t=copy[locale];
  const [step,setStep]=useState<Step>('draft');
  const [draft,setDraft]=useState<GuestInquiryDraft|null>(null);
  const [challengeId,setChallengeId]=useState<string|null>(null);
  const [receipt,setReceipt]=useState<Created|null>(null);
  const [error,setError]=useState<'start'|'submit'|null>(null);
  const [starting,setStarting]=useState(false);
  const busy=useRef(false);
  const key=useRef<string|null>(null);

  async function begin(next:GuestInquiryDraft){
    if(busy.current||step!=='draft')return;
    busy.current=true;setStarting(true);setError(null);
    try{
      const result=await onStartChallenge(next);
      if(!result||!UUID.test(result.challengeId)||
        !Number.isSafeInteger(result.expiresInSeconds)||
        result.expiresInSeconds<1||result.expiresInSeconds>900)
        throw new Error('invalid_challenge_response');
      setDraft(next);setChallengeId(result.challengeId);
      key.current=null;
      setStep('otp');
    }catch{setError('start');}
    finally{busy.current=false;setStarting(false);}
  }

  async function verify(code:string):Promise<OtpVerificationResult>{
    if(step!=='otp'||!challengeId||busy.current)return 'unavailable';
    busy.current=true;
    try{return await onVerifyChallenge(challengeId,code);}
    catch{return 'unavailable';}
    finally{busy.current=false;}
  }

  function verified(){
    if(step!=='otp')return;
    // Verification alone is NOT a receipt. No automatic POST on OTP success.
    setStep('ready');
  }

  async function submit(){
    if(!draft||step!=='ready'||busy.current)return;
    busy.current=true;setStep('submitting');setError(null);
    try{
      // Stable for retries after timeout or an uncertain backend COMMIT.
      key.current??='guest_'+crypto.randomUUID().replace(/-/g,'');
      const result=await onCreateRequest(draft,key.current);
      const parsed=parseCommittedCreateReceipt(result);
      if(!parsed)throw new Error('invalid_committed_receipt');
      setReceipt(parsed);setDraft(null);setChallengeId(null);
      setStep('receipt');key.current=null;
    }catch{
      // Retain the verified server session and the SAME idempotency key.
      setError('submit');setStep('ready');
    }finally{busy.current=false;}
  }

  function reset(){
    if(step!=='otp'||busy.current)return;
    setDraft(null);setChallengeId(null);setError(null);
    key.current=null;setStep('draft');
  }

  if(step==='receipt'&&receipt){
    return <GuestRequestReceipt locale={locale} receipt={receipt}
      serviceOfferId={serviceOfferId} statusEnabled={statusEnabled}/>;
  }
  return <div className={styles.wizard}>
    {step==='draft'&&<>
      <DraftStep locale={locale} serviceOfferId={serviceOfferId} onContinue={begin}/>
      {starting&&<p role="status" className={styles.info}>{locale==='kk'?'Код сұралды…':'Запрашиваем код…'}</p>}
      {error==='start'&&<p role="alert" className={styles.error}>{t.startError}</p>}
    </>}
    {step==='otp'&&<>
      <GuestOtpStep locale={locale} onVerify={verify} onVerified={verified}/>
      <button type="button" className={styles.secondary} onClick={reset}>{t.back}</button>
    </>}
    {(step==='ready'||step==='submitting')&&<section className={styles.confirm}>
      <p>{t.ready}</p>
      <button type="button" onClick={submit} disabled={step==='submitting'}>
        {step==='submitting'?t.submitting:t.submit}
      </button>
      {error==='submit'&&<>
        <p role="alert" className={styles.error}>{t.submitError}</p>
        <small>{t.retryNotice}</small>
      </>}
    </section>}
  </div>;
}

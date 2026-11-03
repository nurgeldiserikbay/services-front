'use client';

import {useRef,useState,type FormEvent} from 'react';
import type {Locale} from '@/lib/i18n';
import styles from './GuestOtpStep.module.css';

export type OtpVerificationResult='verified'|'invalid'|'expired'|'unavailable';

const copy={
  kk:{
    heading:'Байланысты растау',intro:'Байланыс арнаңызға келген 6 таңбалы кодты енгізіңіз.',
    code:'Бір реттік код',submit:'Кодты тексеру',working:'Тексерілуде…',
    invalid:'Код дұрыс емес.',expired:'Кодтың мерзімі аяқталды. Жаңадан код сұрау қажет.',
    unavailable:'Тексеру мүмкін болмады. Кейінірек қайталаңыз.',
    note:'Код ешқашан URL немесе жергілікті сақтау қоймасына жазылмайды.',
  },
  ru:{
    heading:'Подтвердите контакт',intro:'Введите 6-значный код из сообщения.',
    code:'Одноразовый код',submit:'Проверить код',working:'Проверяем…',
    invalid:'Неверный код.',expired:'Срок действия кода истёк. Запросите новый.',
    unavailable:'Не удалось проверить код. Повторите позже.',
    note:'Код не сохраняется в URL или локальном хранилище.',
  },
} as const;

/**
 * Second presentation step: caller supplies a securely implemented verification
 * action. This component never sends OTP, builds an HTTP request, stores a token,
 * or claims that a booking has been created.
 *
 * Not mounted publicly until a verified BFF flow is available.
 */
export function GuestOtpStep({
  locale,onVerify,onVerified,
}:{
  locale:Locale;
  onVerify:(code:string)=>Promise<OtpVerificationResult>;
  onVerified:()=>void;
}) {
  const t=copy[locale];
  const [code,setCode]=useState('');
  const [error,setError]=useState<'invalid'|'expired'|'unavailable'|null>(null);
  const [pending,setPending]=useState(false);
  const busy=useRef(false);

  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if(busy.current)return;
    if(!/^[0-9]{6}$/.test(code)){setError('invalid');return;}
    busy.current=true;
    setPending(true);
    setError(null);
    try {
      const result=await onVerify(code);
      setCode('');
      if(result==='verified')onVerified();
      else setError(result);
    } catch {
      setCode('');
      setError('unavailable');
    } finally {
      busy.current=false;
      setPending(false);
    }
  }

  return <section className={styles.panel}>
    <h2>{t.heading}</h2>
    <p>{t.intro}</p>
    <form onSubmit={submit} noValidate>
      <label htmlFor="guest-otp-code">{t.code}</label>
      <input id="guest-otp-code" type="text" inputMode="numeric"
        autoComplete="one-time-code" pattern="[0-9]{6}" minLength={6}
        maxLength={6} value={code} disabled={pending}
        aria-invalid={Boolean(error)} aria-describedby={error?'otp-feedback':undefined}
        onChange={e=>{setCode(e.target.value.replace(/[^0-9]/g,'').slice(0,6));setError(null);}}/>
      {error&&<p role="alert" id="otp-feedback" className={styles.error}>{t[error]}</p>}
      <button type="submit" disabled={pending||code.length!==6}>
        {pending?t.working:t.submit}
      </button>
    </form>
    <small>{t.note}</small>
  </section>;
}

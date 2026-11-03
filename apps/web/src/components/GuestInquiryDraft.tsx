'use client';

import { useState, type FormEvent } from 'react';
import type { Locale } from '@/lib/i18n';
import {
  validateInquiryDraft, type DraftErrors, type GuestInquiryDraft, type InquiryChannel,
} from '@/lib/guest-inquiry';
import styles from './GuestInquiryDraft.module.css';

const copy={
  kk:{
    heading:'Қызметке өтінім',hint:'Байланыс нөміріңізді немесе email көрсетіңіз. Кейін бір реттік кодпен растау қажет.',
    channel:'Қалай байланысамыз?',sms:'Телефон',email:'Email',contact:'Байланыс дерегі',
    phoneHint:'+77001234567',emailHint:'you@example.com',
    note:'Қысқаша сипаттама (міндетті емес)',notePlaceholder:'Қандай қызмет қажет?',
    consent:'Орындаушы осы өтінім бойынша менімен байланыса алады.',
    continue:'Жалғастыру',invalid_contact:'Дұрыс нөмірді немесе email енгізіңіз.',
    invalid_note:'Мәтін 1000 таңбадан аспауы керек.',consent_required:'Байланысуға келісім қажет.',
    invalid_offer:'Қызмет анықталмады.',notSent:'Бұл — өтінім жобасы. Әзірге серверге жіберілген жоқ.',
  },
  ru:{
    heading:'Заявка на услугу',hint:'Укажите телефон или email. Перед отправкой потребуется подтверждение одноразовым кодом.',
    channel:'Способ связи',sms:'Телефон',email:'Email',contact:'Контакт',
    phoneHint:'+77001234567',emailHint:'you@example.com',
    note:'Описание (необязательно)',notePlaceholder:'Какая услуга нужна?',
    consent:'Исполнитель может связаться со мной по этой заявке.',
    continue:'Продолжить',invalid_contact:'Укажите корректный телефон или email.',
    invalid_note:'Не более 1000 символов.',consent_required:'Необходимо согласие на связь.',
    invalid_offer:'Услуга не найдена.',notSent:'Это черновик заявки. Он ещё не отправлен на сервер.',
  },
} as const;

/**
 * UI-only first step. Parent owns secure BFF/OTP verification and must not
 * render this publicly until those endpoints have passed security review.
 * onContinue receives an in-memory draft, not a booking confirmation.
 */
export function GuestInquiryDraft({
  locale,serviceOfferId,onContinue,
}:{
  locale:Locale;
  serviceOfferId:string;
  onContinue:(draft:GuestInquiryDraft)=>void;
}) {
  const t=copy[locale];
  const [channel,setChannel]=useState<InquiryChannel>('sms');
  const [contact,setContact]=useState('');
  const [note,setNote]=useState('');
  const [consent,setConsent]=useState(false);
  const [errors,setErrors]=useState<DraftErrors>({});
  const handleSubmit=(event:FormEvent<HTMLFormElement>)=>{
    event.preventDefault();
    const result=validateInquiryDraft({
      serviceOfferId,channel,contact,note,consentToContact:consent,
    });
    setErrors(result.errors);
    if(result.draft) onContinue(result.draft);
  };
  return <section className={styles.panel}>
    <h2>{t.heading}</h2>
    <p>{t.hint}</p>
    <form onSubmit={handleSubmit} noValidate>
      <fieldset className={styles.channels}>
        <legend>{t.channel}</legend>
        <label><input type="radio" checked={channel==='sms'} onChange={()=>{
          setChannel('sms');setContact('');setErrors({});
        }}/>{t.sms}</label>
        <label><input type="radio" checked={channel==='email'} onChange={()=>{
          setChannel('email');setContact('');setErrors({});
        }}/>{t.email}</label>
      </fieldset>
      <label className={styles.label} htmlFor="guest-contact">{t.contact}</label>
      <input id="guest-contact" type={channel==='sms'?'tel':'email'}
        autoComplete={channel==='sms'?'tel':'email'} value={contact}
        onChange={e=>setContact(e.target.value)} required
        aria-invalid={Boolean(errors.contact)}
        aria-describedby={errors.contact?'contact-error':undefined}
        placeholder={channel==='sms'?t.phoneHint:t.emailHint}/>
      {errors.contact && <p id="contact-error" role="alert" className={styles.error}>{t[errors.contact]}</p>}
      <label className={styles.label} htmlFor="guest-note">{t.note}</label>
      <textarea id="guest-note" rows={4} value={note} maxLength={1001}
        onChange={e=>setNote(e.target.value)} placeholder={t.notePlaceholder}
        aria-invalid={Boolean(errors.note)}
        aria-describedby={errors.note?'note-error':undefined}/>
      {errors.note && <p id="note-error" role="alert" className={styles.error}>{t.invalid_note}</p>}
      <label className={styles.consent}>
        <input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}
          aria-invalid={Boolean(errors.consentToContact)}/>
        <span>{t.consent}</span>
      </label>
      {errors.consentToContact && <p role="alert" className={styles.error}>{t.consent_required}</p>}
      {errors.serviceOfferId && <p role="alert" className={styles.error}>{t.invalid_offer}</p>}
      <button type="submit">{t.continue}</button>
    </form>
    <p className={styles.disclaimer}>{t.notSent}</p>
  </section>;
}

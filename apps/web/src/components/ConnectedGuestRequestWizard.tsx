'use client';

import {useRef} from 'react';
import type {Locale} from '@/lib/i18n';
import type {GuestInquiryDraft} from '@/lib/guest-inquiry';
import {GuestRequestWizard} from './GuestRequestWizard';
import type {OtpVerificationResult} from './GuestOtpStep';
import {parseCommittedCreateReceipt} from '@/lib/guest-create-ui';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CSRF=/^[A-Za-z0-9_-]{43}$/;

async function safeJson(response:Response):Promise<Record<string,unknown>>{
  if(!/^application\/json(?:\s*;|\s*$)/i.test(response.headers.get('content-type')??''))
    throw new Error('guest_flow_unavailable');
  const length=response.headers.get('content-length');
  if(length!==null&&(!/^\d+$/.test(length)||Number(length)>4096))
    throw new Error('guest_flow_unavailable');
  const text=await response.text();
  if(new TextEncoder().encode(text).byteLength>4096)throw new Error('guest_flow_unavailable');
  const data:unknown=JSON.parse(text);
  if(!data||typeof data!=='object'||Array.isArray(data))
    throw new Error('guest_flow_unavailable');
  return data as Record<string,unknown>;
}

async function post(url:string,body:object):Promise<Response>{
  return fetch(url,{method:'POST',cache:'no-store',credentials:'same-origin',
    redirect:'error',headers:{'Content-Type':'application/json'},
    body:JSON.stringify(body),signal:AbortSignal.timeout(8000)});
}

/**
 * Only mounted by an explicitly gated server-rendered offer page.
 * This is a composition adapter, not a new wizard or a bearer-token store.
 * Raw contact and OTP stay in React memory; capabilities live solely in
 * Secure HttpOnly BFF cookies. No browser-controlled network assertion.
 */
export function ConnectedGuestRequestWizard({locale,serviceOfferId,statusEnabled=false}:{
  locale:Locale;serviceOfferId:string;statusEnabled?:boolean;
}){
  const challengeCsrf=useRef<string|null>(null);
  const createCsrf=useRef<string|null>(null);

  async function start(draft:GuestInquiryDraft){
    // The GET only prepares same-origin CSRF state; it must not send OTP.
    const init=await fetch('/api/guest-requests/challenges/start',{
      method:'GET',cache:'no-store',credentials:'same-origin',
      redirect:'error',signal:AbortSignal.timeout(8000),
    });
    if(init.status!==200)throw new Error('guest_flow_unavailable');
    const bootstrap=await safeJson(init);
    if(typeof bootstrap.csrf_token!=='string'||!CSRF.test(bootstrap.csrf_token))
      throw new Error('guest_flow_unavailable');

    const issued=await post('/api/guest-requests/challenges/start',{
      channel:draft.channel,contact:draft.contact,locale,
      csrf_token:bootstrap.csrf_token,
    });
    if(issued.status!==202)throw new Error('guest_flow_unavailable');
    const response=await safeJson(issued);
    if(typeof response.challenge_id!=='string'||!UUID.test(response.challenge_id)||
       typeof response.csrf_token!=='string'||!CSRF.test(response.csrf_token)||
       typeof response.expires_in!=='number'||
       !Number.isSafeInteger(response.expires_in)||response.expires_in<1||
       response.expires_in>600)
      throw new Error('guest_flow_unavailable');
    challengeCsrf.current=response.csrf_token;
    createCsrf.current=null;
    return {challengeId:response.challenge_id.toLowerCase(),
      expiresInSeconds:response.expires_in};
  }

  async function verify(challengeId:string,code:string):Promise<OtpVerificationResult>{
    if(!challengeCsrf.current||!UUID.test(challengeId)||!/^[0-9]{6}$/.test(code))
      return 'unavailable';
    try{
      const verified=await post('/api/guest-requests/challenges/verify',{
        challenge_id:challengeId,code,csrf_token:challengeCsrf.current,
      });
      if(verified.status!==200)return 'unavailable';
      const response=await safeJson(verified);
      if(response.verified!==true||typeof response.csrf_token!=='string'||
         !CSRF.test(response.csrf_token))return 'unavailable';
      createCsrf.current=response.csrf_token;
      challengeCsrf.current=null;
      return 'verified';
    }catch{return 'unavailable';}
  }

  async function create(draft:GuestInquiryDraft,idempotencyKey:string){
    if(!createCsrf.current||draft.serviceOfferId!==serviceOfferId)
      throw new Error('guest_flow_unavailable');
    // A retry must retain this exact key, as guaranteed by the existing UI.
    if (!UUID.test(idempotencyKey)) throw new Error('guest_flow_unavailable');
    const response=await post('/api/guest-requests',{
      service_offer_id:draft.serviceOfferId,
      note:draft.note,consent_to_contact:true,
      csrf_token:createCsrf.current,idempotency_key:idempotencyKey,
    });
    if(response.status!==201)throw new Error('guest_flow_unavailable');
    const parsed=parseCommittedCreateReceipt(await safeJson(response));
    if(!parsed)throw new Error('guest_flow_unavailable');
    createCsrf.current=null;
    return parsed;
  }

  return <GuestRequestWizard locale={locale} serviceOfferId={serviceOfferId}
    onStartChallenge={start} onVerifyChallenge={verify}
    onCreateRequest={create} statusEnabled={statusEnabled}/>;
}

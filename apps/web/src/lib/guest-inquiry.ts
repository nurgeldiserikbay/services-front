/**
 * Presentation-only guest inquiry draft. A draft is NOT a ServiceRequest.
 * Never persist contact or one-time proofs to localStorage, URL or analytics.
 */
export type InquiryChannel = 'sms' | 'email';

export type GuestInquiryDraft = Readonly<{
  serviceOfferId: string;
  channel: InquiryChannel;
  contact: string;
  note: string;
  consentToContact: true;
}>;

export type DraftInput = {
  serviceOfferId: string;
  channel: InquiryChannel;
  contact: string;
  note: string;
  consentToContact: boolean;
};
export type DraftErrors = Partial<Record<'serviceOfferId'|'contact'|'note'|'consentToContact',string>>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function normalizeInquiryContact(channel: InquiryChannel, raw: string): string | null {
  const value=raw.trim();
  if(channel==='sms') return /^\+[1-9][0-9]{7,14}$/.test(value) ? value : null;
  if(channel!=='email' || value.length<3 || value.length>320 ||
     /[\s\x00-\x1f\x7f]/.test(value)) return null;
  const at=value.lastIndexOf('@');
  if(at<1 || at!==value.indexOf('@') || at===value.length-1) return null;
  const local=value.slice(0,at), domain=value.slice(at+1).toLowerCase();
  if(local.length>64 || domain.length>253 ||
     !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])$/.test(domain) ||
     !domain.includes('.') || domain.includes('..') ||
     domain.split('.').some(part=>part.length===0 || part.length>63 ||
       part.startsWith('-') || part.endsWith('-'))) return null;
  return local+'@'+domain;
}

export function validateInquiryDraft(input: DraftInput): {draft:GuestInquiryDraft|null;errors:DraftErrors} {
  const errors:DraftErrors={};
  if(!UUID.test(input.serviceOfferId)) errors.serviceOfferId='invalid_offer';
  const contact=normalizeInquiryContact(input.channel,input.contact);
  if(contact===null) errors.contact='invalid_contact';
  if(input.note.length>1000 || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(input.note))
    errors.note='invalid_note';
  if(input.consentToContact!==true) errors.consentToContact='consent_required';
  if(Object.keys(errors).length || contact===null) return {draft:null,errors};
  return {
    draft:{
      serviceOfferId:input.serviceOfferId.toLowerCase(),
      channel:input.channel,
      contact,
      note:input.note.trim(),
      consentToContact:true,
    },
    errors:{},
  };
}

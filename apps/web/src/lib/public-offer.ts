import 'server-only';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const contactMethods = ['phone', 'whatsapp', 'guest_request', 'book_slot'] as const;
export type ContactMethod = typeof contactMethods[number];

export interface PublicServiceOffer {
  id: string;
  definition_id: string;
  title: string;
  seller_kind: 'professional' | 'organization';
  seller_id: string;
  status: 'published';
  contact_methods: ContactMethod[];
  city_id: string | null;
  price_label: string | null;
  availability_visibility: 'hidden' | 'busy_only' | 'free_slots';
}
export class OfferNotFound extends Error {}

export function isPublicOffer(value: unknown): value is PublicServiceOffer {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const o=value as Record<string,unknown>;
  return typeof o.id==='string' && UUID.test(o.id)
    && typeof o.definition_id==='string' && UUID.test(o.definition_id)
    && typeof o.seller_id==='string' && UUID.test(o.seller_id)
    && typeof o.title==='string'
    && (o.seller_kind==='professional'||o.seller_kind==='organization')
    && o.status==='published'
    && (o.city_id===null || typeof o.city_id==='string' && UUID.test(o.city_id))
    && (o.price_label===null || typeof o.price_label==='string')
    && (o.availability_visibility==='hidden'||o.availability_visibility==='busy_only'||o.availability_visibility==='free_slots')
    && Array.isArray(o.contact_methods)
    && o.contact_methods.every((v:unknown)=>typeof v==='string' && (contactMethods as readonly string[]).includes(v));
}

export async function getPublishedServiceOffer(id: string):Promise<PublicServiceOffer> {
  if (!UUID.test(id)) throw new OfferNotFound();
  const raw = process.env.SERVICES_API_BASE_URL;
  if (!raw) throw new Error('Missing backend API base URL');
  const url = new URL(raw.replace(/\/$/,'') + '/service-offers/' + encodeURIComponent(id));
  if (!['https:','http:'].includes(url.protocol) ||
      process.env.NODE_ENV==='production' && url.protocol!=='https:') {
    throw new Error('Backend API requires a secure origin');
  }
  // Public read: intentionally no browser cookies, auth tokens or guest capabilities.
  const response = await fetch(url,{cache:'no-store',headers:{Accept:'application/json'}});
  if (response.status===404) throw new OfferNotFound();
  if (!response.ok) throw new Error('Public offer temporarily unavailable');
  const data:unknown=await response.json();
  if(!isPublicOffer(data)) throw new Error('Unexpected public offer response');
  return data;
}

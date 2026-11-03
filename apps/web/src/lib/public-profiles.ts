import 'server-only';

export interface PublicProfessional {
  id: string;
  profession_id: string;
  lifecycle_status: 'published';
  slug: string;
  title: string | null;
}
export interface PublicOrganization {
  id: string;
  slug: string;
  name: string;
  status: 'active';
}
export class ProfileNotFound extends Error {}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const slugPattern = /^[a-z0-9](?:[a-z0-9-]{0,158}[a-z0-9])?$/;

async function fetchPublicProfile(path: string): Promise<unknown> {
  const raw = process.env.SERVICES_API_BASE_URL;
  if (!raw) throw new Error('Public API is not configured');
  const base = new URL(raw.replace(/\/$/, '')+'/');
  if (!['http:','https:'].includes(base.protocol) ||
      (process.env.NODE_ENV === 'production' && base.protocol !== 'https:')) {
    throw new Error('API must use a secure HTTP origin');
  }
  const url = new URL(path,base);
  const result = await fetch(url, {cache:'no-store',headers:{Accept:'application/json'}});
  if (result.status === 404) throw new ProfileNotFound();
  if (!result.ok) throw new Error('Public profile unavailable');
  return result.json();
}
export async function getPublicProfessional(slug: string): Promise<PublicProfessional> {
  if (!slugPattern.test(slug)) throw new ProfileNotFound();
  const value = await fetchPublicProfile('professionals/'+encodeURIComponent(slug));
  if (!value || typeof value !== 'object') throw new Error('Unexpected profile shape');
  const p = value as Record<string,unknown>;
  if (p.lifecycle_status !== 'published' || p.slug !== slug ||
    typeof p.id !== 'string' || !uuid.test(p.id) ||
    typeof p.profession_id !== 'string' || !uuid.test(p.profession_id) ||
    (p.title !== null && typeof p.title !== 'string')) throw new Error('Invalid public professional');
  return p as unknown as PublicProfessional;
}
export async function getPublicOrganization(id: string): Promise<PublicOrganization> {
  if (!uuid.test(id)) throw new ProfileNotFound();
  const value = await fetchPublicProfile('organizations/'+encodeURIComponent(id));
  if (!value || typeof value !== 'object') throw new Error('Unexpected organization shape');
  const o = value as Record<string,unknown>;
  if (o.status !== 'active' || o.id !== id.toLowerCase() ||
    typeof o.name !== 'string' || typeof o.slug !== 'string') throw new Error('Invalid public organization');
  return o as unknown as PublicOrganization;
}

export type SearchKind = 'professional' | 'organization' | 'offer';
export interface SearchItem {
  kind: SearchKind;
  id: string;
  title: string;
  is_sponsored: boolean;
  slug?: string | null;
}
export interface SearchResponse { items: SearchItem[]; next_cursor: string | null }
export interface ProfessionOption { id: string; code: string; name: string }
export type SearchScope = 'city' | 'country' | 'global';

/** Server-side only: never forward guest cookies or capabilities to public search. */
export async function searchPublicMarketplace(
  query: string,
  scope: SearchScope,
  location: {countryId?: string; cityId?: string} = {},
  signal?: AbortSignal,
  cursor?: string,
  professionId?: string,
): Promise<SearchResponse> {
  const rawBase = process.env.SERVICES_API_BASE_URL;
  if (!rawBase) throw new Error('SERVICES_API_BASE_URL not configured');
  const url = new URL(rawBase.replace(/\/$/, '') + '/search');
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('API origin must be HTTP(S)');
  if (process.env.NODE_ENV === 'production' && url.protocol !== 'https:') throw new Error('Production API must use HTTPS');
  if (query) url.searchParams.set('q', query.slice(0, 180));
  url.searchParams.set('scope', scope);
  if (scope === 'country' && location.countryId) url.searchParams.set('country_id',location.countryId);
  if (scope === 'city' && location.cityId) url.searchParams.set('city_id',location.cityId);
  url.searchParams.set('kind', 'all');
  if (professionId) {
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuid.test(professionId)) throw new Error('Invalid profession ID');
    url.searchParams.set('profession_id', professionId.toLowerCase());
  }
  if (cursor) {
    if (cursor.length > 512 || !/^[A-Za-z0-9_-]+$/.test(cursor)) throw new Error('Invalid search cursor');
    url.searchParams.set('cursor', cursor);
  }
  const response = await fetch(url, {
    cache: 'no-store',
    signal,
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error('Public search unavailable');
  const data: unknown = await response.json();
  if (!data || typeof data !== 'object' || !('items' in data) ||
      !Array.isArray(data.items) || data.items.length > 50 ||
      data.items.some((item: unknown) => !validItem(item)) ||
      !('next_cursor' in data) ||
      !(data.next_cursor === null || (typeof data.next_cursor === 'string' &&
        data.next_cursor.length <= 512 && /^[A-Za-z0-9_-]+$/.test(data.next_cursor)))) {
    throw new Error('Unexpected search response');
  }
  return data as SearchResponse;
}
/** Read the canonical public taxonomy; never invent fallback professions. */
export async function getPublicProfessions(): Promise<ProfessionOption[]> {
  const response = await fetch(getPublicApiUrl('/professions'), {
    cache: 'no-store',
    headers: {Accept: 'application/json'},
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error('Public professions unavailable');
  const value: unknown = await response.json();
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!Array.isArray(value) || value.length > 500) throw new Error('Invalid public professions response');
  const seen = new Set<string>();
  const items: ProfessionOption[] = [];
  for (const row of value) {
    if (!row || typeof row !== 'object') throw new Error('Invalid public profession');
    const item = row as Record<string, unknown>;
    if (typeof item.id !== 'string' || !uuid.test(item.id) ||
        typeof item.code !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,119}$/.test(item.code) ||
        typeof item.name !== 'string' || item.name.trim().length === 0 || item.name.length > 200 ||
        seen.has(item.id.toLowerCase())) {
      throw new Error('Invalid public profession');
    }
    seen.add(item.id.toLowerCase());
    items.push({id: item.id.toLowerCase(), code: item.code, name: item.name});
  }
  return items;
}
function validItem(value: unknown): value is SearchItem {
  if (!value || typeof value !== 'object') return false;
  const x = value as Record<string, unknown>;
  return (x.kind === 'professional' || x.kind === 'organization' || x.kind === 'offer')
    && typeof x.id === 'string' && typeof x.title === 'string' && typeof x.is_sponsored === 'boolean'
    && (x.slug === undefined || x.slug === null || typeof x.slug === 'string');
}

export interface PublicOffer {
  id: string;
  title: string;
  delivery_mode: 'at_location' | 'at_customer' | 'online' | 'hybrid';
  price_label: string | null;
}
export interface PublicProfessional {
  id: string;
  profession_id: string;
  lifecycle_status: 'published';
  slug: string;
  title: string | null;
  offers: PublicOffer[];
}
export interface PublicOrganization {
  id: string;
  slug: string;
  name: string;
  status: 'active';
  offers: PublicOffer[];
}
export class PublicResourceNotFound extends Error {}

function getPublicApiUrl(path: string): URL {
  const raw = process.env.SERVICES_API_BASE_URL;
  if (!raw) throw new Error('Public API not configured');
  const url = new URL(raw.replace(/\/$/, '') + path);
  if (!['http:', 'https:'].includes(url.protocol) ||
    (process.env.NODE_ENV === 'production' && url.protocol !== 'https:')) {
    throw new Error('Public API origin must be HTTPS in production');
  }
  return url;
}
async function readPublicResource(path: string): Promise<unknown> {
  // No incoming cookies, authorization headers, or guest capabilities.
  const response = await fetch(getPublicApiUrl(path), {
    cache: 'no-store',
    headers: {Accept: 'application/json'},
    signal: AbortSignal.timeout(5000),
  });
  if (response.status === 404) throw new PublicResourceNotFound('Not published');
  if (!response.ok) throw new Error('Public resource unavailable');
  return response.json() as Promise<unknown>;
}
const hasObject = (x: unknown): x is Record<string, unknown> =>
  typeof x === 'object' && x !== null && !Array.isArray(x);
function validOffers(x: unknown): x is PublicOffer[] {
  return Array.isArray(x) && x.length <= 50 && x.every((o: unknown) =>
    hasObject(o) && typeof o.id === 'string' && typeof o.title === 'string' &&
    ['at_location','at_customer','online','hybrid'].includes(String(o.delivery_mode)) &&
    (o.price_label === null || typeof o.price_label === 'string'));
}
export async function getPublicProfessional(slug: string): Promise<PublicProfessional> {
  if (!/^[a-z0-9][a-z0-9-]{0,159}$/.test(slug)) throw new PublicResourceNotFound('Invalid slug');
  const value = await readPublicResource('/professionals/' + encodeURIComponent(slug));
  if (!hasObject(value) || typeof value.id !== 'string' ||
    typeof value.profession_id !== 'string' || value.lifecycle_status !== 'published' ||
    value.slug !== slug || (value.title !== null && typeof value.title !== 'string') ||
    !validOffers(value.offers)) throw new Error('Invalid public professional response');
  return {
    id:value.id, profession_id:value.profession_id, lifecycle_status:'published',
    slug, title:value.title, offers:value.offers,
  };
}
export async function getPublicOrganization(id: string): Promise<PublicOrganization> {
  const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuid.test(id)) throw new PublicResourceNotFound('Invalid id');
  const value = await readPublicResource('/organizations/' + encodeURIComponent(id));
  if (!hasObject(value) || value.id !== id || typeof value.slug !== 'string' ||
    typeof value.name !== 'string' || value.status !== 'active' || !validOffers(value.offers)) {
    throw new Error('Invalid public organization response');
  }
  return {id, slug:value.slug, name:value.name, status:'active', offers:value.offers};
}

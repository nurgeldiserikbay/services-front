export type SearchKind = 'professional' | 'organization' | 'offer';
export interface SearchItem {
  kind: SearchKind;
  id: string;
  title: string;
  is_sponsored: boolean;
}
export interface SearchResponse { items: SearchItem[] }
export type SearchScope = 'city' | 'country' | 'global';

/** Server-side only: never forward guest cookies or capabilities to public search. */
export async function searchPublicMarketplace(
  query: string,
  scope: SearchScope,
  signal?: AbortSignal,
): Promise<SearchResponse> {
  const rawBase = process.env.SERVICES_API_BASE_URL;
  if (!rawBase) throw new Error('SERVICES_API_BASE_URL not configured');
  const url = new URL(rawBase.replace(/\/$/, '') + '/search');
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('API origin must be HTTP(S)');
  if (process.env.NODE_ENV === 'production' && url.protocol !== 'https:') throw new Error('Production API must use HTTPS');
  if (query) url.searchParams.set('q', query.slice(0, 180));
  url.searchParams.set('scope', scope);
  url.searchParams.set('kind', 'all');
  const response = await fetch(url, {
    cache: 'no-store',
    signal,
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error('Public search unavailable');
  const data: unknown = await response.json();
  if (!data || typeof data !== 'object' || !('items' in data) ||
      !Array.isArray(data.items) || data.items.some((item: unknown) => !validItem(item))) {
    throw new Error('Unexpected search response');
  }
  return data as SearchResponse;
}
function validItem(value: unknown): value is SearchItem {
  if (!value || typeof value !== 'object') return false;
  const x = value as Record<string, unknown>;
  return (x.kind === 'professional' || x.kind === 'organization' || x.kind === 'offer')
    && typeof x.id === 'string' && typeof x.title === 'string' && typeof x.is_sponsored === 'boolean';
}

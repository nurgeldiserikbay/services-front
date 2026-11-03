import { NextRequest, NextResponse } from 'next/server';

type RouteContext = {params: Promise<{kind: string}>};
const paths = new Set(['countries', 'areas', 'cities']);
const allowed = new Set(['q', 'country_id', 'area_id']);
const isUuid = (s:string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);

/** Public geographic directory proxy, never forwards browser cookies, tokens or IP. */
export async function GET(req: NextRequest, context: RouteContext) {
  const {kind} = await context.params;
  if (!paths.has(kind)) return NextResponse.json({error:'not_found'},{status:404});
  const raw = process.env.SERVICES_API_BASE_URL;
  if (!raw) return NextResponse.json({error:'unavailable'},{status:503});
  let upstream: URL;
  try {
    upstream = new URL(raw.replace(/\/$/,'') + '/geo/' + kind);
    if (!['http:','https:'].includes(upstream.protocol)) throw new Error('protocol');
    if (process.env.NODE_ENV === 'production' && upstream.protocol !== 'https:') throw new Error('https required');
  } catch {
    return NextResponse.json({error:'unavailable'},{status:503});
  }
  for (const [key,value] of req.nextUrl.searchParams) {
    if (!allowed.has(key)) return NextResponse.json({error:'invalid_query'},{status:400});
    if (key === 'q' && value.length > 140) return NextResponse.json({error:'invalid_query'},{status:400});
    if ((key === 'country_id' || key === 'area_id') && !isUuid(value)) return NextResponse.json({error:'invalid_query'},{status:400});
    upstream.searchParams.set(key,value);
  }
  try {
    const r = await fetch(upstream,{headers:{Accept:'application/json'},cache:'no-store',signal:AbortSignal.timeout(5000)});
    if (!r.ok) return NextResponse.json({error: r.status===400?'invalid_query':'unavailable'},{status:r.status===400?400:503});
    const value:unknown = await r.json();
    if (!value || typeof value !== 'object' || !('items' in value) || !Array.isArray(value.items)) {
      return NextResponse.json({error:'invalid_backend_response'},{status:502});
    }
    return NextResponse.json(value,{headers:{'Cache-Control':'public, max-age=60'}});
  } catch {
    return NextResponse.json({error:'unavailable'},{status:503});
  }
}

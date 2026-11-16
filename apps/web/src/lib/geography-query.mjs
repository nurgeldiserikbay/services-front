const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED=new Set(['q','country_id','area_id']);
/** Strictly forward a single canonical value per filter. Reject conflicting or
 * duplicated query keys rather than silently choosing the last one. */
export function validateGeographyQuery(searchParams){
  if(!(searchParams instanceof URLSearchParams))throw new Error('invalid_query');
  const result=new URLSearchParams();
  for(const [key,value] of searchParams){
    if(!ALLOWED.has(key)||result.has(key))throw new Error('invalid_query');
    if(key==='q'&&value.length>140)throw new Error('invalid_query');
    if((key==='country_id'||key==='area_id')&&!UUID.test(value))throw new Error('invalid_query');
    result.set(key,value);
  }
  return result;
}

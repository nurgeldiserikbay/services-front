const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isRecord=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const validName=value=>typeof value==='string'&&value.trim().length>0;
export const isCountry=value=>isRecord(value)&&typeof value.id==='string'&&UUID.test(value.id)&&validName(value.name)&&typeof value.iso2==='string'&&/^[A-Za-z]{2}$/.test(value.iso2);
export const isCity=value=>isRecord(value)&&typeof value.id==='string'&&UUID.test(value.id)&&typeof value.country_id==='string'&&UUID.test(value.country_id)&&validName(value.name)&&typeof value.timezone==='string'&&value.timezone.length>0&&(value.area_id===null||(typeof value.area_id==='string'&&UUID.test(value.area_id)));

export function parseCountries(value){
  if(!isRecord(value)||!Array.isArray(value.items)||!value.items.every(isCountry))
    throw new Error('invalid country catalog');
  return value.items;
}
export function parseCities(value,countryId){
  if(!isRecord(value)||!Array.isArray(value.items)||!value.items.every(isCity)||typeof countryId!=='string'||!UUID.test(countryId))
    throw new Error('invalid city catalog');
  // IDs are case-insensitive, including API responses with uppercase UUIDs.
  return value.items.filter(city=>city.country_id.toLowerCase()===countryId.toLowerCase());
}

/**
 * The public proxy returns only UI contract fields, never unrecognized
 * upstream object attributes (e.g. diagnostics, contact data or internal notes).
 * Areas are not transformed here because their schema is distinct.
 */
export function projectPublicGeographyCatalog(kind, catalog){
  if(kind!=='countries'&&kind!=='cities')return catalog;
  if(!isRecord(catalog)||!Array.isArray(catalog.items))throw new Error('invalid geography catalog');
  if(kind==='countries'){
    if(!catalog.items.every(isCountry))throw new Error('invalid country catalog');
    return {items:catalog.items.map(({id,iso2,name})=>({id,iso2,name}))};
  }
  if(!catalog.items.every(isCity))throw new Error('invalid city catalog');
  return {items:catalog.items.map(({id,country_id,area_id,name,timezone})=>({id,country_id,area_id,name,timezone}))};
}

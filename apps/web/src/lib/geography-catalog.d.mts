export type Country={id:string;iso2:string;name:string};
export type City={id:string;country_id:string;area_id:string|null;name:string;timezone:string};
export function isCountry(value:unknown):value is Country;
export function isCity(value:unknown):value is City;
export function parseCountries(value:unknown):Country[];
export function parseCities(value:unknown,countryId:string):City[];

export function projectPublicGeographyCatalog(kind:string,catalog:{items:unknown[]}):{items:unknown[]};

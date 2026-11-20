export class InvalidGuestCompletionBody extends Error {constructor();}
export function readGuestCompletionBody(request:{
 headers:Headers;body:ReadableStream<Uint8Array>|null;
},maxBytes?:number):Promise<Record<string,unknown>>;

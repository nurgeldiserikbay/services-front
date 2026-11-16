export const MAX_GEO_RESPONSE_BYTES:number;
export function readGeoResponse(response:Response):Promise<{items:unknown[]}>;

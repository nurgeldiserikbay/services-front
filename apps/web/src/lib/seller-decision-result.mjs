/**
 * Pure, intentionally credential-free UI mapping. Only the backend decides
 * authorization and the state transition.
 */
export function mapSellerDecisionOutcome(reply){
  if(!reply||typeof reply!=='object'||Array.isArray(reply))
    throw new Error('Unrecognized seller decision');
  switch(reply.outcome){
    case 'ok':
      if(typeof reply.id!=='string'||
         (reply.state!=='accepted'&&reply.state!=='declined')||
         !Number.isSafeInteger(reply.version)||reply.version<1||
         typeof reply.replayed!=='boolean')
        throw new Error('Invalid seller decision receipt');
      return 'ok';
    case 'conflict':return 'conflict';
    case 'forbidden':return 'forbidden';
    case 'unauthorized':return 'unauthorized';
    case 'not_found':return 'unavailable';
    default:throw new Error('Unrecognized seller decision');
  }
}

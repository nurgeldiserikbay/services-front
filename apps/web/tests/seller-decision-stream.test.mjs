import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readSellerDecisionBytes,parseSellerDecisionBytes,MAX_SELLER_DECISION_BYTES}
 from '../src/lib/seller-bff-route-core.mjs';

test('seller mutation accepts a bounded valid JSON request',async()=>{
 const payload={csrf_token:'x'.repeat(43),
   idempotency_key:'11111111-1111-4111-8111-111111111111',version:1};
 const bytes=new TextEncoder().encode(JSON.stringify(payload));
 const stream=new ReadableStream({start(controller){controller.enqueue(bytes);controller.close();}});
 const parsed=parseSellerDecisionBytes(await readSellerDecisionBytes(stream));
 assert.deepEqual(parsed,{csrfToken:payload.csrf_token,
   idempotencyKey:payload.idempotency_key,version:1});
});
test('seller mutation cancels an oversized stream',async()=>{
 let cancelled=false;
 const stream=new ReadableStream({
  pull(controller){controller.enqueue(new Uint8Array(MAX_SELLER_DECISION_BYTES+1));},
  cancel(){cancelled=true;},
 });
 await assert.rejects(readSellerDecisionBytes(stream),/too_large/);
 assert.equal(cancelled,true);
});
test('seller mutation rejects malformed UTF-8 and unexpected fields',()=>{
 assert.equal(parseSellerDecisionBytes(new Uint8Array([0xff])),null);
 const bytes=new TextEncoder().encode(JSON.stringify({
  csrf_token:'x'.repeat(43),idempotency_key:'11111111-1111-4111-8111-111111111111',
  version:1,private_contact:'secret',
 }));
 assert.equal(parseSellerDecisionBytes(bytes),null);
});

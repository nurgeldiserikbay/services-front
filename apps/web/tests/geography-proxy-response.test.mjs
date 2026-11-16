import assert from 'node:assert/strict';
import {test} from 'node:test';
import {MAX_GEO_RESPONSE_BYTES,readGeoResponse} from '../src/lib/geography-proxy-response.mjs';

const response=(body,headers={'content-type':'application/json'})=>new Response(body,{headers});

test('accepts small JSON directory and an empty successful result',async()=>{
  assert.deepEqual(await readGeoResponse(response('{"items":[]}')),{items:[]});
  assert.deepEqual(await readGeoResponse(response('{"items":[{"id":"a"}]}',{'content-type':'application/json; charset=utf-8'})),{items:[{id:'a'}]});
});

test('rejects HTML, malformed JSON, malformed UTF-8 and wrong envelope',async()=>{
  for(const r of [
    response('{"items":[]}',{'content-type':'text/html'}),
    response('{'),
    response(new Uint8Array([0xff])),
    response('{"items":null}'),
    response('[]'),
  ])await assert.rejects(readGeoResponse(r),/invalid_geo_response/);
});

test('rejects declared sizes above the limit or invalid content-length',async()=>{
  for(const length of [String(MAX_GEO_RESPONSE_BYTES+1),'not-a-number','99999999999999999999']){
    await assert.rejects(readGeoResponse(response('{"items":[]}',{'content-type':'application/json','content-length':length})),/invalid_geo_response/);
  }
});

test('rejects oversized streaming responses without declared size',async()=>{
  const body=new ReadableStream({start(controller){
    controller.enqueue(new Uint8Array(MAX_GEO_RESPONSE_BYTES));
    controller.enqueue(new Uint8Array(1));
    controller.close();
  }});
  await assert.rejects(readGeoResponse(response(body)),/invalid_geo_response/);
});

test('rejects HTTP errors and unavailable body stream',async()=>{
  await assert.rejects(readGeoResponse(new Response('{"items":[]}',{status:503,headers:{'content-type':'application/json'}})),/invalid_geo_response/);
  await assert.rejects(readGeoResponse(new Response(null,{headers:{'content-type':'application/json'}})),/invalid_geo_response/);
});

test('public directory response does not reflect unexpected upstream metadata',async()=>{
  const result=await readGeoResponse(response(JSON.stringify({
    items:[{id:'visible'}],
    trace_id:'internal-debug-id',
    internal_notes:'never expose this',
    credentials:{token:'secret'}
  })));
  assert.deepEqual(result,{items:[{id:'visible'}]});
  assert.equal('trace_id' in result,false);
  assert.equal('credentials' in result,false);
});

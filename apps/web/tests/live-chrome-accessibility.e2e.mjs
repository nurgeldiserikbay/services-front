import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

// No browser-testing dependency: use the Chrome installed on the Ubuntu CI
// runner and the Chrome DevTools Protocol. Missing Chrome is a failed gate.
const chrome=process.env.CHROME_BIN??'google-chrome';
const base=process.env.WEB_BASE_URL??'http://127.0.0.1:3000';
const dir=await mkdtemp(join(tmpdir(),'services-chrome-'));
const proc=spawn(chrome,[
  '--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
  '--no-first-run','--no-default-browser-check',
  '--remote-debugging-port=0','--user-data-dir='+dir,'about:blank',
],{stdio:'ignore'});
let closed=false;
proc.once('exit',()=>{closed=true;});
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let socket;
try{
  let port;
  for(let i=0;i<250;i++){
    if(closed)throw Error('headless Chrome exited before DevTools became ready');
    try{
      const data=await readFile(join(dir,'DevToolsActivePort'),'utf8');
      port=Number(data.split('\n')[0]);
      if(Number.isInteger(port)&&port>0)break;
    }catch{}
    await pause(100);
  }
  assert.ok(port,'Chrome DevTools endpoint was not available');
  const targets=await (await fetch('http://127.0.0.1:'+port+'/json/list')).json();
  const target=targets.find(item=>item.type==='page');
  assert.ok(target?.webSocketDebuggerUrl,'Chrome tab target is required');
  socket=new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{
    socket.addEventListener('open',resolve,{once:true});
    socket.addEventListener('error',reject,{once:true});
  });
  let nextId=0;
  const pending=new Map();
  socket.addEventListener('message',event=>{
    const response=JSON.parse(event.data);
    if(!response.id)return;
    const job=pending.get(response.id);
    if(!job)return;
    pending.delete(response.id);
    if(response.error)job.reject(Error(response.error.message));
    else job.resolve(response.result);
  });
  async function send(method,params={}){
    const id=++nextId;
    return await Promise.race([
      new Promise((resolve,reject)=>{
        pending.set(id,{resolve,reject});
        socket.send(JSON.stringify({id,method,params}));
      }),
      pause(10000).then(()=>{throw Error('Chrome DevTools timeout: '+method);}),
    ]);
  }
  async function evaluate(expression){
    const response=await send('Runtime.evaluate',{
      expression,returnByValue:true,awaitPromise:true,
    });
    if(response.exceptionDetails)throw Error(response.exceptionDetails.text);
    return response.result?.value;
  }
  await send('Page.enable');
  await send('Runtime.enable');
  for(const width of [320,375,768]){
    await send('Emulation.setDeviceMetricsOverride',{
      width,height:680,deviceScaleFactor:1,mobile:true,
    });
    for(const locale of ['kk','ru']){
    await send('Page.navigate',{url:new URL('/'+locale,base).href});
    let ready=false;
    for(let i=0;i<60;i++){
      ready=await evaluate('document.readyState==="complete" && document.documentElement.lang==="'+locale+'"');
      if(ready)break;
      await pause(100);
    }
    assert.ok(ready,locale+' page did not become ready in Chrome');
    const result=await evaluate(`(()=>{
      const skip=document.querySelector('a[href="#main-content"]');
      const main=document.querySelector('main#main-content');
      const viewport=document.querySelector('meta[name="viewport"]');
      if(skip)skip.focus();
      return {
        lang:document.documentElement.lang,
        viewport:viewport?.content??'',
        main:!!main,
        headings:document.querySelectorAll('h1').length,
        focusedSkip:document.activeElement===skip,
        documentWidth:document.documentElement.scrollWidth,
        innerWidth:innerWidth,
        controlBounds:[...document.querySelectorAll('.searchRow input,.searchRow button,.language a,.geoControls select')]
          .map(el=>{
            const rect=el.getBoundingClientRect();
            return {name:el.tagName,width:rect.width,left:rect.left,right:rect.right};
          }),
      };
    })()`);
    assert.equal(result.lang,locale);
    assert.match(result.viewport,/width=device-width/);
    assert.equal(result.main,true,'main landmark must exist');
    assert.equal(result.headings,1,'one primary heading required');
    assert.equal(result.focusedSkip,true,'keyboard skip link must accept focus');
    assert.ok(result.documentWidth<=result.innerWidth+1,
      locale+' has horizontal overflow at '+width+' CSS px: '+JSON.stringify(result));
    assert.ok(result.controlBounds.length>=4,'expected visible search and navigation controls');
    for(const control of result.controlBounds){
      assert.ok(control.width>0&&control.left>=-1&&control.right<=width+1,
        locale+' '+width+'px interactive control is clipped: '+JSON.stringify(control));
    }
    console.log('Chrome responsive keyboard/landmark smoke '+locale+' '+width+'px OK');
    }
  }
}finally{
  if(socket)socket.close();
  if(!closed)proc.kill('SIGTERM');
  await rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:100});
}

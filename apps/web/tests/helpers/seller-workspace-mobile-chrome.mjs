import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));

/** CI-only browser check against a real signed-in seller, backend and DB.
 * No browser or application auth bypass; the test owns its disposable session.
 * It checks responsive request lists, but never clicks a seller decision.
 */
export async function exerciseSellerWorkspaceMobileChrome({base,sealedCookie,requestIds}){
 assert.equal(process.env.CI,'true');
 const dir=await mkdtemp(join(tmpdir(),'seller-mobile-chrome-'));
 let child,socket,ended=false;
 try{
  child=spawn(process.env.CHROME_BIN??'google-chrome',[
   '--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
   '--no-first-run','--remote-debugging-port=0','--user-data-dir='+dir,
   'about:blank',
  ],{stdio:'ignore'});
  child.once('exit',()=>{ended=true;});
  child.once('error',()=>{ended=true;});
  let port;
  for(let attempt=0;attempt<200&&!ended;attempt++){
   try{
    const raw=await readFile(join(dir,'DevToolsActivePort'),'utf8');
    const parsed=Number(raw.split('\n')[0]);
    if(Number.isInteger(parsed)&&parsed>0&&parsed<65536){port=parsed;break;}
   }catch{}
   await pause(100);
  }
  assert.ok(port,'seller mobile Chrome DevTools must start');
  const targets=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();
  const target=targets.find(t=>t.type==='page');
  assert.ok(target?.webSocketDebuggerUrl);
  socket=new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{
   socket.addEventListener('open',resolve,{once:true});
   socket.addEventListener('error',reject,{once:true});
  });
  let seq=0;const pending=new Map();
  socket.addEventListener('message',event=>{
   const response=JSON.parse(event.data);
   if(!response.id)return;
   const entry=pending.get(response.id);
   if(!entry)return;
   pending.delete(response.id);
   if(response.error)entry.reject(Error(response.error.message));
   else entry.resolve(response.result);
  });
  async function send(method,params={}){
   const id=++seq;
   let timer;
   try{return await Promise.race([
    new Promise((resolve,reject)=>{
     pending.set(id,{resolve,reject});
     socket.send(JSON.stringify({id,method,params}));
    }),
    new Promise((_resolve,reject)=>{
     timer=setTimeout(()=>reject(Error('seller Chrome CDP timeout: '+method)),12000);
    }),
   ]);}
   finally{clearTimeout(timer);pending.delete(id);}
  }
  async function evaluate(expression){
   const reply=await send('Runtime.evaluate',{
    expression,returnByValue:true,awaitPromise:true,
   });
   if(reply.exceptionDetails)throw Error(
    'seller Chrome evaluation failed: '+
    (reply.exceptionDetails.exception?.description??reply.exceptionDetails.text));
   return reply.result?.value;
  }
  await send('Page.enable');await send('Runtime.enable');await send('Network.enable');
  const cookie=await send('Network.setCookie',{
   name:'__Host-services_account_web',value:sealedCookie,url:base,
   secure:true,httpOnly:true,sameSite:'Strict',path:'/',
  });
  assert.equal(cookie.success,true,'Chrome must accept sealed seller HttpOnly cookie');
  const cookies=(await send('Network.getCookies',{urls:[base]})).cookies??[];
  assert.ok(cookies.some(c=>c.name==='__Host-services_account_web'&&c.httpOnly&&c.secure));
  for(const width of [320,375,768]){
   await send('Emulation.setDeviceMetricsOverride',{
    width,height:740,deviceScaleFactor:1,mobile:true,
   });
   for(const locale of ['kk','ru']){
    await send('Page.navigate',{url:new URL('/'+locale+'/seller/requests',base).href});
    let data;
    for(let attempt=0;attempt<100;attempt++){
     try{
      data=await evaluate('(()=>{'+
       'const main=document.querySelector("main#main-content");'+
       'const sections=[...document.querySelectorAll("main section[aria-label]")];'+
       'const expected='+JSON.stringify(locale==='kk'?'Өтінімдер':'Заявки')+';'+
       'const inbox=sections.filter(x=>x.getAttribute("aria-label")===expected);'+
       'const rows=inbox.flatMap(x=>[...x.querySelectorAll("ul li")]);'+
       'const buttons=inbox.flatMap(x=>[...x.querySelectorAll("button")]);'+
       'const controls=buttons.map(x=>{const r=x.getBoundingClientRect();'+
       'return {label:x.textContent?.trim()??"",width:r.width,height:r.height,left:r.left,right:r.right};});'+
       'return {ready:document.readyState==="complete",'+
       'lang:document.documentElement.lang,heading:main?.querySelector("h1")?.textContent?.trim()??"",'+
       'main:!!main,sectionCount:inbox.length,rowCount:rows.length,'+
       'buttons:controls,scrollWidth:document.documentElement.scrollWidth,'+
       'viewport:innerWidth,hasError:!!main?.querySelector("[role=alert]"),'+
       'bodyText:main?.textContent??""};'+
       '})()');
     }catch(error){
      // Next.js can dispose the old Chrome context during navigation.
      if(attempt===99)throw error;
      await pause(100);continue;
     }
     if(data.ready&&data.sectionCount===2&&data.rowCount>=requestIds.length&&
        data.buttons.length>=12)break;
     await pause(100);
    }
    assert.equal(data.lang,locale);
    assert.equal(data.main,true);
    assert.equal(data.heading,locale==='kk'?'Менің өтінімдерім':'Мои заявки');
    assert.equal(data.sectionCount,2,'both seller scopes must render');
    assert.ok(data.rowCount>=requestIds.length,'real seller rows must load');
    assert.equal(data.hasError,false,'seller workspace must not show an error');
    assert.ok(!data.bodyText.includes(sealedCookie),'no sealed cookie in DOM');
    assert.ok(data.scrollWidth<=data.viewport+1,
     'seller horizontal overflow at '+width+' '+locale+': '+JSON.stringify(data));
    assert.ok(data.buttons.length>=12,'seller filters and decisions must render');
    for(const control of data.buttons){
     assert.ok(control.width>0&&control.left>=-1&&control.right<=width+1,
      'seller control clipped at '+width+' '+locale+': '+JSON.stringify(control));
     assert.ok(control.height>=44,
      'seller control shorter than 44px at '+width+' '+locale+': '+JSON.stringify(control));
    }
    // Even requests with identical titles require unique accessible
    // action names. The short request id disambiguates them for screen
    // readers without changing the visual action buttons or API payload.
    if(width===375){
     const axActions=await send('Accessibility.getFullAXTree');
     const names=axActions.nodes?.filter(node=>
       !node.ignored&&node.role?.value==='button'
     ).map(node=>node.name?.value??'')??[];
     for(const [verb,expected] of [
       [locale==='kk'?'Қабылдау':'Принять',requestIds.length],
       [locale==='kk'?'Бас тарту':'Отклонить',requestIds.length],
     ]){
      const matching=names.filter(name=>
        name.startsWith(verb+': Signed seller CI offer № '));
      assert.equal(matching.length,expected,
        locale+' seller '+verb+' AX actions must identify each pending request: '+
          JSON.stringify(matching));
      assert.equal(new Set(matching).size,expected,
        locale+' same-titled seller requests need distinct accessible names');
     }
     console.log('Chrome seller unique action accessible names '+locale+' PASS');
    }
    // Exercise actual keyboard activation on the authenticated seller's
    // filter group, without clicking any accept/decline mutation control.
    // This checks hydrated React state, accessible pressed semantics and
    // native Enter activation rather than relying on source-level aria attrs.
    if(width===375){
     const focused=await evaluate('(()=>{'+
      'const groups=[...document.querySelectorAll("main section[aria-label]")];'+
      'const target=groups[1]?.querySelectorAll("button[aria-pressed]")[1];'+
      'if(!target)return false;target.focus();'+
      'return document.activeElement===target&&'+
      'target.getAttribute("aria-pressed")==="false";})()');
     assert.equal(focused,true,'seller pending filter must take keyboard focus');
     await send('Input.dispatchKeyEvent',{
      type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,text:'\r',
      unmodifiedText:'\r',
     });
     await send('Input.dispatchKeyEvent',{
      type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,
     });
     let pendingActive=false;
     for(let attempt=0;attempt<40;attempt++){
      pendingActive=await evaluate('(()=>{'+
       'const groups=[...document.querySelectorAll("main section[aria-label]")];'+
       'const group=groups[1];'+
       'const buttons=group?.querySelectorAll("button[aria-pressed]");'+
       'return buttons?.[1]?.getAttribute("aria-pressed")==="true"&&'+
       'buttons?.[0]?.getAttribute("aria-pressed")==="false"&&'+
       'group?.querySelectorAll("ul li").length==='+requestIds.length+';})()');
      if(pendingActive)break;
      await pause(100);
     }
     assert.equal(pendingActive,true,'Enter must activate seller pending filter');
     const focusedAll=await evaluate('(()=>{'+
      'const groups=[...document.querySelectorAll("main section[aria-label]")];'+
      'const all=groups[1]?.querySelectorAll("button[aria-pressed]")[0];'+
      'all?.focus();return document.activeElement===all;})()');
     assert.equal(focusedAll,true,'seller all filter must take keyboard focus');
     await send('Input.dispatchKeyEvent',{
      type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,text:'\r',
      unmodifiedText:'\r',
     });
     await send('Input.dispatchKeyEvent',{
      type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,
     });
     let restored=false;
     for(let attempt=0;attempt<40;attempt++){
      restored=await evaluate('(()=>{'+
       'const groups=[...document.querySelectorAll("main section[aria-label]")];'+
       'const buttons=groups[1]?.querySelectorAll("button[aria-pressed]");'+
       'return buttons?.[0]?.getAttribute("aria-pressed")==="true"&&'+
       'buttons?.[1]?.getAttribute("aria-pressed")==="false";})()');
      if(restored)break;
      await pause(100);
     }
     assert.equal(restored,true,'Enter must restore all seller requests');
     // The Chrome accessibility tree, not merely DOM text, must expose
     // localized filter buttons with their names. Numeric counts are
     // aria-hidden and must never replace a meaningful accessible name.
     const expectedClosed=locale==='kk'?'Жабылған':'Закрытые';
     const accessibility=await send('Accessibility.getFullAXTree');
     assert.ok(accessibility.nodes?.some(node=>
      !node.ignored&&['button','toggleButton'].includes(node.role?.value)&&
      node.name?.value?.trim()===expectedClosed),
      locale+' closed filter must have a named Chrome AX button');
     // With two seeded PENDING rows, keyboard-only Closed must show a
     // localized empty state, hide decisions and preserve the backend rows.
     const focusedClosed=await evaluate('(()=>{'+
      'const groups=[...document.querySelectorAll("main section[aria-label]")];'+
      'const closed=groups[1]?.querySelectorAll("button[aria-pressed]")[3];'+
      'closed?.focus();return document.activeElement===closed;})()');
     assert.equal(focusedClosed,true,'closed filter must take keyboard focus');
     await send('Input.dispatchKeyEvent',{
      type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,text:'\r',
      unmodifiedText:'\r',
     });
     await send('Input.dispatchKeyEvent',{
      type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,
     });
     const noFilter=locale==='kk'?'Бұл сүзгіде өтінім жоқ':'В этом разделе заявок нет';
     let empty=false;
     for(let attempt=0;attempt<40;attempt++){
      empty=await evaluate('(()=>{'+
       'const groups=[...document.querySelectorAll("main section[aria-label]")];'+
       'const group=groups[1];const buttons=group?.querySelectorAll("button[aria-pressed]");'+
       'return buttons?.[3]?.getAttribute("aria-pressed")==="true"&&'+
       'group?.querySelectorAll("ul li").length===0&&'+
       'group?.querySelector("[role=status]")?.textContent?.trim()==='+JSON.stringify(noFilter)+';})()');
      if(empty)break;
      await pause(100);
     }
     assert.equal(empty,true,'Closed filter must announce localized empty state');
     const backToAll=await evaluate('(()=>{'+
      'const groups=[...document.querySelectorAll("main section[aria-label]")];'+
      'const all=groups[1]?.querySelectorAll("button[aria-pressed]")[0];'+
      'all?.focus();return document.activeElement===all;})()');
     assert.equal(backToAll,true,'All filter must regain keyboard focus');
     await send('Input.dispatchKeyEvent',{
      type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,text:'\r',
      unmodifiedText:'\r',
     });
     await send('Input.dispatchKeyEvent',{
      type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,
     });
     let rowsRestored=false;
     for(let attempt=0;attempt<40;attempt++){
      rowsRestored=await evaluate('(()=>{'+
       'const groups=[...document.querySelectorAll("main section[aria-label]")];'+
       'const group=groups[1];'+
       'return group?.querySelectorAll("ul li").length==='+requestIds.length+'&&'+
       'group?.querySelectorAll("button[aria-pressed]")[0]?.getAttribute("aria-pressed")==="true";})()');
      if(rowsRestored)break;
      await pause(100);
     }
     assert.equal(rowsRestored,true,'All filter must restore actual seller rows');
     console.log('Chrome seller keyboard Enter/empty-state filters '+locale+' PASS');
    }
    console.log('Chrome seller authenticated mobile '+locale+' '+width+'px PASS');
   }
  }
 }finally{
  if(socket)socket.close();
  if(child&&!ended)child.kill('SIGTERM');
  await rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:100});
 }
}

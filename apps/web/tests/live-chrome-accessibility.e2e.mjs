import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

// No browser-testing dependency: use the Chrome installed on the Ubuntu CI
// runner and the Chrome DevTools Protocol. Missing Chrome is a failed gate.
const chrome=process.env.CHROME_BIN??'google-chrome';
const base=process.env.WEB_BASE_URL??'http://127.0.0.1:3000';
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const launchArgs=dir=>[
  '--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
  '--no-first-run','--no-default-browser-check',
  '--remote-debugging-port=0','--user-data-dir='+dir,'about:blank',
];
let proc;
let dir;
let closed=true;
let socket;
try{
  let port;
  // Chrome sometimes fails before it creates DevToolsActivePort on shared CI
  // runners. Retry the browser *startup only*, never failed a11y assertions.
  for(let attempt=0;attempt<2&&!port;attempt++){
    dir=await mkdtemp(join(tmpdir(),'services-chrome-'));
    const child=spawn(chrome,launchArgs(dir),{stdio:'ignore'});
    proc=child;
    closed=false;
    // An earlier attempt may exit after the replacement starts.
    // Never let its late event mark the new browser process as closed.
    child.once('exit',()=>{if(proc===child)closed=true;});
    child.once('error',()=>{if(proc===child)closed=true;});
    for(let i=0;i<250;i++){
      if(closed)break;
      try{
        const data=await readFile(join(dir,'DevToolsActivePort'),'utf8');
        const candidate=Number(data.split('\n')[0]);
        if(Number.isInteger(candidate)&&candidate>0&&candidate<=65535){port=candidate;break;}
      }catch{}
      await pause(100);
    }
    if(!port){
      if(!closed)proc.kill('SIGTERM');
      await rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:100});
      dir=undefined;
      if(attempt===0)console.error('Chrome DevTools startup failed; retrying once with a clean profile');
    }
  }
  assert.ok(port,'Chrome DevTools endpoint was not available after two startup attempts');
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
    // Next.js may settle streamed navigation/layout after readyState becomes complete.
    // Retry a bounded number of animation frames before treating zero-width links
    // as a genuine clipping defect; never skip the final assertion.
    let result;
    for(let attempt=0;attempt<20;attempt++){
    result=await evaluate(`(()=>{
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
    if(result.controlBounds.length>=4&&result.controlBounds.every(control=>
      control.width>0&&control.left>=-1&&control.right<=width+1))break;
    await pause(100);
    }
    assert.equal(result.lang,locale);
    assert.match(result.viewport,/width=device-width/);
    assert.equal(result.main,true,'main landmark must exist');
    assert.equal(result.headings,1,'one primary heading required');
    assert.equal(result.focusedSkip,true,'keyboard skip link must accept focus');
    // Press Enter on the actual skip link instead of accepting focus alone.
    // The target must resolve to the main landmark in the same document.
    if(width===375){
      await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,text:'\r',unmodifiedText:'\r'});
      await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
      let jumped=false;
      for(let attempt=0;attempt<40;attempt++){
        jumped=await evaluate(`(()=>{
          const target=document.querySelector('main#main-content');
          return location.hash==='#main-content'&&
            document.getElementById('main-content')===target;
        })()`);
        if(jumped)break;
        await pause(100);
      }
      assert.equal(jumped,true,locale+' keyboard skip-link Enter must navigate to main landmark');
      // A new navigation restores the pristine URL and focus for search tests.
      await send('Page.navigate',{url:new URL('/'+locale,base).href});
      let restored=false;
      for(let attempt=0;attempt<60;attempt++){
        restored=await evaluate(`document.readyState==='complete'&&
          !location.hash&&document.documentElement.lang==='${locale}'&&
          !!document.querySelector('input#query')`);
        if(restored)break;
        await pause(100);
      }
      assert.equal(restored,true,locale+' must restore search after skip-link navigation');
    }

    assert.ok(result.documentWidth<=result.innerWidth+1,
      locale+' has horizontal overflow at '+width+' CSS px: '+JSON.stringify(result));
    assert.ok(result.controlBounds.length>=4,'expected visible search and navigation controls');
    for(const control of result.controlBounds){
      assert.ok(control.width>0&&control.left>=-1&&control.right<=width+1,
        locale+' '+width+'px interactive control is clipped: '+JSON.stringify(control));
    }
    // Inspect Chrome's computed accessibility tree, not only source-level
    // aria-label attributes. Every locale must expose a named delivery select.
    const selectName=locale==='kk'?'Қызмет көрсету орны':'Где окажут услугу?';
    let namedCombobox=false;
    // The AX tree may lag the restored Next.js navigation after readyState
    // completes. Wait for the actual named and exposed Chrome AX node;
    // never accept a DOM-only aria label or skip the accessibility gate.
    for(let attempt=0;attempt<30;attempt++){
      const accessibility=await send('Accessibility.getFullAXTree');
      namedCombobox=!!accessibility.nodes?.some(node=>
        node.role?.value==='combobox'&&node.name?.value===selectName&&!node.ignored);
      if(namedCombobox)break;
      await pause(100);
    }
    assert.ok(namedCombobox,
      locale+' '+width+'px delivery filter has no named Chrome accessibility combobox');
    // Exercise an actual native keyboard submission instead of only checking
    // the form's HTML. Focus the search input, type via Chrome, and press Enter.
    if(width===375){
      const focused=await evaluate(`(()=>{
        const input=document.querySelector('input#query');
        input?.focus();
        return document.activeElement===input;
      })()`);
      assert.equal(focused,true,locale+' search input cannot receive keyboard focus');
      await send('Input.insertText',{text:'Stage 2 Journey'});
      await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,text:'\r',unmodifiedText:'\r'});
      await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
      let found=false;
      for(let attempt=0;attempt<100;attempt++){
        found=await evaluate(`(()=>{
          const query=new URL(location.href).searchParams.get('q');
          return query==='Stage 2 Journey'&&
            document.querySelectorAll('.resultItem').length>=2;
        })()`);
        if(found)break;
        await pause(100);
      }
      const diagnostic=await evaluate(`(()=>({
        href:location.href,
        searchInput:document.querySelector('input#query')?.value??null,
        resultCards:document.querySelectorAll('.resultItem').length,
        activeTag:document.activeElement?.tagName??null
      }))()`);
      assert.equal(found,true,locale+' Enter submission did not navigate to seeded results: '+JSON.stringify(diagnostic));
      console.log('Chrome real keyboard Enter search '+locale+' OK');
      // Continue the keyboard-only journey: activate the visible reset link
      // using Enter and verify a truly clean locale-root search state.
      let resetReady=false;
      for(let attempt=0;attempt<30;attempt++){
        resetReady=await evaluate(`(()=>{
          const link=document.querySelector('a.clearFilters');
          if(!link)return false;
          link.focus();
          return document.activeElement===link;
        })()`);
        if(resetReady)break;
        await pause(100);
      }
      assert.equal(resetReady,true,locale+' clear-filters link cannot receive keyboard focus');

      const resetTarget=await evaluate(`(()=>{
        const link=document.querySelector('a.clearFilters');
        const bounds=link?.getBoundingClientRect();
        return {height:bounds?.height??0,width:bounds?.width??0,
          label:link?.textContent?.trim()??'',visible:!!link&&getComputedStyle(link).visibility!=='hidden'};
      })()`);
      const expectedResetLabel=locale==='kk'
        ? 'Іздеуді және сүзгілерді тазарту'
        : 'Очистить поиск и фильтры';
      assert.equal(resetTarget.label,expectedResetLabel,
        locale+' reset link must have a localized visible label');
      assert.ok(resetTarget.visible&&resetTarget.height>=44&&resetTarget.width>=44,
        locale+' reset must be a visible 44 CSS px touch/keyboard target: '+JSON.stringify(resetTarget));
      const resetAx=await send('Accessibility.getFullAXTree');
      assert.ok(resetAx.nodes?.some(node=>
        node.role?.value==='link'&&node.name?.value===expectedResetLabel&&!node.ignored),
        locale+' reset link must expose an accessible name in Chrome');

      await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,text:'\r',unmodifiedText:'\r'});
      await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
      let resetCompleted=false;
      for(let attempt=0;attempt<100;attempt++){
        resetCompleted=await evaluate(`(()=>{
          const url=new URL(location.href);
          return url.pathname==='/${locale}'&&url.search===''&&
            document.querySelector('input#query')?.value===''&&
            !document.querySelector('a.clearFilters')&&
            document.querySelectorAll('.resultItem').length===0;
        })()`);
        if(resetCompleted)break;
        await pause(100);
      }
      const resetDiagnostic=await evaluate(`(()=>({
        href:location.href,
        query:document.querySelector('input#query')?.value??null,
        resetLink:!!document.querySelector('a.clearFilters'),
        resultCards:document.querySelectorAll('.resultItem').length
      }))()`);
      assert.equal(resetCompleted,true,locale+' keyboard clear-all did not reach pristine search: '+JSON.stringify(resetDiagnostic));
      console.log('Chrome keyboard Enter clear-filters '+locale+' OK');

      // Real mobile keyboard language-switch journey with an active query and
      // delivery filter. This complements SSR link assertions by exercising
      // the rendered link, Chrome focus and navigation in both directions.
      const targetLocale=locale==='kk'?'ru':'kk';
      const activeSearch=new URL('/'+locale,base);
      activeSearch.searchParams.set('q','Stage 2 Journey');
      activeSearch.searchParams.set('delivery_mode','online');
      await send('Page.navigate',{url:activeSearch.href});
      let sourceReady=false;
      for(let attempt=0;attempt<100;attempt++){
        try{
          sourceReady=await evaluate(`(()=>{
            const url=new URL(location.href);
            return document.readyState==='complete'&&
              document.documentElement.lang==='${locale}'&&
              url.searchParams.get('q')==='Stage 2 Journey'&&
              document.querySelector('#delivery_mode')?.value==='online'&&
              !!document.querySelector('.language a[href^="/${targetLocale}"]');
          })()`);
        }catch{sourceReady=false;}
        if(sourceReady)break;
        await pause(100);
      }
      assert.equal(sourceReady,true,locale+' filtered source must render before switching');
      const languageLink=await evaluate(`(()=>{
        const link=document.querySelector('.language a[href^="/${targetLocale}"]');
        if(!link)return null;
        const rect=link.getBoundingClientRect();
        link.focus();
        return {focused:document.activeElement===link,href:link.getAttribute('href'),
          width:rect.width,left:rect.left,right:rect.right};
      })()`);
      assert.ok(languageLink&&languageLink.focused,
        locale+' language switch must be keyboard focusable');
      assert.ok(languageLink.width>0&&languageLink.left>=-1&&languageLink.right<=376,
        locale+' language switch must fit a 375px mobile viewport');
      const linkUrl=new URL(languageLink.href,base);
      assert.equal(linkUrl.pathname,'/'+targetLocale);
      assert.equal(linkUrl.searchParams.get('q'),'Stage 2 Journey');
      assert.equal(linkUrl.searchParams.get('delivery_mode'),'online');
      const languageAX=await send('Accessibility.getFullAXTree');
      assert.ok(languageAX.nodes?.some(node=>!node.ignored&&
        node.role?.value==='link'&&node.name?.value?.includes(targetLocale==='kk'?'ҚАЗ':'РУС')),
        locale+' switch must appear as a named Chrome accessibility link');
      await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',
        code:'Enter',windowsVirtualKeyCode:13,text:'\r',unmodifiedText:'\r'});
      await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',
        code:'Enter',windowsVirtualKeyCode:13});
      let switched=false;
      for(let attempt=0;attempt<100;attempt++){
        try{
          switched=await evaluate(`(()=>{
            const url=new URL(location.href);
            return document.readyState==='complete'&&
              url.pathname==='/${targetLocale}'&&
              document.documentElement.lang==='${targetLocale}'&&
              url.searchParams.get('q')==='Stage 2 Journey'&&
              url.searchParams.get('delivery_mode')==='online'&&
              document.querySelector('input#query')?.value==='Stage 2 Journey'&&
              document.querySelector('#delivery_mode')?.value==='online'&&
              !!document.querySelector('main#main-content');
          })()`);
        }catch{switched=false;}
        if(switched)break;
        await pause(100);
      }
      const switchedState=await evaluate(`(()=>({
        href:location.href,lang:document.documentElement.lang,
        query:document.querySelector('input#query')?.value??null,
        delivery:document.querySelector('#delivery_mode')?.value??null
      }))()`);
      assert.equal(switched,true,
        locale+' native Enter language switch lost the search/filter: '+
        JSON.stringify(switchedState));
      console.log('Chrome mobile filtered keyboard locale switch '+
        locale+' -> '+targetLocale+' PASS');

    }
    console.log('Chrome responsive keyboard/landmark smoke '+locale+' '+width+'px OK');
    }
  }

  // Expand mobile Chrome coverage beyond the catalog to seeded public detail
  // pages. This does not attest to physical devices or screen-reader behavior.
  for(const width of [320,375,768]){
    await send('Emulation.setDeviceMetricsOverride',{
      width,height:680,deviceScaleFactor:1,mobile:true,
    });
    for(const locale of ['kk','ru']){
      for(const [kind,route] of [
        ['professional','/professionals/ci-stage2-specialist'],
        ['organization','/organizations/10000000-0000-4000-8000-000000000006'],
        ['offer','/services/10000000-0000-4000-8000-000000000007'],
      ]){
        await send('Page.navigate',{url:new URL('/'+locale+route,base).href});
        let page;
        for(let attempt=0;attempt<90;attempt++){
          try{
          page=await evaluate('(()=>{'+
            'const main=document.querySelector("main#main-content");'+
            'const heading=main?.querySelector("h1");'+
            'const back=main?.querySelector(\'a[href="/'+locale+'"]\');'+
            'const bounds=back?.getBoundingClientRect();'+
            'return {ready:document.readyState==="complete",'+
            'locale:document.documentElement.lang,main:!!main,'+
            'heading:heading?.textContent?.trim()??"",'+
            'headingCount:main?.querySelectorAll("h1").length??0,'+
            'backWidth:bounds?.width??0,backLeft:bounds?.left??-1,'+
            'backRight:bounds?.right??-1,'+
            'documentWidth:document.documentElement.scrollWidth,'+
            'viewportWidth:innerWidth,'+
            'isError:!!main?.querySelector("[role=alert],[role=status]")};'+
          '})()');
          }catch(error){
            // Next.js streamed navigation can replace the document's JS
            // execution context between DevTools command and evaluation.
            // Retry only until a fresh context loads; never skip assertions.
            if(attempt===89)throw error;
            await pause(100);
            continue;
          }
          if(page.ready&&page.main&&page.heading&&page.backWidth>0)break;
          await pause(100);
        }
        assert.equal(page.locale,locale,kind+' locale mismatch');
        assert.equal(page.main,true,kind+' main landmark missing');
        assert.equal(page.headingCount,1,kind+' must have one primary heading');
        assert.ok(page.heading,kind+' heading missing from seeded backend');
        assert.equal(page.isError,false,kind+' rendered an unavailable state');
        assert.ok(page.documentWidth<=page.viewportWidth+1,
          kind+' '+locale+' '+width+'px overflow: '+JSON.stringify(page));
        assert.ok(page.backWidth>0&&page.backLeft>=-1&&page.backRight<=width+1,
          kind+' '+locale+' '+width+'px return link clipped: '+JSON.stringify(page));
        if(width===375){
          const label=locale==='kk'?'Іздеуге қайту':'Назад к поиску';
          // Confirm the actual computed Chrome AX name, then use a native
          // keyboard Enter on the visible detail-page search return link.
          const candidate=await evaluate('(()=>{'+
            'const links=[...document.querySelectorAll("main a")];'+
            'const link=links.find(a=>a.textContent?.trim()==='+JSON.stringify(label)+');'+
            'if(!link)return null;'+
            'const rect=link.getBoundingClientRect();link.focus();'+
            'return {href:link.getAttribute("href"),focused:document.activeElement===link,'+
            'width:rect.width,height:rect.height,left:rect.left,right:rect.right};})()');
          assert.ok(candidate,kind+' '+locale+' back-to-search link required');
          assert.equal(candidate.href,'/'+locale);
          assert.equal(candidate.focused,true,kind+' back link keyboard focus');
          assert.ok(candidate.width>0&&candidate.left>=-1&&candidate.right<=width+1,
            kind+' back link must remain in the mobile viewport');
          const ax=await send('Accessibility.getFullAXTree');
          assert.ok(ax.nodes?.some(node=>
            !node.ignored&&node.role?.value==='link'&&
            node.name?.value?.trim()===label),
            kind+' '+locale+' back link must have a localized Chrome accessible name');
          await send('Input.dispatchKeyEvent',{
            type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,
            text:'\r',unmodifiedText:'\r',
          });
          await send('Input.dispatchKeyEvent',{
            type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,
          });
          let returned=false;
          for(let attempt=0;attempt<90;attempt++){
            try{
              returned=await evaluate('(()=>location.pathname==='+JSON.stringify('/'+locale)+
                '&&!!document.querySelector("main#main-content input#query"))()');
            }catch{
              // Navigation may replace Chrome's execution context.
              returned=false;
            }
            if(returned)break;
            await pause(100);
          }
          assert.equal(returned,true,
            kind+' '+locale+' native Enter must return to the search page');
          console.log('Chrome public detail keyboard back link '+kind+' '+locale+' PASS');
        }
        console.log('Chrome mobile public detail '+kind+' '+locale+' '+width+'px OK');
      }
    }
  }
  // Use the separately launched outage server to check the actual error
  // recovery control in Chrome's accessibility tree at a mobile viewport.
  await send('Emulation.setDeviceMetricsOverride',{
    width:375,height:680,deviceScaleFactor:1,mobile:true,
  });
  for(const [locale,label] of [
    ['kk','Қайта іздеу'],
    ['ru','Повторить поиск'],
  ]){
    const outageUrl=new URL('/'+locale,process.env.FAILURE_WEB_BASE_URL??'http://127.0.0.1:3002');
    outageUrl.searchParams.set('q','Stage 2 Journey');
    outageUrl.searchParams.set('delivery_mode','online');
    await send('Page.navigate',{url:outageUrl.href});
    let retryState;
    for(let attempt=0;attempt<100;attempt++){
      retryState=await evaluate(`(()=>{
        const a=document.querySelector('a.retrySearch');
        const rect=a?.getBoundingClientRect();
        return {
          lang:document.documentElement.lang,
          href:a?.href??null,
          name:a?.textContent?.trim()??null,
          focused:(a?.focus(),document.activeElement===a),
          width:rect?.width??0,
          height:rect?.height??0,
          resultCount:document.querySelectorAll('.resultItem').length,
          hasErrorStatus:!!document.querySelector('[role="status"].message'),
        };
      })()`);
      if(retryState.lang===locale&&retryState.href&&retryState.width>0)break;
      await pause(100);
    }
    assert.equal(retryState.lang,locale);
    assert.equal(retryState.name,label,locale+' retry must be localized');
    assert.equal(new URL(retryState.href).searchParams.get('q'),'Stage 2 Journey');
    assert.equal(new URL(retryState.href).searchParams.get('delivery_mode'),'online');
    assert.equal(retryState.focused,true,locale+' retry must be focusable');
    assert.ok(retryState.width>=44&&retryState.height>=44,
      locale+' retry must provide at least 44x44 CSS px target: '+JSON.stringify(retryState));
    assert.equal(retryState.hasErrorStatus,true,locale+' outage must announce error status');
    assert.equal(retryState.resultCount,0,locale+' outage must not fabricate result cards');
    const ax=await send('Accessibility.getFullAXTree');
    assert.ok(ax.nodes?.some(node=>
      !node.ignored&&node.role?.value==='link'&&node.name?.value===label),
      locale+' retry must expose an accessible link name in real Chrome');
    console.log('Chrome outage retry a11y '+locale+' 375px OK');
  }
}finally{
  if(socket)socket.close();
  if(proc&&!closed)proc.kill('SIGTERM');
  if(dir)await rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:100});
}

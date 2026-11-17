import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir,mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

// Lab baseline only. No production SLO or performance score can be inferred
// from a single unthrottled CI runner, and INP needs real interactions.
const base=process.env.WEB_BASE_URL??'http://127.0.0.1:3000';
const output=process.env.PERFORMANCE_BASELINE_FILE??'artifacts/performance-baseline.json';
const chrome=process.env.CHROME_BIN??'google-chrome';
const dir=await mkdtemp(join(tmpdir(),'services-vitals-'));
const proc=spawn(chrome,[
  '--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
  '--no-first-run','--no-default-browser-check','--remote-debugging-port=0',
  '--user-data-dir='+dir,'about:blank',
],{stdio:'ignore'});
let closed=false;
proc.once('exit',()=>{closed=true;});
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let socket;
try {
  let port;
  for(let i=0;i<250;i++){
    if(closed)throw Error('Chrome exited before DevTools was ready');
    try {
      const content=await readFile(join(dir,'DevToolsActivePort'),'utf8');
      port=Number(content.split('\n')[0]);
      if(Number.isInteger(port)&&port>0)break;
    }catch{}
    await pause(100);
  }
  assert.ok(port,'Chrome DevTools endpoint unavailable');
  const targets=await (await fetch('http://127.0.0.1:'+port+'/json/list')).json();
  const target=targets.find(item=>item.type==='page');
  assert.ok(target?.webSocketDebuggerUrl,'Chrome page target required');
  socket=new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{
    socket.addEventListener('open',resolve,{once:true});
    socket.addEventListener('error',reject,{once:true});
  });
  let nextId=0;
  const jobs=new Map();
  socket.addEventListener('message',event=>{
    const result=JSON.parse(event.data);
    if(!result.id)return;
    const job=jobs.get(result.id);
    if(!job)return;
    jobs.delete(result.id);
    if(result.error)job.reject(Error(result.error.message));
    else job.resolve(result.result);
  });
  async function send(method,params={}){
    const id=++nextId;
    let timeout;
    try {
      return await Promise.race([
        new Promise((resolve,reject)=>{
          jobs.set(id,{resolve,reject});
          socket.send(JSON.stringify({id,method,params}));
        }),
        new Promise((_resolve,reject)=>{
          timeout=setTimeout(()=>reject(Error('Chrome DevTools timeout: '+method)),10000);
        }),
      ]);
    }finally{
      clearTimeout(timeout);
      jobs.delete(id);
    }
  }
  async function evaluate(expression){
    const result=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
    if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description??result.exceptionDetails.text);
    return result.result?.value;
  }
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Page.addScriptToEvaluateOnNewDocument',{source:`
    window.__servicesLabVitals={lcp:0,cls:0};
    try {
      new PerformanceObserver(list=>{
        for(const entry of list.getEntries()){
          window.__servicesLabVitals.lcp=entry.startTime;
        }
      }).observe({type:'largest-contentful-paint',buffered:true});
    }catch{}
    try {
      new PerformanceObserver(list=>{
        for(const entry of list.getEntries()){
          if(!entry.hadRecentInput)window.__servicesLabVitals.cls+=entry.value;
        }
      }).observe({type:'layout-shift',buffered:true});
    }catch{}
  `});
  const samples=[];
  for(const width of [375,768]){
    await send('Emulation.setDeviceMetricsOverride',{
      width,height:720,deviceScaleFactor:1,mobile:true,
    });
    for(const locale of ['kk','ru']){
      const url=new URL('/'+locale,base);
      await send('Page.navigate',{url:url.href});
      let snapshot;
      for(let attempt=0;attempt<120;attempt++){
        try {
        snapshot=await evaluate(`(()=>{
          const navigation=performance.getEntriesByType('navigation')[0];
          const fcp=performance.getEntriesByName('first-contentful-paint')[0];
          return {
            ready:document.readyState==='complete',
            locale:document.documentElement.lang,
            main:!!document.querySelector('main#main-content'),
            fcpMs:fcp?.startTime??null,
            lcpMs:window.__servicesLabVitals?.lcp??null,
            cls:window.__servicesLabVitals?.cls??null,
            dclMs:navigation?.domContentLoadedEventEnd??null,
            responseEndMs:navigation?.responseEnd??null,
          };
        })()`);
        }catch(error){
          // A navigation can replace Chrome's JS execution context while
          // DevTools is evaluating; retry until the fresh document is ready.
          if(attempt===119)throw error;
          await pause(100);
          continue;
        }
        if(snapshot.ready&&snapshot.main&&snapshot.locale===locale&&snapshot.fcpMs>0&&snapshot.lcpMs>0)break;
        await pause(100);
      }
      assert.equal(snapshot.locale,locale,'Chrome lab locale not ready');
      assert.equal(snapshot.main,true,'Chrome lab main landmark absent');
      assert.ok(snapshot.fcpMs>0,'FCP must be observed');
      assert.ok(snapshot.lcpMs>0,'LCP must be observed');
      assert.ok(Number.isFinite(snapshot.cls)&&snapshot.cls>=0,'CLS must be finite and nonnegative');
      assert.ok(snapshot.dclMs>=0&&snapshot.responseEndMs>=0,'Navigation timing required');
      samples.push({locale,widthCssPx:width,
        firstContentfulPaintMs:Math.round(snapshot.fcpMs),
        largestContentfulPaintMs:Math.round(snapshot.lcpMs),
        cumulativeLayoutShift:Number(snapshot.cls.toFixed(4)),
        domContentLoadedMs:Math.round(snapshot.dclMs),
        responseEndMs:Math.round(snapshot.responseEndMs)});
    }
  }
  const report={schemaVersion:1,kind:'unthrottled-ci-lab-baseline',
    disclaimer:'CI runner lab observations only; not a Lighthouse score, field Core Web Vitals, or a release SLO. INP not measured.',
    chromeVersion:(await send('Browser.getVersion')).product,
    samples};
  const pathDir=output.slice(0,output.lastIndexOf('/'));
  if(pathDir)await mkdir(pathDir,{recursive:true});
  await writeFile(output,JSON.stringify(report,null,2)+'\n');
  console.log('[web-vitals] '+JSON.stringify(report));
}finally{
  if(socket)socket.close();
  if(!closed)proc.kill('SIGTERM');
  await rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:100});
}

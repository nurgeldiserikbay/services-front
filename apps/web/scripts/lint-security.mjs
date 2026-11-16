import {readdirSync,readFileSync} from 'node:fs';
import {extname,join,relative} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../src/',import.meta.url));
const forbidden=[
  {name:'dynamic JavaScript execution',pattern:/\\b(?:eval|Function)\\s*\\(/g},
  {name:'unsafe HTML injection',pattern:/\\bdangerouslySetInnerHTML\\s*=/g},
  {name:'direct DOM HTML mutation',pattern:/\\.innerHTML\\s*=/g},
  {name:'client-side storage of credentials',pattern:/\\b(?:localStorage|sessionStorage)\\s*\\.\\s*setItem\\s*\\(/g},
  {name:'disabled TLS verification',pattern:/\\bNODE_TLS_REJECT_UNAUTHORIZED\\s*[:=]\\s*['"]?0\\b/g},
];
let scanned=0;
const failures=[];
function walk(dir){
  for(const item of readdirSync(dir,{withFileTypes:true})){
    const path=join(dir,item.name);
    if(item.isDirectory()){walk(path);continue;}
    if(!item.isFile()||!['.ts','.tsx','.js','.jsx','.mjs'].includes(extname(path)))continue;
    scanned++;
    const content=readFileSync(path,'utf8');
    for(const {name,pattern} of forbidden){
      pattern.lastIndex=0;
      for(const match of content.matchAll(pattern)){
        const line=content.slice(0,match.index).split('\\n').length;
        failures.push(`${relative(root,path)}:${line}: ${name}`);
      }
    }
  }
}
walk(root);
if(failures.length){console.error(failures.join('\\n'));process.exitCode=1;}
else console.log(`Security lint passed for ${scanned} source files`);

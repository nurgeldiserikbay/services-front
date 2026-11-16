import ts from 'typescript';
import {readdirSync,readFileSync} from 'node:fs';
import {extname,join,relative,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=process.argv[2]?resolve(process.argv[2]):fileURLToPath(new URL('../src/',import.meta.url));
const types=new Set(['.ts','.tsx','.js','.jsx','.mjs']);
const issues=[];
let scanned=0;

function visit(source,node,file){
  if(ts.isDebuggerStatement(node)){
    const line=source.getLineAndCharacterOfPosition(node.getStart(source)).line+1;
    issues.push(`${relative(root,file)}:${line}: debugger statement is not permitted`);
  }
  ts.forEachChild(node,child=>visit(source,child,file));
}
function walk(dir){
  for(const item of readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){
    const file=join(dir,item.name);
    if(item.isDirectory()){walk(file);continue;}
    if(!item.isFile()||!types.has(extname(item.name)))continue;
    scanned++;
    const sourceText=readFileSync(file,'utf8');
    const source=ts.createSourceFile(file,sourceText,ts.ScriptTarget.Latest,true,
      file.endsWith('x')?ts.ScriptKind.TSX:file.endsWith('.ts')?ts.ScriptKind.TS:ts.ScriptKind.JS);
    for(const diagnostic of source.parseDiagnostics){
      const line=source.getLineAndCharacterOfPosition(diagnostic.start??0).line+1;
      issues.push(`${relative(root,file)}:${line}: invalid JavaScript/TypeScript syntax`);
    }
    for(const match of sourceText.matchAll(/\/\/[^\n]*@ts-(?:ignore|nocheck)\b|\/\*[\s\S]*?@ts-(?:ignore|nocheck)\b[\s\S]*?\*\//g)){
      const line=sourceText.slice(0,match.index).split('\n').length;
      issues.push(`${relative(root,file)}:${line}: suppression directive is forbidden`);
    }
    visit(source,source,file);
  }
}
walk(root);
if(issues.length){console.error(issues.join('\n'));process.exitCode=1;}
else console.log(`TypeScript AST lint passed for ${scanned} source files`);

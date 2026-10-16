import {mkdir,readFile,writeFile,rename,open} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {canonicalize} from 'json-canonicalize';

const IMMUTABLE=['protocol','id','projectId','kind','revision','dependencies','payload','evidence'];
export const immutableContent=a=>Object.fromEntries(IMMUTABLE.map(k=>[k,a[k]]));
/** ADR-0001: only plain JSON may be digested. Without this, NaN/Infinity hash like null and undefined like a missing key. */
function assertJson(value,path='$',seen=new Set()){
 const bad=why=>{throw new TypeError(`Unsupported JSON value at ${path}: ${why}`);};
 if(value===null||typeof value==='string'||typeof value==='boolean')return;
 if(typeof value==='number'){if(!Number.isFinite(value))bad(String(value));return;}
 if(typeof value!=='object')bad(typeof value);
 if(seen.has(value))bad('cycle');
 const proto=Object.getPrototypeOf(value);
 if(!Array.isArray(value)&&proto!==Object.prototype&&proto!==null)bad(proto?.constructor?.name??'object');
 seen.add(value);
 if(Object.getOwnPropertySymbols(value).length)bad('symbol key');
 if(Array.isArray(value)){
  for(let i=0;i<value.length;i++){if(!(i in value))throw new TypeError(`Unsupported JSON value at ${path}[${i}]: array hole`);assertJson(value[i],`${path}[${i}]`,seen);}
  const extra=Object.keys(value).find(k=>!/^(0|[1-9]\d*)$/.test(k)||+k>=value.length);
  if(extra!==undefined)throw new TypeError(`Unsupported JSON value at ${path}.${extra}: extra array property`);
 }
 else for(const [k,v] of Object.entries(value))assertJson(v,`${path}.${k}`,seen);
 seen.delete(value);
}
export const digest=value=>{assertJson(value);return 'sha256:'+createHash('sha256').update(canonicalize(value),'utf8').digest('hex');};
export const artifactDigest=a=>digest(immutableContent(a));

/**
 * JSON.parse that rejects duplicate object keys (project owner decision): JSON.parse keeps the last
 * value, so `{"goal":"seen","goal":"hidden"}` would digest a value no reviewer saw. Scans keys only;
 * JSON.parse validates syntax and builds the value. Keys compare after unescaping ("a" == "\u0061").
 */
export function parseStrictJson(text){
 const value=JSON.parse(text);
 const stack=[];let i=0;
 while(i<text.length){
  const c=text[i];
  if(c==='{'){stack.push(new Set());i++;continue;}
  if(c==='['){stack.push(null);i++;continue;}
  if(c==='}'||c===']'){stack.pop();i++;continue;}
  if(c!=='"'){i++;continue;}
  let j=i+1;while(text[j]!=='"')j+=text[j]==='\\'?2:1;
  const str=JSON.parse(text.slice(i,j+1));
  let k=j+1;while(/\s/.test(text[k]??''))k++;
  const keys=stack.at(-1);
  if(text[k]===':'&&keys){if(keys.has(str))throw new SyntaxError('Duplicate JSON key: '+JSON.stringify(str));keys.add(str);}
  i=j+1;
 }
 return value;
}

export class ArtifactStore {
 constructor(directory){this.directory=directory;}
 path(id,revision){
  if(!/^[a-zA-Z0-9._-]+$/.test(id)||!Number.isSafeInteger(revision)||revision<1)throw new Error('Invalid artifact ID/revision');
  return join(this.directory,id,String(revision)+'.json');
 }
 async read(id,revision){return parseStrictJson(await readFile(this.path(id,revision),'utf8'));}
 async create(artifact){
  const target=this.path(artifact.id,artifact.revision);
  if(artifact.protocol!=='mip/0.7')throw new Error('Unsupported protocol');
  if(!['draft','in_review','approved'].includes(artifact.lifecycle))throw new Error('Only unlocked revisions can be created');
  await mkdir(join(this.directory,artifact.id),{recursive:true});
  const stream=await open(target,'wx');
  try{await stream.writeFile(JSON.stringify({...artifact,contentDigest:undefined},null,2)+'\n');}
  finally{await stream.close();}
  return {id:artifact.id,revision:artifact.revision,digest:artifactDigest(artifact)};
 }
 async revise(id,revision,mutate){
  const old=await this.read(id,revision);
  const next=structuredClone(old);
  mutate(next);
  next.revision=revision+1;
  next.lifecycle='draft';
  next.approvals=[];
  delete next.lock;
  return this.create(next);
 }
 async history(id){
  const {readdir}=await import('node:fs/promises');
  return (await readdir(join(this.directory,id))).filter(n=>/^\d+\.json$/.test(n)).map(n=>Number(n.slice(0,-5))).sort((a,b)=>a-b);
 }
}

// Shared by the example reviewer hosts: loopback Host/Origin allowlist, constant-time token compare, JSON helpers.
import {createHash,timingSafeEqual} from 'node:crypto';
import {parseStrictJson} from '../packages/artifacts/index.mjs';
import {ReviewRejected} from '../packages/prototype/review-evidence.mjs';

export const HOSTS=/^(127\.0\.0\.1|localhost)(:\d+)?$/;
const sha=v=>createHash('sha256').update(String(v)).digest();
export const sameToken=(a,b)=>timingSafeEqual(sha(a),sha(b));
export const json=(res,status,value)=>{res.writeHead(status,{'Content-Type':'application/json','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(value));};
/** Defense in depth (the Bearer token already blocks CSRF): a request that carries an Origin must come from a loopback page. */
export const originOk=req=>{const o=req.headers.origin;if(o===undefined)return true;try{return HOSTS.test(new URL(o).host);}catch{return false;}};
export async function body(req){
 const chunks=[];let size=0;
 for await(const chunk of req){size+=chunk.length;if(size>64*1024)throw new ReviewRejected('Request too large',413);chunks.push(chunk);}
 try{return parseStrictJson(Buffer.concat(chunks).toString('utf8'));}catch{throw new ReviewRejected('Malformed JSON');}
}

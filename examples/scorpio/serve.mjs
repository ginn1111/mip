import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(fileURLToPath(new URL('../../',import.meta.url)));
const media={'.html':'text/html; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.json':'application/json'};
const server=createServer(async(req,res)=>{
 try{
  const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  const path=resolve(root,'.'+(pathname==='/'?'/examples/scorpio/index.html':pathname));
  if(path!==root&&!path.startsWith(root+sep))throw new Error('Forbidden path');
  if(!media[extname(path)]){res.writeHead(415);res.end();return;}
  const body=await readFile(path);
  res.writeHead(200,{'Content-Type':media[extname(path)],'X-Content-Type-Options':'nosniff'});res.end(body);
 }catch{res.writeHead(404);res.end('Not found');}
});
const port=Number(process.env.PORT||4173);server.listen(port,'127.0.0.1',()=>console.log('MIP reviewer http://127.0.0.1:'+port));

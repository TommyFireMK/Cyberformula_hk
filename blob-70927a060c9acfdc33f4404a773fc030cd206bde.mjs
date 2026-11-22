// Game-only forwarding boundary. The local UrbanGround bridge is never forwarded.
import {createServer,request} from 'node:http';
import {createReadStream,statSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve,sep,extname} from 'node:path';

const root=fileURLToPath(new URL('./dist/',import.meta.url));
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.glb':'model/gltf-binary','.png':'image/png','.json':'application/json; charset=utf-8'};
export function createPublicGameServer({upstreamPort=8799}={}){
 const server=createServer((req,res)=>{
   const reply=(status,body,type='text/plain; charset=utf-8')=>res.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}).end(body);
   if(!['GET','HEAD'].includes(req.method)){reply(405,'Method not allowed');return;}
   try{
     let pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
     if(pathname==='/api/config'){
       const upstream=request({host:'127.0.0.1',port:upstreamPort,path:'/api/config',timeout:3000},response=>{
         let body='';response.setEncoding('utf8');response.on('data',chunk=>body+=chunk);response.on('end',()=>{try{const config=JSON.parse(body);if(!config.multiplayer)throw Error();reply(200,JSON.stringify({...config,publicOrigin:'',urbangroundBridge:false,sharing:'internet'}),'application/json; charset=utf-8');}catch{reply(503,'Game service unavailable');}});
       });
       upstream.on('timeout',()=>upstream.destroy());upstream.on('error',()=>reply(503,'Game service unavailable'));upstream.end();return;
     }
     if(pathname.toLowerCase().startsWith('/api/')||pathname.toLowerCase().includes('urban-reference')||pathname.toLowerCase()==='/public-url.json'){reply(404,'Not found');return;}
     if(pathname.endsWith('/'))pathname+='index.html';const file=resolve(root,'.'+pathname);
     if(!file.startsWith(root.endsWith(sep)?root:root+sep)||!mime[extname(file)]){reply(404,'Not found');return;}
     const stat=statSync(file);if(!stat.isFile()){reply(404,'Not found');return;}
     res.writeHead(200,{'Content-Type':mime[extname(file)],'Content-Length':stat.size,'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});if(req.method==='HEAD')res.end();else createReadStream(file).pipe(res);
   }catch{reply(404,'Not found');}
 });
 server.on('upgrade',(req,socket,head)=>{
   let path;try{path=new URL(req.url,'http://localhost').pathname;}catch{socket.destroy();return;}
   if(path!=='/race'){socket.end('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n');return;}
   const upstream=request({host:'127.0.0.1',port:upstreamPort,path:'/race',method:'GET',headers:req.headers,timeout:5000});
   upstream.on('upgrade',(response,peer,peerHead)=>{
     upstream.setTimeout(0);socket.setTimeout(0);peer.setTimeout(0);
     socket.write(`HTTP/1.1 ${response.statusCode} ${response.statusMessage}\r\n${response.rawHeaders.reduce((out,value,i,a)=>i%2?out:out+a[i]+': '+a[i+1]+'\r\n','')}\r\n`);
     if(peerHead.length)socket.write(peerHead);if(head.length)peer.write(head);
     socket.on('error',()=>peer.destroy());peer.on('error',()=>socket.destroy());socket.on('close',()=>peer.destroy());peer.on('close',()=>socket.destroy());socket.pipe(peer).pipe(socket);
   });
   upstream.on('response',response=>{socket.end(`HTTP/1.1 ${response.statusCode} Rejected\r\nConnection: close\r\n\r\n`);response.resume();});
   upstream.on('timeout',()=>upstream.destroy());upstream.on('error',()=>socket.destroy());socket.on('error',()=>upstream.destroy());upstream.end();
 });
 return server;
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1])){
 const port=Number(process.env.GSX_SHARE_PORT||8800),upstreamPort=Number(process.env.GSX_GAME_PORT||8799);
 createPublicGameServer({upstreamPort}).listen(port,'127.0.0.1',()=>console.log(`GSX game-only share gateway: http://127.0.0.1:${port} -> game ${upstreamPort}`));
}

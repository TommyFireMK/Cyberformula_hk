import {createServer} from 'node:http';
import {createReadStream,statSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve,sep,extname} from 'node:path';
import {attachMultiplayer} from './multiplayer.mjs';
import {handleUrbanGround} from './urbanground-bridge.mjs';
const root=fileURLToPath(new URL('./dist/',import.meta.url)),port=Number(process.env.GSX_GAME_PORT||8799);
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.glb':'model/gltf-binary','.png':'image/png','.json':'application/json; charset=utf-8'};
const publicOrigin=process.env.GSX_PUBLIC_ORIGIN||'';
const server=createServer(async(req,res)=>{try{
 if(await handleUrbanGround(req,res))return;
 if(!['GET','HEAD'].includes(req.method)){res.writeHead(405).end();return;}
 const url=new URL(req.url,'http://localhost');
 if(url.pathname==='/api/config'){res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'}).end(JSON.stringify({multiplayer:true,publicOrigin,maxPlayers:5,hongKongRoutes:6,urbangroundBridge:true}));return;}
 let pathname=decodeURIComponent(url.pathname);if(pathname.endsWith('/'))pathname+='index.html';const file=resolve(root,'.'+pathname);
 if(!file.startsWith(root.endsWith(sep)?root:root+sep)||!mime[extname(file)]){res.writeHead(403).end();return;}
 const stat=statSync(file);if(!stat.isFile()){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':mime[extname(file)],'Content-Length':stat.size,'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});if(req.method==='HEAD')res.end();else createReadStream(file).pipe(res);
 }catch{res.writeHead(404).end('Not found');}});
attachMultiplayer(server,{publicOrigin});
server.listen(port,'127.0.0.1',()=>console.log(`ASURADA GSX ready: http://127.0.0.1:${port}`));

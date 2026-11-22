import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {writeFileSync} from 'node:fs';
import {WebSocket} from './vendor/ws/wrapper.mjs';
import {attachMultiplayer} from './multiplayer.mjs';
import {createPublicGameServer} from './public-server.mjs';
import {parseRoomInvite,connectionScope} from './dist/online.js';
const clients=[],checks=[];let nativeHits=0;
const game=createServer((req,res)=>{if(req.url.startsWith('/api/urbanground/'))nativeHits++;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({multiplayer:true,urbangroundBridge:true}));});
const multiplayer=attachMultiplayer(game);
await new Promise(r=>game.listen(0,'127.0.0.1',r));const gamePort=game.address().port;
const gateway=createPublicGameServer({upstreamPort:gamePort});await new Promise(r=>gateway.listen(0,'127.0.0.1',r));const port=gateway.address().port,origin=`http://127.0.0.1:${port}`;
async function connect(at){const ws=new WebSocket(`ws://127.0.0.1:${at}/race`,{origin:`http://127.0.0.1:${at}`}),messages=[];clients.push(ws);ws.on('message',raw=>messages.push(JSON.parse(raw)));await new Promise((r,j)=>{ws.once('open',r);ws.once('error',j);});return{ws,messages,send:msg=>ws.send(JSON.stringify(msg))};}
async function wait(client,predicate){const end=Date.now()+5000;while(Date.now()<end){const value=client.messages.find(predicate);if(value)return value;await new Promise(r=>setTimeout(r,15));}throw Error('Missing forwarded room state');}
try{
 assert.equal((await fetch(origin+'/')).status,200);const config=await(await fetch(origin+'/api/config')).json();assert(config.multiplayer);assert.equal(config.urbangroundBridge,false);assert.equal(config.publicOrigin,'');checks.push('Game assets and multiplayer configuration served; native reference disabled');
 for(const path of ['/driver-aids.mjs','/guide-visual.js']){const response=await fetch(origin+path);assert.equal(response.status,200);assert(response.headers.get('content-type').includes('javascript'));}checks.push('Driving-aid modules served through game-only gateway');
 for(const path of ['/api/urbanground/state','/api/urbanground/frame','/api%2furbanground%2fstate','/urban-reference.html','/Urban-Reference.html','/urban-reference.js','/public-url.json','/Public-Url.json','/.env','/server.mjs','/vendor/ws/wrapper.mjs'])assert.equal((await fetch(origin+path)).status,404,path);
 assert.equal((await fetch(origin+'/api/urbanground/preview',{method:'POST',body:'{}'})).status,405);assert.equal(nativeHits,0);checks.push('Native API, screenshots, control page and server sources cannot cross sharing boundary');
 const a=await connect(gamePort);a.send({type:'join',room:'create',name:'Local host',course:'seaside'});const joined=await wait(a,m=>m.type==='joined');
 const b=await connect(port);b.send({type:'join',room:joined.room,name:'Shared guest'});await wait(b,m=>m.type==='joined');await wait(a,m=>m.type==='state'&&m.players.length===2);checks.push('Forwarded guest and local host join the same authoritative room');
 a.send({type:'ready',ready:true});b.send({type:'ready',ready:true});await wait(b,m=>m.type==='state'&&m.players.every(p=>p.ready));a.send({type:'start'});await wait(b,m=>m.type==='state'&&m.phase==='racing');const packet=await wait(a,m=>m.type==='state'&&m.elapsed>.1);const shared=await wait(b,m=>m.type==='state'&&m.elapsed===packet.elapsed);assert.deepEqual(shared.players,packet.players);checks.push('WebSocket forwarding preserves readiness, shared countdown and identical live snapshots');
 const code=joined.room;assert.deepEqual(parseRoomInvite(origin+'/?room='+code,origin),{code,target:null});assert.equal(parseRoomInvite('https://host.example/?room='+code,origin).target,'https://host.example/?room='+code);assert.throws(()=>parseRoomInvite('ftp://host.example/?room='+code,origin));assert.throws(()=>parseRoomInvite('https://name:password@host.example/?room='+code,origin));assert.equal(connectionScope('http://127.0.0.1:8799'),'local');assert.equal(connectionScope('http://[::1]:8799'),'local');assert.equal(connectionScope('http://192.168.1.3:8799'),'lan');assert.equal(connectionScope('https://host.example'),'internet');checks.push('Invitations preserve the host origin, validate schemes and distinguish local, LAN and internet links');
 writeFileSync('qa/public-gateway-results.json',JSON.stringify({status:'PASS',checks,scope:'Local protocol tests; external network verification is recorded separately.'},null,2));console.log(JSON.stringify({status:'PASS',checks},null,2));
}finally{clients.forEach(c=>c.terminate());multiplayer.close();await Promise.all([new Promise(r=>game.close(r)),new Promise(r=>gateway.close(r))]);}

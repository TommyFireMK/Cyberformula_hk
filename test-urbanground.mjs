import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {writeFileSync} from 'node:fs';
const calls=[],state={mode:'first_person',lat:22.2793,lon:114.1706,alt:4.4,tiles_progress:100,tiles_settled:true,idle:true};let active=false;
// Isolated protocol fixture. Live native rendering is verified separately in qa/urbanground-verification.json.
const native=createServer(async(req,res)=>{const path=new URL(req.url,'http://localhost').pathname;calls.push(path);
 if(path==='/screenshot'){res.writeHead(200,{'Content-Type':'image/png'}).end(Buffer.from([137,80,78,71,13,10,26,10]));return;}
 let value;if(path==='/health')value={ok:true,service:'UrbanGround'};else if(path==='/state')value=state;else if(path==='/task')value={active};else if(path==='/action'){let text='';for await(const chunk of req)text+=chunk;const body=JSON.parse(text);calls.push(body);if(body.action==='teleport'){state.lat=body.lat;state.lon=body.lon;state.alt=body.height;}if(body.action==='open_map')state.mode='map';if(body.action==='close_map')state.mode='first_person';value={ok:true,action:body.action,state};}else{res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify(value));});
await new Promise(r=>native.listen(0,'127.0.0.1',r));process.env.URBANGROUND_URL=`http://127.0.0.1:${native.address().port}`;
const {handleUrbanGround}=await import('./urbanground-bridge.mjs'),server=createServer(async(req,res)=>{if(!await handleUrbanGround(req,res))res.writeHead(404).end();});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
const post=(path,value,headers={})=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(value)}),checks=[];
try{
 const observation=await(await fetch(base+'/api/urbanground/state')).json();assert(observation.ready&&observation.health.service==='UrbanGround');checks.push('Health, pose, tile settling and active-task observation');
 let response=await post('/api/urbanground/preview',{course:'hk-island-mountain',index:29});assert.equal(response.status,200);const result=await response.json();assert.equal(result.state.lat,22.2195);assert.equal(result.state.lon,114.2125);assert.equal(result.state.mode,'map');assert(calls.indexOf('/health')<calls.indexOf('/state'));assert(calls.some(c=>typeof c==='string'&&c==='/screenshot'));checks.push('Supplied KML endpoint maps to exact WGS84 native preview');
 response=await post('/api/urbanground/preview',{course:'seaside',index:0});assert.equal(response.status,400);response=await post('/api/urbanground/preview',{course:'hk-island-mountain',index:999});assert.equal(response.status,400);checks.push('Reject unknown courses and out-of-range waypoints');
 active=true;const actionsBefore=calls.filter(c=>typeof c==='object').length;response=await post('/api/urbanground/preview',{course:'hk-island-mountain',index:0});assert.equal(response.status,503);assert.equal(calls.filter(c=>typeof c==='object').length,actionsBefore);active=false;checks.push('No teleport or environment mutation during native evaluation tasks');
 response=await post('/api/urbanground/zoom',{factor:.5});assert.equal(response.status,200);response=await post('/api/urbanground/zoom',{factor:100});assert.equal(response.status,400);checks.push('Bounded map zoom without arbitrary action forwarding');
 response=await post('/api/urbanground/preview',{course:'hk-island-mountain',index:0},{Origin:'https://unrelated.example'});assert.equal(response.status,403);checks.push('Cross-origin native mutations rejected');
 response=await fetch(base+'/api/urbanground/frame');assert.equal(response.headers.get('Content-Type'),'image/png');checks.push('Native screenshot stream is forwarded as an image');
 writeFileSync('qa/urbanground-protocol-results.json',JSON.stringify({status:'PASS_PROTOCOL_FIXTURES',liveNativeEvidence:'urbanground-verification.json',checks},null,2));console.log(JSON.stringify({status:'PASS',checks},null,2));
}finally{await new Promise(r=>server.close(r));await new Promise(r=>native.close(r));}

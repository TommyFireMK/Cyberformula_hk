import {randomBytes} from 'node:crypto';
import {WebSocketServer,WebSocket} from './vendor/ws/wrapper.mjs';
import {makeTrack,createCar,stepCar,resetCar,resolveCarContacts,clamp,raceFinished} from './dist/physics.mjs';
import {COURSES} from './dist/championship.mjs';
import {validVehicle,vehicleForSlot} from './dist/garage.mjs';
import {cleanControls} from './dist/driver-aids.mjs';
const neutral=()=>({throttle:0,brake:1,steer:0,boost:false,handbrake:false});
const id=()=>randomBytes(12).toString('hex');
const validCourse=value=>COURSES.some(c=>c.id===value);
export function attachMultiplayer(server,{publicOrigin='',now=()=>performance.now()}={}){
 const rooms=new Map(),limits=new Map(),wss=new WebSocketServer({noServer:true,maxPayload:2048,perMessageDeflate:false});
 function send(ws,data){if(ws.readyState===WebSocket.OPEN&&ws.bufferedAmount<128*1024)ws.send(JSON.stringify(data));}
 function error(ws,message){send(ws,{type:'error',message});}
 function snapshot(room){return{type:'state',id:room.id,host:room.host,course:room.course,laps:room.laps,phase:room.phase,elapsed:room.elapsed,count:room.count,revision:room.revision,players:room.players.map(p=>({id:p.id,name:p.name,slot:p.slot,vehicleId:p.vehicleId,ready:p.ready,connected:p.connected,finishTime:p.finishTime,penalty:p.penalty,car:p.car}))};}
 function broadcast(room){const packet=snapshot(room);for(const p of room.players)if(p.connected)send(p.ws,packet);}
 function initialise(room){room.track=makeTrack(900,room.course);room.laps=room.track.open?1:Math.max(2,room.laps);room.elapsed=0;room.count=4;room.revision++;
   room.players.forEach((p,i)=>{p.car=createCar(room.track,i*8,i%2?2.6:-2.6);p.finishTime=null;p.penalty=0;p.input=neutral();p.lastInput=now();p.lastReset=-100;});
 }
 function leave(ws){
   const room=ws.room;if(!room)return;ws.room=null;const p=room.players.find(p=>p.ws===ws);if(!p)return;
   p.connected=false;p.ready=false;p.input=neutral();
   if(room.phase==='lobby'||room.phase==='finished')room.players=room.players.filter(q=>q!==p);
   else{p.car.retired=true;p.car.speed=0;}
   if(room.host===p.id)room.host=room.players.find(q=>q.connected)?.id||null;
   if(!room.players.some(q=>q.connected))rooms.delete(room.id);else broadcast(room);
 }
 server.on('upgrade',(req,socket,head)=>{
   let url;try{url=new URL(req.url,'http://localhost');}catch{socket.destroy();return;}
   // Rooms are invitation-only, cross-site WebSocket handshakes are rejected.
   const origin=req.headers.origin;
   if(url.pathname!=='/race'||wss.clients.size>=128||(origin&&(()=>{try{return new URL(origin).host!==req.headers.host;}catch{return true;}})())){socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');socket.destroy();return;}
   wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws,req));
 });
 wss.on('connection',(ws,req)=>{
   ws.alive=true;ws.rateAt=now();ws.rate=0;ws.on('pong',()=>ws.alive=true);
   ws.on('error',()=>{});ws.on('close',()=>leave(ws));
   const joinTimeout=setTimeout(()=>{if(!ws.room)ws.close(1008,'Join a room first');},15000);joinTimeout.unref();
   ws.on('message',(raw,binary)=>{
     if(binary)return ws.close(1003,'JSON only');
     const t=now();if(t-ws.rateAt>1000){ws.rate=0;ws.rateAt=t;}if(++ws.rate>100)return ws.close(1008,'Too many messages');
     let msg;try{msg=JSON.parse(raw.toString());}catch{return error(ws,'無效的連線資料');}if(!msg||typeof msg!=='object')return;
     if(msg.type==='join'){
       if(ws.room)return error(ws,'你已在房間內');
       let room;
       if(msg.room==='create'){
         const ip=req.headers['cf-connecting-ip']||req.socket.remoteAddress,limit=limits.get(ip)||{time:t,count:0};if(t-limit.time>60000){limit.time=t;limit.count=0;}limits.set(ip,limit);
         if(++limit.count>10||rooms.size>=64)return error(ws,'房間已滿，請稍後再試');
         room={id:id(),host:null,course:validCourse(msg.course)?msg.course:'seaside',laps:2,phase:'lobby',elapsed:0,count:0,players:[],created:t,revision:0};room.track=makeTrack(900,room.course);if(room.track.open)room.laps=1;rooms.set(room.id,room);
       }else{room=typeof msg.room==='string'?rooms.get(msg.room):null;if(!room)return error(ws,'房間不存在或已關閉，請向房主索取新連結');}
       if(room.phase!=='lobby'&&room.phase!=='finished')return error(ws,'比賽進行中，請等候房主開下一場');
       if(room.players.length>=5)return error(ws,'房間已滿（最多五人）');
       const slots=new Set(room.players.map(p=>p.slot)),slot=[0,1,2,3,4].find(n=>!slots.has(n));
       const name=typeof msg.name==='string'?msg.name.replace(/[\x00-\x1f\x7f<>]/g,'').trim().slice(0,16):'';
       const p={id:id(),name:name||`車手 ${slot+1}`,slot,vehicleId:validVehicle(msg.vehicleId)?msg.vehicleId:vehicleForSlot(slot),ws,ready:false,connected:true,car:createCar(room.track,slot*8,slot%2?2.6:-2.6),input:neutral(),lastInput:t,finishTime:null,penalty:0,lastReset:-100};room.players.push(p);ws.room=room;room.host||=p.id;clearTimeout(joinTimeout);
       send(ws,{type:'joined',playerId:p.id,room:room.id,publicOrigin});broadcast(room);return;
     }
     const room=ws.room,p=room?.players.find(p=>p.ws===ws);if(!room||!p)return error(ws,'請先加入房間');
     if(msg.type==='input'){
       p.input=cleanControls(msg.input);p.lastInput=t;
     }else if(msg.type==='vehicle'){
       if(room.phase!=='lobby'&&room.phase!=='finished')return error(ws,'比賽開始後不能換車');
       if(!validVehicle(msg.vehicleId))return error(ws,'未知的參賽車款');
       p.vehicleId=msg.vehicleId;p.ready=false;broadcast(room);
     }else if(msg.type==='ready'&&(room.phase==='lobby'||room.phase==='finished')){p.ready=msg.ready===true;broadcast(room);
     }else if(msg.type==='settings'&&p.id===room.host&&(room.phase==='lobby'||room.phase==='finished')){
       if(validCourse(msg.course))room.course=msg.course;if([2,3,5].includes(msg.laps))room.laps=msg.laps;room.phase='lobby';room.players.forEach(q=>q.ready=false);initialise(room);broadcast(room);
     }else if(msg.type==='start'&&p.id===room.host&&(room.phase==='lobby'||room.phase==='finished')){
       room.players=room.players.filter(q=>q.connected);
       if(room.players.filter(q=>q.connected).length<2)return error(ws,'至少需要兩名真人車手');
       if(room.players.some(q=>!q.ready))return error(ws,'請等候所有車手按準備');
       initialise(room);room.phase='countdown';broadcast(room);
     }else if(msg.type==='reset'&&room.phase==='racing'&&!p.car.retired&&!p.finishTime&&room.elapsed-p.lastReset>=3){if(resetCar(p.car,room.track)){p.penalty+=3;p.lastReset=room.elapsed;}}
     else if(msg.type==='lobby'&&p.id===room.host){room.players=room.players.filter(q=>q.connected);room.phase='lobby';room.players.forEach(q=>q.ready=false);initialise(room);broadcast(room);}
     else if(msg.type==='ping')send(ws,{type:'pong',sent:msg.sent});
   });
 });
 let previous=now(),accumulator=0,frames=0;
 const timer=setInterval(()=>{
   const t=now();accumulator+=Math.min(.1,(t-previous)/1000);previous=t;
   while(accumulator>=1/120){accumulator-=1/120;
     for(const room of rooms.values()){
       if(room.phase==='countdown'){room.count-=1/120;if(room.count<=0){room.phase='racing';room.elapsed=0;}}
       else if(room.phase==='racing'){
         room.elapsed+=1/120;
         for(const p of room.players){if(!p.connected||p.finishTime!==null||p.car.retired)continue;stepCar(p.car,t-p.lastInput>400?neutral():p.input,room.track,1/120);}
         resolveCarContacts(room.players.filter(p=>p.finishTime===null).map(p=>p.car));
         for(const p of room.players)if(!p.car.retired&&p.finishTime===null&&raceFinished(p.car,room.track,room.laps)){p.finishTime=room.elapsed+p.penalty;p.car.finished=true;p.car.speed=0;p.car.boosting=false;}
         if(room.players.every(p=>p.finishTime!==null||p.car.retired)||room.elapsed>=900){room.phase='finished';room.players.forEach(p=>{p.ready=false;if(p.finishTime===null){p.car.retired=true;p.car.speed=0;}});}
       }
     }
   }
   if(++frames%3===0)for(const room of rooms.values())broadcast(room);
 },1000/60);timer.unref();
 const heartbeat=setInterval(()=>{for(const ws of wss.clients){if(!ws.alive){ws.terminate();continue;}ws.alive=false;ws.ping();}const t=now();for(const [key,r]of rooms)if(t-r.created>4*60*60*1000){r.players.forEach(p=>p.ws.close(1000,'Room expired'));rooms.delete(key);}for(const [key,l]of limits)if(t-l.time>60000)limits.delete(key);},15000);heartbeat.unref();
 return{rooms,wss,close(){clearInterval(timer);clearInterval(heartbeat);wss.clients.forEach(ws=>ws.terminate());wss.close();}};
}

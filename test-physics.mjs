import assert from 'node:assert/strict';
import {writeFileSync,mkdirSync} from 'node:fs';
import {makeTrack,createCar,stepCar,resetCar,botInput,CONFIG,formatTime,steeringFromKeys,applyImpact,performanceForDamage,resolveCarContacts,PIT,getPitState,pitLaneOffset,angleDelta,clamp} from './dist/physics.mjs';
const track=makeTrack(),dt=1/120,results=[];
function check(name,fn){const details=fn();results.push({name,status:'PASS',...details});}
check('Closed circuit and projection',()=>{const a=track.at(0),b=track.at(track.length);assert(Math.hypot(a.x-b.x,a.z-b.z)<1e-8);for(let s=0;s<track.length;s+=31){const p=track.at(s,3),n=track.nearest(p.x,p.z);assert(Math.abs(n.lateral-3)<.06);}return{lengthMetres:track.length};});
check('Player keys turn left/right in the driver frame at every heading',()=>{
 const cases=[];
 for(const heading of [0,Math.PI/2,Math.PI,Math.PI*1.5]){
   const origin=createCar(track,80,0);origin.yaw=heading;origin.speed=25;
   const straight={...origin};for(let i=0;i<.25/dt;i++)stepCar(straight,{steer:0},track,dt);
   for(const [key,side] of [['KeyA','left'],['ArrowLeft','left'],['KeyD','right'],['ArrowRight','right']]){
     const car={...origin},steer=steeringFromKeys(new Set([key]));
     for(let i=0;i<.25/dt;i++)stepCar(car,{steer},track,dt);
     // Camera-right is forward cross world-up when looking along local +Z.
     const displacementRight=(car.x-straight.x)*-Math.cos(heading)+(car.z-straight.z)*Math.sin(heading);
     assert(side==='left'?displacementRight<-.1:displacementRight>.1,`${key} at heading ${heading}: ${displacementRight}`);
     cases.push({key,heading,displacementRightMetres:displacementRight});
   }
 }
 for(const pair of [['KeyA','KeyD'],['ArrowLeft','ArrowRight'],['KeyA','ArrowRight']])assert.equal(steeringFromKeys(new Set(pair)),0);
 return{cases};
});
check('Throttle, braking, and boost consumption',()=>{
 const car=createCar(track,80,0);for(let i=0;i<2/dt;i++)stepCar(car,{throttle:1},track,dt);assert(car.speed>30);
 const speed=car.speed,energy=car.boost;for(let i=0;i<.4/dt;i++)stepCar(car,{throttle:1,boost:true},track,dt);assert(car.speed>speed);assert(car.boost<energy-8);
 for(let i=0;i<2/dt;i++)stepCar(car,{brake:1},track,dt);assert(car.speed<3);return{stoppedSpeed:car.speed,boostAfterUse:car.boost};
});
check('Wall containment and reset preserve race progress',()=>{const car=createCar(track);for(let i=0;i<20/dt;i++)stepCar(car,{throttle:1,steer:1},track,dt);assert(track.nearest(car.x,car.z).distance<10);const before=car.progress;resetCar(car,track);assert.equal(car.progress,before);assert.equal(car.speed,0);assert(track.nearest(car.x,car.z).distance<3);return{};});
check('Opponents can complete a three-lap race without teleporting',()=>{
 const cars=[0,1,2,3].map(i=>createCar(track,9+i*8,i%2?-2.7:2.7)),finished=[];
 for(let frame=0;frame<200/dt;frame++){
   cars.forEach((c,i)=>{if(finished[i])return;stepCar(c,botInput(c,track,i),track,dt);assert(Number.isFinite(c.progress));assert(track.nearest(c.x,c.z).distance<11);if(c.progress>=track.length*3)finished[i]={seconds:frame*dt,maxLap:Math.floor(c.progress/track.length)};});
   if(finished.filter(Boolean).length===4)break;
 }
 assert.equal(finished.filter(Boolean).length,4,JSON.stringify(cars.map(c=>({progress:c.progress,speed:c.speed}))));return{finishers:finished};
});
check('Reverse motion cannot create free lap credit',()=>{const car=createCar(track);car.yaw+=Math.PI;for(let i=0;i<2/dt;i++)stepCar(car,{throttle:1},track,dt);assert(car.progress<0);assert(Math.floor(Math.max(0,car.progress)/track.length)===0);return{progress:car.progress};});
check('Impact severity, contact cooldown and persistent damage',()=>{
 const mild=createCar(track),hard=createCar(track);mild.speed=50;hard.speed=50;
 const light=applyImpact(mild,8,'left'),heavy=applyImpact(hard,40,'front');assert(light>0&&light<heavy);assert(heavy>35);assert(hard.speed<50);
 const before=mild.damage;assert.equal(applyImpact(mild,8,'left'),0);assert.equal(mild.damage,before);
 assert(applyImpact(mild,55,'front')>0,'A much harder second impact must not be ignored by the cooldown');
 const retained=hard.damage;resetCar(hard,track);assert.equal(hard.damage,retained);assert.equal(hard.damageZones.front,retained);return{mildHit:light,heavyHit:heavy};
});
check('Damage reduces speed and acceleration and disables boost',()=>{
 const good=performanceForDamage(0),bad=performanceForDamage(70);assert(bad.speed<good.speed*.7);assert(bad.acceleration<good.acceleration*.7);assert.equal(bad.boostAvailable,false);
 const car=createCar(track,80,0);car.damage=70;car.speed=35;stepCar(car,{throttle:1,boost:true},track,dt);assert.equal(car.boosting,false);
 const straight={length:100000,at(s,offset=0){return{x:offset,z:s,tx:0,tz:1,nx:1,nz:0,yaw:0};},nearest(x,z){return{x:0,z,s:z,tx:0,tz:1,nx:1,nz:0,lateral:x,distance:Math.abs(x),yaw:0};}};
 const fresh=createCar(track),damaged=createCar(track);Object.assign(fresh,{x:0,z:0,yaw:0,lastS:0});Object.assign(damaged,{x:0,z:0,yaw:0,lastS:0,damage:55});
 for(let i=0;i<12/dt;i++){stepCar(fresh,{throttle:1},straight,dt);stepCar(damaged,{throttle:1},straight,dt);}
 assert(damaged.speed<fresh.speed*.75);return{healthyKmh:fresh.speed*3.6,damagedKmh:damaged.speed*3.6};
});
check('High-speed wall collision retires the car and reset cannot repair it',()=>{
 const p=track.at(80,8.7),car=createCar(track,80,8.7);car.yaw=Math.atan2(p.nx,p.nz);car.speed=105;
 stepCar(car,{throttle:1,boost:true},track,dt);assert.equal(car.damage,100);assert.equal(car.retired,true);assert.equal(resetCar(car,track),null);
 const pos=[car.x,car.z],progress=car.progress;for(let i=0;i<60;i++)stepCar(car,{throttle:1,steer:1,boost:true},track,dt);assert.equal(car.speed,0);assert.deepEqual([car.x,car.z],pos);assert.equal(car.progress,progress);
 assert.equal(createCar(track).damage,0,'Only a new race creates an undamaged car');return{damage:car.damage,retired:car.retired};
});
check('Car collisions use closing velocity and damage both vehicles',()=>{
 const a=createCar(track),b=createCar(track);Object.assign(a,{x:0,z:0,yaw:0,speed:55});Object.assign(b,{x:0,z:4.5,yaw:Math.PI,speed:55});
 const impacts=resolveCarContacts([a,b]);assert(impacts.length);assert(a.damage>70&&b.damage>70);assert(a.speed<55&&b.speed<55);
 const c=createCar(track),d=createCar(track);Object.assign(c,{x:0,z:0,yaw:0,speed:40});Object.assign(d,{x:2,z:0,yaw:0,speed:40});resolveCarContacts([c,d]);assert.equal(c.damage,0);assert.equal(d.damage,0,'Matched-speed touching must not create damage');
 return{headOnDamageA:a.damage,headOnDamageB:b.damage};
});
check('Pit repairs damage and zones over real service time, refills boost and locks the car',()=>{
 const car=createCar(track,PIT.bay,PIT.bayOffset);applyImpact(car,55,'front');car.boost=20;
 const damage=car.damage,progress=car.progress;stepCar(car,{brake:1},track,dt);assert(car.pitService);assert.equal(resetCar(car,track),null);
 for(let i=0;i<.8/dt;i++)stepCar(car,{throttle:1,steer:1,boost:true},track,dt);
 assert(car.damage>damage-.01,'Setup takes one second before repairs start');assert.equal(car.speed,0);
 let time=.8+dt;while(car.pitService&&time<15){stepCar(car,{throttle:1,steer:1,boost:true},track,dt);time+=dt;}
 assert.equal(car.damage,0);assert.equal(car.damageZones.front,0);assert.equal(car.boost,100);assert.equal(car.pitVisits,1);assert.equal(car.progress,progress);assert(time>5&&time<9);assert.equal(performanceForDamage(car.damage).speed,1);
 return{startDamage:damage,serviceSeconds:time,finalIntegrity:100,pitVisits:car.pitVisits};
});
check('Pit service requires the correct bay, direction and a stopped non-retired car',()=>{
 for(const [offset,yawOffset,speed] of [[PIT.laneOffset,0,0],[PIT.bayOffset,Math.PI/2,0],[PIT.bayOffset,0,5]]){
   const c=createCar(track,PIT.bay,offset);c.damage=40;c.damageZones.front=40;c.yaw+=yawOffset;c.speed=speed;
   stepCar(c,{brake:1},track,dt);assert.equal(c.pitService,null);assert.equal(c.damage,40);
 }
 const retired=createCar(track,PIT.bay,PIT.bayOffset);applyImpact(retired,110);for(let i=0;i<10/dt;i++)stepCar(retired,{brake:1},track,dt);assert.equal(retired.damage,100);assert.equal(retired.retired,true);assert.equal(retired.pitVisits,0);
 const lane=createCar(track,PIT.bay,PIT.laneOffset);lane.damage=40;for(let i=0;i<5/dt;i++)stepCar(lane,{brake:1},track,dt);assert.equal(lane.damage,40);return{};
});
check('Pit limiter disables boost and the divider prevents crossing through the garage wall',()=>{
 const car=createCar(track,90,PIT.laneOffset);car.speed=65;stepCar(car,{throttle:1,boost:true},track,dt);assert(car.inPit);assert(car.speed<=PIT.speedLimit+.01);assert.equal(car.boosting,false);
 const main=createCar(track,100,-9.4);main.yaw=track.at(100).yaw-Math.PI/2;main.speed=15;for(let i=0;i<.5/dt;i++)stepCar(main,{throttle:1},track,dt);assert(track.nearest(main.x,main.z).lateral>PIT.dividerOffset);return{limitKmh:PIT.speedLimit*3.6};
});
check('Drive from track into pit, stop for repair, and rejoin through the exit',()=>{
 const car=createCar(track,PIT.entry-6,-7);car.damage=50;car.damageZones.front=50;car.speed=9;
 const blend=t=>{t=clamp(t,0,1);return t*t*(3-2*t);};
 function laneAt(s,departing){
   if(departing){if(s<145)return PIT.bayOffset+(PIT.laneOffset-PIT.bayOffset)*blend((s-PIT.bay)/27);if(s<=PIT.exit)return pitLaneOffset(s);return -7+2*blend((s-PIT.exit)/20);}
   if(s<72)return pitLaneOffset(s);return PIT.laneOffset+(PIT.bayOffset-PIT.laneOffset)*blend((s-72)/24);
 }
 let departed=false,repaired=false,frames=0;
 for(;frames<90/dt;frames++){
   const targetS=car.lastS+5,p=track.at(targetS,laneAt(targetS,departed)),yaw=Math.atan2(p.x-car.x,p.z-car.z),remaining=PIT.bay-car.lastS;
   let desired=12;if(!departed&&remaining<15)desired=remaining>1?Math.min(10,Math.sqrt(Math.max(0,2*7*(remaining-1)))):0;
   stepCar(car,{steer:clamp(angleDelta(yaw,car.yaw)*3,-1,1),throttle:car.speed<desired?1:0,brake:car.speed>desired+.4?1:0},track,dt);
   if(car.pitVisits){departed=true;repaired=true;}
   if(departed&&car.lastS>PIT.exit+12)break;
 }
 assert(repaired,JSON.stringify({s:car.lastS,pit:getPitState(car,track),damage:car.damage}));assert(car.lastS>PIT.exit+12);assert.equal(car.damage,0);assert.equal(car.inPit,false);assert.equal(car.retired,false);
 return{elapsedSeconds:frames*dt,pitVisits:car.pitVisits,rejoinedAtMetres:car.lastS};
});
assert.equal(formatTime(61.234),'01:01.234');mkdirSync('qa',{recursive:true});writeFileSync('qa/physics-results.json',JSON.stringify({status:'PASS',fixedStep:dt,results},null,2));console.log(JSON.stringify({status:'PASS',results},null,2));

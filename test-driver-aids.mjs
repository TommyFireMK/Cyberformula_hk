import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {registerHooks} from 'node:module';
import {DriveInput,decodeGamepad,cleanControls,makeBrakeGuide,guideAdvice,LapTelemetry,cleanLapRecord} from './dist/driver-aids.mjs';
import {makeTrack,createCar,stepCar,botInput} from './dist/physics.mjs';
import {COURSES} from './dist/championship.mjs';
registerHooks({resolve(s,c,next){if(s==='three')return{url:new URL('./dist/vendor/three/three.module.js',import.meta.url).href,shortCircuit:true};return next(s,c);}});
const THREE=await import('three'),{buildGuideVisual}=await import('./dist/guide-visual.js');
const checks=[];
function check(name,fn){checks.push({name,status:'PASS',...fn()});}
check('Progressive keyboard input preserves direction, limits high-speed lock and returns to centre',()=>{
 const held=(key,speed)=>{const d=new DriveInput();for(let i=0;i<120;i++)d.step(new Set([key]),null,speed,1/120);return d;};
 const left=held('KeyA',70),right=held('KeyD',70),slow=held('KeyA',5);
 assert(left.value.steer>0&&right.value.steer<0);assert(Math.abs(left.value.steer)<slow.value.steer*.4);
 const highSpeedLock=left.value.steer;
 for(let i=0;i<60;i++)left.step(new Set(),null,70,1/120);assert.equal(left.value.steer,0);
 const direct=new DriveInput().step(new Set(['KeyD','KeyW']),null,70,1/120,{profile:'direct'});assert.equal(direct.steer,-1);assert.equal(direct.throttle,1);
 const pedals=new DriveInput();for(let i=0;i<60;i++)pedals.step(new Set(['KeyW']),null,20,1/120);
 const brake=pedals.step(new Set(['KeyW','KeyS','ShiftLeft']),null,20,1/120);assert.equal(brake.throttle,0);assert(brake.brake>0);assert(!brake.boost);
 pedals.reset();assert.deepEqual(pedals.value,{throttle:0,brake:0,steer:0,boost:false,handbrake:false});
 return {highSpeedLock,rightLock:right.value.steer,lowSpeedLock:slow.value.steer};
});
check('Standard gamepad analogue pedals, stick deadzone and malformed control packets',()=>{
 const pad={connected:true,mapping:'standard',axes:[.56],buttons:Array.from({length:10},()=>({value:0}))};pad.buttons[7].value=.37;pad.buttons[6].value=.18;
 const v=decodeGamepad(pad);assert.equal(v.throttle,.37);assert.equal(v.brake,.18);assert(v.steer<0);
 pad.axes[0]=.06;assert.equal(decodeGamepad(pad).steer,0);assert.equal(decodeGamepad({...pad,mapping:''}),null);assert.equal(decodeGamepad(null),null);
 assert.deepEqual(cleanControls({throttle:.37,brake:.18,steer:2,boost:'true'}),{throttle:.37,brake:.18,steer:1,boost:false,handbrake:false});
 for(const malformed of [null,'x',{}, {throttle:Infinity,brake:NaN,steer:'1'}])assert.deepEqual(cleanControls(malformed),{throttle:0,brake:0,steer:0,boost:false,handbrake:false});
 return {analogueThrottle:v.throttle,analogueBrake:v.brake,physicalHardwareTested:false};
});
check('Input ramps and existing fixed-step motion agree at 30, 60 and 144 render fps',()=>{
 const outcomes=[];
 const road={length:1e5,at(s,l=0){return{x:l,z:s,tx:0,tz:1,nx:1,nz:0,yaw:0};},nearest(x,z){return{x:0,z,s:z,tx:0,tz:1,nx:1,nz:0,yaw:0,lateral:x,distance:Math.abs(x)};}};
 for(const fps of [30,60,144]){
  const car=createCar(road,300,0),input=new DriveInput();let accumulator=0;
  for(let frame=0;frame<fps*3;frame++){accumulator+=1/fps;while(accumulator+1e-10>=1/120){stepCar(car,input.step(new Set(['KeyW']),null,car.speed,1/120),road,1/120);accumulator-=1/120;}}
  outcomes.push({fps,speed:car.speed,progress:car.progress});
 }
 for(const v of outcomes){assert(Math.abs(v.speed-outcomes[0].speed)<1e-8);assert(Math.abs(v.progress-outcomes[0].progress)<1e-8);}
 return {outcomes,simulationHz:120};
});
check('Braking envelope and arrows are finite and stay on all ten actual routes',()=>{
 const courses=[];
 for(const meta of COURSES){
  const track=makeTrack(900,meta.id),guide=makeBrakeGuide(track),root=new THREE.Group(),visual=buildGuideVisual(root,track,guide);
  for(let i=0;i<guide.count;i++){
   assert(Number.isFinite(guide.speeds[i])&&guide.speeds[i]>=10&&guide.speeds[i]<=84);
   assert(guide.speeds[i]**2<=guide.speeds[i+1]**2+2*guide.deceleration*guide.spacing+.001,'must brake before bend');
  }
  if(!track.open)assert.equal(guide.speeds[0],guide.speeds.at(-1));
  const car=createCar(track,track.open?track.length-42:track.length-20,0);car.speed=60;
  visual.update(car,true);assert(visual.mesh.count>0&&visual.mesh.count<=48);
  const matrix=new THREE.Matrix4(),pos=new THREE.Vector3();
  for(let i=0;i<visual.mesh.count;i++){
   visual.mesh.getMatrixAt(i,matrix);pos.setFromMatrixPosition(matrix);assert.equal(Math.round(pos.y*1000),85);assert(track.nearest(pos.x,pos.z).distance<.02);
   const sampleS=Math.floor(car.lastS/5)*5+8+i*5,target=guide.at(sampleS).speed,color=new THREE.Color();visual.mesh.getColorAt(i,color);
   const expected=new THREE.Color(car.speed>target+2.5?0xff6559:car.speed>target-3?0xffcc62:0x9bff77);
   assert(Math.max(Math.abs(color.r-expected.r),Math.abs(color.g-expected.g),Math.abs(color.b-expected.b))<1e-6,'arrow colour follows its own speed envelope');
  }
  if(track.open)assert(visual.mesh.count<10,'open finish must not wrap arrows to start');
  const advice=guideAdvice(guide,{...car,speed:112});assert(['brake','lift'].includes(advice.state));
  visual.update({...car,inPit:true},true);assert.equal(visual.mesh.visible,false);visual.update(car,false);assert.equal(visual.mesh.visible,false);
  courses.push({id:meta.id,samples:guide.count,arrows:visual.mesh.count});visual.mesh.geometry.dispose();visual.mesh.material.dispose();
 }
 return {courses,addedDrawCalls:1,maxArrows:48};
});
check('Lap crossings interpolate exact sector times and persist a clean same-course reference',()=>{
 const t=new LapTelemetry(900),laps=[];
 for(let p=7;p<=1806;p+=7)laps.push(...t.advance(p,p/30));
 assert.equal(laps.length,2);assert(Math.abs(laps[0].duration-30)<1e-8);assert(laps[0].sectors.every(s=>Math.abs(s-10)<1e-8));assert.equal(laps[0].valid,true);
 const stored=JSON.parse(JSON.stringify(t.best)),reloaded=new LapTelemetry(900,false,stored),snapshot=reloaded.snapshot(450,14);
 assert(Math.abs(snapshot.delta+1)<1e-8);assert.equal(new LapTelemetry(910,false,stored).best,null);
 assert(cleanLapRecord(stored,900,t.bins));assert.equal(cleanLapRecord({...stored,length:undefined},900,t.bins),null);
 assert.equal(cleanLapRecord({...stored,trace:[0,1,NaN]},900,t.bins),null);
 return {duration:stored.duration,sectors:stored.sectors,liveDelta:snapshot.delta};
});
check('A real physics-driven clean lap produces a reusable trace without synthetic crossings',()=>{
 const track=makeTrack(),car=createCar(track,0,0),timing=new LapTelemetry(track.length);car.speedModifier=.72;
 let time=0,lap;
 for(let i=0;i<240*120&&!lap;i++){
  const result=stepCar(car,botInput(car,track,0),track,1/120);time+=1/120;
  const reason=car.offroad?'超出賽道':car.collision>.18?'碰撞':result.wrongWay?'逆行':'';
  lap=timing.advance(car.progress,time,reason)[0];
 }
 assert(lap?.valid,JSON.stringify({progress:car.progress,lap:lap&&{valid:lap.valid,reason:lap.reason}}));assert(timing.best);assert(lap.sectors.every(t=>t>0));
 assert(Math.abs(lap.sectors.reduce((a,b)=>a+b,0)-lap.duration)<1e-8);
 const restored=new LapTelemetry(track.length,false,JSON.parse(JSON.stringify(timing.best)));assert(restored.best);
 return {lapSeconds:lap.duration,health:100-car.damage,sectors:lap.sectors,traceSamples:lap.trace.length};
});
check('Invalid laps, resets, reverse driving and open routes cannot pollute best laps',()=>{
 const t=new LapTelemetry(900);let completed=[];
 for(let p=10;p<=900;p+=10)completed.push(...t.advance(p,p/30,p===100?'碰撞':''));
 assert(!completed[0].valid);assert.equal(t.best,null);
 for(let p=910;p<=1800;p+=10)t.advance(p,p/30);assert(t.best);
 const best=t.best.duration;t.invalidate('回正');assert.equal(t.snapshot(1810,61).delta,null);
 for(let p=1810;p<=2700;p+=10)t.advance(p,p/45+20);assert.equal(t.best.duration,best);
 const reverse=new LapTelemetry(900);for(let i=1;i<=100;i++)reverse.advance(-i*.1,i/120);assert.equal(reverse.snapshot(-10,1).invalid,'逆行');
 const open=new LapTelemetry(900,true);let count=0;for(let p=20;p<=1200;p+=20)count+=open.advance(p,p/30).length;
 assert.equal(count,1);assert(Math.abs(open.best.duration-30)<1e-8);assert.equal(open.snapshot(1200,40).elapsed,30);
 return {invalidReason:completed[0].reason,openFinishes:count};
});
writeFileSync('qa/driver-aids-results.json',JSON.stringify({status:'PASS',checks},null,2));console.log(JSON.stringify({status:'PASS',checks},null,2));

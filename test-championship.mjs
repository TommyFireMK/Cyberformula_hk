import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {COURSES,STAGES,cleanSave,unlockedCount,evaluateStage,completeStage} from './dist/championship.mjs';
import {makeTrack,createCar,stepCar,botInput,PIT,getPitState,pitLaneOffset,angleDelta,clamp} from './dist/physics.mjs';
const result={finished:true,retired:false,laps:3,position:1,health:100,pitVisits:1,time:100};
let save=cleanSave(null);assert.equal(unlockedCount(save),1);
assert.equal(completeStage(save,1,result).passed,false,'Cannot skip a locked stage');
for(let i=0;i<STAGES.length;i++){
 assert.equal(completeStage(save,i,{...result,retired:true}).passed,false);
 assert.equal(evaluateStage(STAGES[i],{}).passed,false);
 if(STAGES[i].rank<5)assert.equal(evaluateStage(STAGES[i],{...result,position:5}).passed,false);
 if(STAGES[i].health)assert.equal(evaluateStage(STAGES[i],{...result,health:34}).passed,false);
 if(STAGES[i].pits)assert.equal(evaluateStage(STAGES[i],{...result,pitVisits:0}).passed,false);
 save=completeStage(save,i,result).save;assert.equal(save.cleared.length,i+1);assert.equal(unlockedCount(save),Math.min(6,i+2));
}
save=completeStage(save,0,{...result,time:120}).save;assert.equal(save.best.rookie.time,100);assert.equal(save.cleared.length,6);
assert.equal(cleanSave({version:1,cleared:['champion']}).cleared.length,0);assert.deepEqual(cleanSave(JSON.parse(JSON.stringify(save))),save);
const courseResults=[],dt=1/120;
for(const meta of COURSES.filter(c=>!c.open)){
 const track=makeTrack(900,meta.id);assert.equal(track.id,meta.id);assert(track.length>1500);assert(Math.hypot(track.points[0].x-track.points[900].x,track.points[0].z-track.points[900].z)<1e-6);
 // No non-adjacent centreline segments may cross.
 const cross=(a,b,c)=>(b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x);
 for(let i=0;i<899;i++)for(let j=i+3;j<900;j++){if(i===0&&j===899)continue;const a=track.points[i],b=track.points[i+1],c=track.points[j],d=track.points[j+1];assert(!(cross(a,b,c)*cross(a,b,d)<0&&cross(c,d,a)*cross(c,d,b)<0),meta.id+' self intersection');}
 const car=createCar(track,0,0);let frame=0;
 for(;frame<240/dt&&car.progress<track.length*3&&!car.retired;frame++)stepCar(car,botInput(car,track,0,[]),track,dt);
 assert(car.progress>=track.length*3,JSON.stringify({id:meta.id,progress:car.progress,damage:car.damage,retired:car.retired}));
 // Drive through the actual branch route and stop in the service bay on every track.
 const pit=createCar(track,PIT.entry-6,-7);pit.damage=50;pit.damageZones.front=50;pit.speed=9;const blend=t=>{t=clamp(t,0,1);return t*t*(3-2*t);};let departed=false;
 const laneAt=s=>departed?(s<145?PIT.bayOffset+(PIT.laneOffset-PIT.bayOffset)*blend((s-PIT.bay)/27):s<=PIT.exit?pitLaneOffset(s):-7+2*blend((s-PIT.exit)/20)):s<72?pitLaneOffset(s):PIT.laneOffset+(PIT.bayOffset-PIT.laneOffset)*blend((s-72)/24);
 for(let n=0;n<90/dt;n++){const s=pit.lastS+5,p=track.at(s,laneAt(s)),remaining=PIT.bay-pit.lastS;let desired=12;if(!departed&&remaining<15)desired=remaining>1?Math.min(10,Math.sqrt(Math.max(0,14*(remaining-1)))):0;stepCar(pit,{steer:clamp(angleDelta(Math.atan2(p.x-pit.x,p.z-pit.z),pit.yaw)*3,-1,1),throttle:pit.speed<desired?1:0,brake:pit.speed>desired+.4?1:0},track,dt);if(pit.pitVisits)departed=true;if(departed&&pit.lastS>PIT.exit+12)break;}
 assert(departed&&pit.lastS>PIT.exit+12&&!pit.inPit&&!pit.retired,meta.id+' PIT route');assert.equal(pit.damage,0);
 courseResults.push({id:meta.id,lengthMetres:Math.round(track.length),threeLapsSeconds:frame*dt,damage:car.damage,pitVisits:pit.pitVisits});
}
assert.equal(new Set(courseResults.map(c=>c.lengthMetres)).size,4);
const requiredTrack=makeTrack(),requiredPit=createCar(requiredTrack,PIT.bay,PIT.bayOffset);requiredPit.pitRequired=true;for(let i=0;i<4/dt;i++)stepCar(requiredPit,{brake:1},requiredTrack,dt);assert.equal(requiredPit.pitVisits,1,'Required PIT stage allows an undamaged car to complete its maintenance stop');assert.equal(requiredPit.pitRequired,false);
writeFileSync('qa/championship-results.json',JSON.stringify({status:'PASS',stages:6,progression:'pass, fail, DNF, locked stage, replay, corrupt save, persistence round trip',courses:courseResults},null,2));console.log(JSON.stringify({status:'PASS',courses:courseResults},null,2));

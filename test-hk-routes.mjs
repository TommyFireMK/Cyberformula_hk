import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {registerHooks} from 'node:module';
registerHooks({resolve(specifier,context,next){if(specifier==='three')return{url:new URL('./dist/vendor/three/three.module.js',import.meta.url).href,shortCircuit:true};if(specifier.startsWith('three/addons/'))return{url:new URL('./dist/vendor/three/jsm/'+specifier.slice(13),import.meta.url).href,shortCircuit:true};return next(specifier,context);}});
import {HK_COURSES,HK_SOURCE} from './dist/hk-routes.mjs';
import {geoToLocal,localToGeo} from './dist/geography.mjs';
import {makeTrack,createCar,stepCar,botInput,resolveCarContacts,raceFinished,PIT} from './dist/physics.mjs';
import {planHongKong} from './dist/hk-scenery-plan.mjs';
const {RIVALS,buildRival}=await import('./dist/vehicles.js'),specs=RIVALS.map(s=>({...s,...buildRival(s).dimensions}));
const raw=readFileSync('sources/hk_driving_routes.kml'),sourceLines=[...raw.toString('utf8').matchAll(/<LineString>[\s\S]*?<coordinates>([\s\S]*?)<\/coordinates>[\s\S]*?<\/LineString>/g)].map(m=>m[1].trim().split(/\s+/).map(t=>t.split(',').map(Number)));
assert.equal(createHash('sha256').update(raw).digest('hex'),HK_SOURCE.sha256);assert.equal(HK_COURSES.length,6);assert.equal(sourceLines.length,6);
const results=[],dt=1/120;
for(const [index,meta] of HK_COURSES.entries()){
 assert.deepEqual(meta.coordinates,sourceLines[index]);const track=makeTrack(900,meta.id),start=track.at(0),end=track.at(track.length);assert(track.open&&!track.closed);assert(Math.hypot(start.x-end.x,start.z-end.z)>1000);
 assert.equal(track.at(-100).s,0);assert.equal(track.at(track.length+200).s,track.length);assert.equal(raceFinished({progress:track.length/2},track,3),false);assert.equal(raceFinished({progress:track.length},track,3),true);
 const east=geoToLocal(meta.origin[0]+.001,meta.origin[1],meta.origin),north=geoToLocal(meta.origin[0],meta.origin[1]+.001,meta.origin);assert(east.x>100&&north.z<-100);
 let previous=-1,maxAnchorError=0;
 for(const [i,coordinate] of meta.coordinates.entries()){
   const p=geoToLocal(...coordinate.slice(0,2),meta.origin),q=track.nearest(p.x,p.z),inverse=localToGeo(p.x,p.z,meta.origin);maxAnchorError=Math.max(maxAnchorError,q.distance);assert(q.distance<.001);assert(q.s>previous);previous=q.s;assert(Math.abs(inverse.lon-coordinate[0])<1e-8&&Math.abs(inverse.lat-coordinate[1])<1e-8);
 }
 for(let i=1;i<track.points.length;i++){const a=track.points[i-1],b=track.points[i];assert(Object.values(b).every(Number.isFinite));assert(Math.hypot(b.x-a.x,b.z-a.z)<8);assert(a.tx*b.tx+a.tz*b.tz>.8);}
 // Independent full-segment projection checks the spatial culling used by long KML routes.
 let maxProjectionError=0;
 for(let s=0;s<=track.length;s+=Math.max(40,track.length/35))for(const offset of [-180,-20,0,20,180]){const p=track.at(s,offset),near=track.nearest(p.x,p.z);let best=Infinity;for(let i=0;i<track.points.length-1;i++){const a=track.points[i],b=track.points[i+1],dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz)));best=Math.min(best,Math.hypot(p.x-a.x-t*dx,p.z-a.z-t*dz));}maxProjectionError=Math.max(maxProjectionError,Math.abs(best-near.distance));assert(Math.abs(best-near.distance)<1e-6);}
 const cars=specs.map((s,i)=>Object.assign(createCar(track,9+i*8,i%2?-2.7:2.7),{length:s.length,width:s.width,speedModifier:s.speed,accelerationModifier:s.acceleration})),finish=[];
 for(let frame=0;frame<600/dt;frame++){
   for(const [i,car]of cars.entries()){if(car.finished||car.retired)continue;stepCar(car,botInput(car,track,i,cars.filter(c=>!c.finished)),track,dt);if(raceFinished(car,track,1)){car.finished=true;car.speed=0;finish[i]=frame*dt;}}
   resolveCarContacts(cars.filter(c=>!c.finished));if(finish.filter(Number.isFinite).length===4)break;
 }
 assert.equal(finish.filter(Number.isFinite).length,4,JSON.stringify({id:meta.id,cars:cars.map(c=>({progress:c.progress,damage:c.damage,retired:c.retired})),finish}));
 const pit=createCar(track,PIT.bay,PIT.bayOffset);pit.damage=50;pit.damageZones.front=50;pit.boost=20;for(let i=0;i<7/dt;i++)stepCar(pit,{brake:1},track,dt);assert.equal(pit.damage,0);assert.equal(pit.pitVisits,1);
 const plan=planHongKong(track,7);assert.deepEqual(planHongKong(track,7),plan);assert.notDeepEqual(planHongKong(track,19),plan);assert(plan.buildings.length>0);for(const b of plan.buildings)assert(track.nearest(b.x,b.z).distance>Math.hypot(b.width,b.depth)*.5+21.99);
 results.push({id:meta.id,name:meta.name,lengthMetres:track.length,sourcePoints:meta.sourcePoints,resampledPoints:track.points.length,maxAnchorErrorMetres:maxAnchorError,maxProjectionError,finishTimes:finish,damage:cars.map(c=>c.damage),pitVisits:pit.pitVisits,sceneryBuildings:plan.buildings.length});
}
writeFileSync('qa/hk-route-results.json',JSON.stringify({status:'PASS',source:HK_SOURCE,geometry:'WGS84 tangent-plane metres, centripetal interpolation through all source points; open endpoints',scene:'Procedural Hong Kong style approximation, separate from native UrbanGround real imagery',results},null,2));console.log(JSON.stringify({status:'PASS',results},null,2));

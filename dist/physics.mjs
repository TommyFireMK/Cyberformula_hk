import {courseById} from './championship.mjs';
import {sampleGeoRoute,buildSpatialLookup,localToGeo} from './geography.mjs';
export const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export const wrap=(x,l)=>(x%l+l)%l;
export const angleDelta=(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
export const CONFIG={laps:3,halfWidth:9,barrier:10.1,maxSpeed:84,boostSpeed:112,acceleration:21,braking:39,seed:7};
export const PIT={entry:35,split:68,bay:108,merge:145,exit:185,laneOffset:-18,bayOffset:-24,outerOffset:-29,dividerOffset:-10.8,speedLimit:60/3.6,repairRate:12};
const smooth=t=>{t=clamp(t,0,1);return t*t*(3-2*t);};
export function pitLaneOffset(s){
 if(s<PIT.split)return -7+(PIT.laneOffset+7)*smooth((s-PIT.entry)/(PIT.split-PIT.entry));
 if(s>PIT.merge)return PIT.laneOffset+(-7-PIT.laneOffset)*smooth((s-PIT.merge)/(PIT.exit-PIT.merge));
 return PIT.laneOffset;
}
export function pitOuterOffset(s){
 if(s<PIT.split)return PIT.dividerOffset+(PIT.outerOffset-PIT.dividerOffset)*smooth((s-PIT.entry)/(PIT.split-PIT.entry));
 if(s>PIT.merge)return PIT.outerOffset+(PIT.dividerOffset-PIT.outerOffset)*smooth((s-PIT.merge)/(PIT.exit-PIT.merge));
 return PIT.outerOffset;
}
export function getPitState(car,track,near=track.nearest(car.x,car.z)){
 const available=near.s>=PIT.entry&&near.s<=PIT.exit;
 const separated=available&&near.s>=PIT.split&&near.s<=PIT.merge;
 const inLane=available&&near.lateral<(separated?PIT.dividerOffset:-9.2);
 const bay=track.at(PIT.bay,PIT.bayOffset),dx=car.x-bay.x,dz=car.z-bay.z;
 const along=dx*bay.tx+dz*bay.tz,across=dx*bay.nx+dz*bay.nz;
 const inBay=Math.abs(along)<4.2&&Math.abs(across)<1.65;
 return{available,inLane,inBay,aligned:Math.abs(angleDelta(car.yaw,bay.yaw))<.45,stopped:car.speed<.8,along,across,bay,near};
}
function stepPitService(car,track,dt,pit){
 if(car.retired)return false;
 if(car.pitService&&(!pit.inBay||!pit.aligned||car.speed>=1)){car.pitService=null;}
 if(!pit.inBay)car.pitCompleted=false;
 if(!car.pitService&&pit.inBay&&pit.aligned&&pit.stopped&&!car.pitCompleted&&(car.damage>.1||car.boost<99||car.pitRequired)){
   car.pitService={elapsed:0,duration:1+Math.max(2,car.damage/PIT.repairRate),damage:car.damage,zones:{...car.damageZones},boost:car.boost};
 }
 if(!car.pitService)return false;
 const service=car.pitService;service.elapsed+=dt;
 const fraction=clamp((service.elapsed-1)/(service.duration-1),0,1);
 car.damage=service.damage*(1-fraction);for(const side of Object.keys(car.damageZones))car.damageZones[side]=service.zones[side]*(1-fraction);
 car.boost=service.boost+(100-service.boost)*fraction;car.speed=0;car.steer=0;car.boosting=false;car.collision=0;
 if(service.elapsed>=service.duration){car.damage=0;car.boost=100;for(const side of Object.keys(car.damageZones))car.damageZones[side]=0;car.pitService=null;car.pitCompleted=true;car.pitRequired=false;car.pitVisits++;car.impactCooldown=.3;}
 return true;
}
export function performanceForDamage(damage=0){
  if(damage>=100)return {speed:0,acceleration:0,steering:0,boostAvailable:false};
  const d=clamp(damage,0,100)/100;
  return {speed:1-.64*d**1.1,acceleration:1-.58*d,steering:1-.24*d,boostAvailable:damage<65};
}
export function applyImpact(car,closingSpeed,zone='front'){
  if(car.retired||closingSpeed<=3)return 0;
  if(car.impactCooldown>0&&closingSpeed<=car.lastImpact*1.5)return 0;
  const amount=Math.min(100,.48*(closingSpeed-3)**1.25);
  car.pitService=null;
  car.damage=clamp((car.damage||0)+amount,0,100);
  car.damageZones[zone]=clamp((car.damageZones[zone]||0)+amount,0,100);
  car.impactCooldown=.55;car.collision=.32;car.lastImpact=closingSpeed;car.lastImpactZone=zone;
  car.speed*=clamp(1-closingSpeed/145,.24,.98);
  if(car.damage>=100){car.retired=true;car.boosting=false;car.speed=0;}
  return amount;
}
// Cars face local +Z. Seen from behind, positive yaw turns left.
// Keep the player's key mapping separate from the AI's world-space yaw error.
export function steeringFromKeys(keys){
  return (keys.has('KeyA')||keys.has('ArrowLeft')?1:0)-(keys.has('KeyD')||keys.has('ArrowRight')?1:0);
}
export function random(seed=7){return()=>{seed=(Math.imul(1664525,seed)+1013904223)>>>0;return seed/4294967296;};}
function catmull(t,control){
  const n=control.length,u=wrap(t,1)*n,i=Math.floor(u),f=u-i;
  const p=[-1,0,1,2].map(k=>control[wrap(i+k,n)]);
  return [0,1].map(d=>.5*((2*p[1][d])+(-p[0][d]+p[2][d])*f+(2*p[0][d]-5*p[1][d]+4*p[2][d]-p[3][d])*f*f+(-p[0][d]+3*p[1][d]-3*p[2][d]+p[3][d])*f*f*f));
}
export function makeTrack(count=900,course='seaside'){
  const meta=courseById(course),points=[];let length=0,anchors=[];
  if(meta.open){const route=sampleGeoRoute(meta);points.push(...route.points);length=route.length;anchors=route.anchors;count=points.length-1;}
  else{
  for(let i=0;i<=count;i++){
    const [x,z]=catmull(i/count===1?0:i/count,meta.control);
    if(i)length+=Math.hypot(x-points[i-1].x,z-points[i-1].z);
    points.push({x,z,s:length});
  }
  for(let i=0;i<=count;i++){
    const a=points[wrap(i-1,count)],b=points[(i+1)%count],l=Math.hypot(b.x-a.x,b.z-a.z);
    Object.assign(points[i],{tx:(b.x-a.x)/l,tz:(b.z-a.z)/l,nx:(b.z-a.z)/l,nz:-(b.x-a.x)/l});
  }
  }
  const spatial=meta.open?buildSpatialLookup(points):null;
  function at(s,offset=0){
    s=meta.open?clamp(s,0,length):wrap(s,length);let lo=0,hi=count;
    while(hi-lo>1){let m=(lo+hi)>>1;if(points[m].s>s)hi=m;else lo=m;}
    const a=points[lo],b=points[hi],f=(s-a.s)/(b.s-a.s),tx=a.tx+(b.tx-a.tx)*f,tz=a.tz+(b.tz-a.tz)*f,l=Math.hypot(tx,tz),nx=tz/l,nz=-tx/l;
    return {x:a.x+(b.x-a.x)*f+nx*offset,z:a.z+(b.z-a.z)*f+nz*offset,tx:tx/l,tz:tz/l,nx,nz,s,yaw:Math.atan2(tx,tz)};
  }
  function nearest(x,z){
    let best=Infinity,out;
    function check(i){
      const a=points[i],b=points[i+1],dx=b.x-a.x,dz=b.z-a.z,l2=dx*dx+dz*dz,f=clamp(((x-a.x)*dx+(z-a.z)*dz)/l2,0,1),px=a.x+dx*f,pz=a.z+dz*f,d=(x-px)**2+(z-pz)**2;
      if(d<best){best=d;const l=Math.sqrt(l2);out={x:px,z:pz,s:a.s+(b.s-a.s)*f,tx:dx/l,tz:dz/l,nx:dz/l,nz:-dx/l,lateral:((x-px)*dz-(z-pz)*dx)/l};}
    }
    if(spatial){for(const i of spatial(x,z))check(i);}
    if(!spatial||best>4096)for(let i=0;i<count;i++)check(i);
    out.distance=Math.sqrt(best);out.yaw=Math.atan2(out.tx,out.tz);return out;
  }
  function curvature(s){const a=at(s-9),b=at(s+9);return Math.abs(angleDelta(b.yaw,a.yaw))/18;}
  return {points,length,anchors,at,nearest,curvature,halfWidth:CONFIG.halfWidth,meta,id:meta.id,theme:meta.theme,open:!!meta.open,closed:!meta.open,toGeo:meta.open?(x,z)=>localToGeo(x,z,meta.origin):null};
}
export const raceFinished=(car,track,laps=3)=>car.progress>=track.length*(track.open?1:laps)-(track.open ? .05 : 0);
export function createCar(track,s=0,lane=-2.2){const p=track.at(s,lane);return{x:p.x,z:p.z,yaw:p.yaw,speed:0,steer:0,boost:100,boosting:false,collision:0,impactCooldown:0,damage:0,damageZones:{front:0,rear:0,left:0,right:0},lastImpact:0,lastImpactZone:'front',retired:false,length:5.13,width:2.44,progress:s,lastS:track.open?clamp(s,0,track.length):wrap(s,track.length),offroad:false,lapTimes:[],lapStart:0,finished:false,inPit:false,pitService:null,pitCompleted:false,pitVisits:0};}
export function stepCar(car,input,track,dt){
  car.impactCooldown=Math.max(0,car.impactCooldown-dt);
  car.collision=Math.max(0,car.collision-dt);
  if(car.retired){car.speed=Math.max(0,car.speed-22*dt);car.boosting=false;return{near:track.nearest(car.x,car.z),wrongWay:false};}
  const before=track.nearest(car.x,car.z),pit=getPitState(car,track,before);car.inPit=pit.inLane;
  if(stepPitService(car,track,dt,pit))return{near:before,wrongWay:false,pit};
  const performance=performanceForDamage(car.damage);
  const throttle=clamp(input.throttle||0,0,1),brake=clamp(input.brake||0,0,1);
  car.steer+=(clamp(input.steer||0,-1,1)-car.steer)*(1-Math.exp(-8*dt));
  car.boosting=!!input.boost&&car.boost>1&&throttle>0&&car.speed>8&&!car.offroad&&performance.boostAvailable&&!car.inPit;
  car.boost=clamp(car.boost+(car.boosting?-25:9)*dt,0,100);
  const top=Math.min(car.inPit?PIT.speedLimit:Infinity,(car.boosting?CONFIG.boostSpeed:CONFIG.maxSpeed)*performance.speed*(car.speedModifier||1));
  const drive=throttle*CONFIG.acceleration*performance.acceleration*(car.accelerationModifier||1)*(1-.33*clamp(car.speed/top,0,1))+(car.boosting?18*performance.acceleration:0);
  const drag=1.2+.00165*car.speed*car.speed+(car.offroad?12:0)+(input.handbrake?15:0);
  car.speed=clamp(car.speed+(drive-drag-brake*CONFIG.braking)*dt,0,top);
  const turn=car.steer*(car.speed/(8+car.speed*.67))*(input.handbrake?1.35:1)*performance.steering;
  car.yaw+=turn*dt;
  car.x+=Math.sin(car.yaw)*car.speed*dt;car.z+=Math.cos(car.yaw)*car.speed*dt;
  let near=track.nearest(car.x,car.z);
  const currentPit=getPitState(car,track,near);car.inPit=currentPit.inLane;
  car.offroad=Math.abs(near.lateral)>CONFIG.halfWidth-.5&&!car.inPit;
  const radius=car.width*.5,parallel=currentPit.available&&near.s>=PIT.split&&near.s<=PIT.merge;
  let leftLimit=-CONFIG.barrier+radius,rightLimit=CONFIG.barrier-radius;
  if(currentPit.available){
    leftLimit=pitOuterOffset(near.s)+radius;
    if(parallel){if(near.lateral<PIT.dividerOffset)rightLimit=PIT.dividerOffset-radius;else leftLimit=PIT.dividerOffset+radius;}
  }
  if(near.lateral<leftLimit||near.lateral>rightLimit){
    const side=near.lateral<leftLimit?-1:1,offset=side<0?leftLimit+.02:rightLimit-.02;
    const normalSpeed=Math.abs(Math.sin(car.yaw-near.yaw))*car.speed;
    const zone=normalSpeed>car.speed*.78?'front':(side>0?'left':'right');
    applyImpact(car,normalSpeed,zone);
    car.x=near.x+near.nx*offset;car.z=near.z+near.nz*offset;
    car.speed*=Math.exp(-5*dt);car.yaw-=angleDelta(car.yaw,near.yaw)*(1-Math.exp(-5*dt));car.collision=.20;
    near=track.nearest(car.x,car.z);
  }
  let delta=near.s-car.lastS;
  if(!track.open){if(delta>track.length/2)delta-=track.length;if(delta<-track.length/2)delta+=track.length;}
  if(Math.abs(delta)<Math.max(20,car.speed*dt*3))car.progress+=delta;
  car.lastS=near.s;
  return {near,wrongWay:Math.abs(angleDelta(car.yaw,before.yaw))>Math.PI*.62};
}
export function resetCar(car,track){if(car.retired||car.pitService)return null;const p=track.at(car.lastS,-1.8);Object.assign(car,{x:p.x,z:p.z,yaw:p.yaw,speed:0,steer:0,collision:0,inPit:false,pitCompleted:false});return p;}
export function resolveCarContacts(cars){
  const impacts=[];
  for(let i=0;i<cars.length;i++)for(let j=i+1;j<cars.length;j++){
    const a=cars[i],b=cars[j];
    // Three spheres form a capsule, covering the whole car rather than its centre.
    const extentA=Math.max(0,a.length*.5-a.width*.5),extentB=Math.max(0,b.length*.5-b.width*.5),radius=(a.width+b.width)*.5;
    let hit=null;
    for(const sa of [-1,0,1])for(const sb of [-1,0,1]){
      const ax=a.x+Math.sin(a.yaw)*extentA*sa,az=a.z+Math.cos(a.yaw)*extentA*sa,bx=b.x+Math.sin(b.yaw)*extentB*sb,bz=b.z+Math.cos(b.yaw)*extentB*sb;
      const dx=ax-bx,dz=az-bz,d=Math.hypot(dx,dz);
      if(d<radius&&(!hit||d<hit.d))hit={dx,dz,d,sa,sb};
    }
    if(!hit)continue;
    let nx,nz;if(hit.d>.0001){nx=hit.dx/hit.d;nz=hit.dz/hit.d;}else{nx=Math.cos(a.yaw);nz=-Math.sin(a.yaw);}
    const va=a.retired?0:a.speed,vb=b.retired?0:b.speed;
    const closing=Math.max(0,-((Math.sin(a.yaw)*va-Math.sin(b.yaw)*vb)*nx+(Math.cos(a.yaw)*va-Math.cos(b.yaw)*vb)*nz));
    const zone=(car,x,z)=>{const f=Math.sin(car.yaw)*x+Math.cos(car.yaw)*z,l=Math.cos(car.yaw)*x-Math.sin(car.yaw)*z;return Math.abs(f)>Math.abs(l)?(f>0?'front':'rear'):(l>0?'left':'right');};
    const damageA=applyImpact(a,closing*.78,zone(a,-nx,-nz)),damageB=applyImpact(b,closing*.78,zone(b,nx,nz));
    const depth=radius-hit.d+.005,shareA=a.retired?(b.retired?.5:0):b.retired?1:.5,shareB=1-shareA;
    a.x+=nx*depth*shareA;a.z+=nz*depth*shareA;b.x-=nx*depth*shareB;b.z-=nz*depth*shareB;
    if(closing>0){if(!a.retired)a.speed*=clamp(1-closing/180,.35,.99);if(!b.retired)b.speed*=clamp(1-closing/180,.35,.99);a.collision=Math.max(a.collision,.12);b.collision=Math.max(b.collision,.12);}
    if(damageA||damageB)impacts.push({i,j,closingSpeed:closing,damageA,damageB});
  }
  return impacts;
}
export function botInput(car,track,index=0,traffic=[]){
  if(car.retired)return{};
  let lane=Math.sin(index*2.1)*2.8,paceLimit=Infinity;
  const here=track.at(car.lastS);
  for(const other of traffic){
    if(other===car)continue;const dx=other.x-car.x,dz=other.z-car.z;
    const ahead=dx*here.tx+dz*here.tz,side=dx*here.nx+dz*here.nz;
    if(ahead>0&&ahead<12+car.speed*.6&&Math.abs(side)<3.3){
      const obstacleLane=track.nearest(other.x,other.z).lateral;
      lane=clamp(obstacleLane+(obstacleLane>0?-4.5:4.5),-4.3,4.3);
      if(ahead<9)paceLimit=Math.max(8,other.speed-4);
    }
  }
  const look=track.at(car.lastS+12+car.speed*.36,lane);
  const target=Math.atan2(look.x-car.x,look.z-car.z),curv=track.curvature(car.lastS+car.speed*.5),desired=Math.min(paceLimit,clamp(Math.sqrt(16/Math.max(curv,.001)),track.meta.cornerSpeed,78+index*1.2)*performanceForDamage(car.damage).speed*(car.speedModifier||1));
  return {steer:clamp(angleDelta(target,car.yaw)*2.8,-1,1),throttle:car.speed<desired?1:.22,brake:car.speed>desired+5?.65:0,boost:curv<.004&&car.speed>55&&car.boost>55};
}
export function formatTime(seconds){if(!Number.isFinite(seconds))return'—';const ms=Math.max(0,Math.floor(seconds*1000));return`${String(Math.floor(ms/60000)).padStart(2,'0')}:${String(Math.floor(ms/1000)%60).padStart(2,'0')}.${String(ms%1000).padStart(3,'0')}`;}

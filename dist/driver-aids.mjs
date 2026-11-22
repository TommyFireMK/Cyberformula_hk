// Original arcade driving aids. All speeds are m/s and distances are metres.
import {clamp,wrap,angleDelta,CONFIG,performanceForDamage} from './physics.mjs';
const finite=(v,fallback=0)=>Number.isFinite(v)?v:fallback;
const approach=(a,b,amount)=>a+clamp(b-a,-amount,amount);
export function cleanControls(input={}){
 if(!input||typeof input!=='object')input={};
 return {throttle:clamp(finite(input.throttle),0,1),brake:clamp(finite(input.brake),0,1),steer:clamp(finite(input.steer),-1,1),boost:input.boost===true,handbrake:input.handbrake===true};
}
export function decodeGamepad(pad){
 if(!pad?.connected||pad.mapping!=='standard')return null;
 const button=i=>clamp(finite(pad.buttons?.[i]?.value),0,1),axis=clamp(finite(pad.axes?.[0]),-1,1),dead=.12;
 return {throttle:button(7),brake:button(6),steer:Math.abs(axis)<=dead?0:-Math.sign(axis)*((Math.abs(axis)-dead)/(1-dead))**1.35,boost:button(0)>.5,handbrake:button(1)>.5,camera:button(3)>.5,pause:button(9)>.5};
}
export class DriveInput{
 constructor(){this.reset();}
 reset(){this.value={throttle:0,brake:0,steer:0,boost:false,handbrake:false};}
 step(keys,pad,speed,dt,{profile='smooth',assist=false}={}){
  const has=(a,b)=>keys.has(a)||keys.has(b),keyboardSteer=(has('KeyA','ArrowLeft')?1:0)-(has('KeyD','ArrowRight')?1:0);
  const brake=Math.max(has('KeyS','ArrowDown')?1:0,pad?.brake||0);
  const throttle=brake>.02?0:Math.max(has('KeyW','ArrowUp')||assist?1:0,pad?.throttle||0);
  const usingPad=keyboardSteer===0&&Math.abs(pad?.steer||0)>0;
  const lock=profile==='direct'||usingPad?1:1/(1+Math.max(0,speed-12)*.045);
  const steer=usingPad?pad.steer:keyboardSteer*lock;
  const target={throttle,brake,steer,boost:brake<.02&&(keys.has('ShiftLeft')||keys.has('ShiftRight')||!!pad?.boost),handbrake:keys.has('Space')||!!pad?.handbrake};
  if(profile==='direct'){this.value=cleanControls(target);return this.value;}
  const v=this.value,t=clamp(finite(dt),0,.1);
  v.throttle=approach(v.throttle,target.throttle,(target.throttle>v.throttle?3.6:9)*t);
  v.brake=approach(v.brake,target.brake,7*t);
  // Pedals are mutually exclusive. Brake response is never delayed by throttle decay.
  if(target.brake>.02)v.throttle=0;
  const returning=target.steer===0||Math.sign(target.steer)!==Math.sign(v.steer);
  v.steer=approach(v.steer,target.steer,(returning?5.6:2.8)*t);
  v.boost=target.boost;v.handbrake=target.handbrake;return {...v};
 }
}

export function makeBrakeGuide(track){
 const count=Math.max(3,Math.ceil(track.length/4)),spacing=track.length/count;
 const corners=new Float64Array(count+1),speeds=new Float64Array(count+1);
 for(let i=0;i<=count;i++){
  const s=i*spacing,a=track.at(s-8),b=track.at(s+8);
  corners[i]=angleDelta(b.yaw,a.yaw)/16;
  speeds[i]=clamp(Math.sqrt(12/Math.max(Math.abs(corners[i]),.0001)),10,CONFIG.maxSpeed);
 }
 // Backward braking envelope: slow down BEFORE a bend. Two cyclic passes carry
 // constraints across start/finish; open routes never sample the opposite end.
 const deceleration=25;
 for(let pass=0;pass<(track.open?1:2);pass++){
  if(!track.open)speeds[count]=speeds[0];
  for(let i=count-1;i>=0;i--)speeds[i]=Math.min(speeds[i],Math.sqrt(speeds[i+1]**2+2*deceleration*spacing));
 }
 if(!track.open){speeds[count]=speeds[0];corners[count]=corners[0];}
 function at(s){
  s=track.open?clamp(s,0,track.length):wrap(s,track.length);
  const f=s/spacing,i=Math.min(count-1,Math.floor(f)),u=f-i;
  return {speed:speeds[i]+(speeds[i+1]-speeds[i])*u,curvature:corners[i]+(corners[i+1]-corners[i])*u};
 }
 return {track,count,spacing,speeds,corners,deceleration,at};
}
export function guideAdvice(guide,car){
 const factor=performanceForDamage(car.damage).speed,s=car.lastS;
 let corner=null;
 const horizon=clamp(45+car.speed*2,60,210);
 for(let d=8;d<=horizon;d+=8){
  if(guide.track.open&&s+d>guide.track.length)break;
  const sample=guide.at(s+d);
  if(Math.abs(sample.curvature)>.006&&(!corner||sample.speed<corner.speed))corner={...sample,distance:d,direction:sample.curvature>0?'左彎':'右彎'};
 }
 const target=guide.at(s).speed*factor,excess=car.speed-target;
 let state=excess>2.5?'brake':excess>-3?'lift':'go';
 let label={brake:'煞車',lift:'收油',go:'可加速'}[state];
 if(car.inPit){state='pit';label='PIT 限速';}
 if(car.pitService){state='pit';label='維修中';}
 if(car.offroad&&!car.inPit){state='lift';label='返回賽道';}
 if(car.retired){state='brake';label='已退賽';}
 return {state,label,target:car.inPit?60/3.6:target,corner};
}

export function cleanLapRecord(value,length,bins){
 if(!value||value.version!==1||!Number.isFinite(value.length)||Math.abs(value.length-length)>.01||!Number.isFinite(value.duration)||value.duration<=0||value.duration>18000||!Array.isArray(value.trace)||value.trace.length!==bins+1)return null;
 if(value.trace[0]!==0||Math.abs(value.trace.at(-1)-value.duration)>.001)return null;
 if(!value.trace.every((t,i)=>Number.isFinite(t)&&t>=0&&(i===0||t>=value.trace[i-1])))return null;
 const a=value.trace[bins/3],b=value.trace[2*bins/3];
 return {version:1,length,duration:value.duration,trace:[...value.trace],sectors:[a,b-a,value.duration-b]};
}
export class LapTelemetry{
 constructor(length,open=false,stored=null){
  this.length=length;this.open=open;this.bins=Math.ceil(clamp(Math.ceil(length/12),90,1599)/3)*3;
  this.best=cleanLapRecord(stored,length,this.bins);this.last=null;this.reset();
 }
 reset(){this.lap=0;this.start=0;this.previousProgress=0;this.previousTime=0;this.samples=[0];this.invalid='';this.splits=[];}
 invalidate(reason){this.invalid||=reason;}
 advance(progress,time,reason=''){
  if(!Number.isFinite(progress)||!Number.isFinite(time)||time<this.previousTime)return [];
  if(reason)this.invalidate(reason);
  const previous=this.previousProgress,previousTime=this.previousTime,delta=progress-previous,completed=[];
  if(delta<-.02)this.invalidate('逆行');
  if(delta>200)this.invalidate('位置跳動');
  if(delta>0){
   const maxProgress=this.open?Math.min(this.length,progress):progress;
   let boundary=this.lap*this.length+this.samples.length*this.length/this.bins;
   while(boundary<=maxProgress+.000001&&(!this.open||this.lap===0)){
    const t=previousTime+(time-previousTime)*clamp((boundary-previous)/delta,0,1),relative=t-this.start;
    this.samples.push(relative);
    const mark=this.samples.length-1;
    if(mark%(this.bins/3)===0){const prior=this.splits.reduce((a,b)=>a+b,0);this.splits.push(relative-prior);}
    if(mark===this.bins){
     const lap={version:1,length:this.length,duration:relative,trace:[...this.samples],sectors:[...this.splits]},valid=!this.invalid;
     const newBest=valid&&(!this.best||relative<this.best.duration);
     this.last={...lap,valid,reason:this.invalid,newBest};if(newBest)this.best=lap;
     completed.push(this.last);this.lap++;this.start=t;this.samples=[0];this.splits=[];this.invalid='';
    }
    boundary=this.lap*this.length+this.samples.length*this.length/this.bins;
   }
  }
  this.previousProgress=progress;this.previousTime=time;return completed;
 }
 snapshot(progress,time){
  if(this.open&&this.lap>0&&this.last)return {elapsed:this.last.duration,delta:this.last.valid&&this.best?this.last.duration-this.best.duration:null,invalid:this.last.reason,best:this.best?.duration??null,splits:[...this.last.sectors],sector:3,last:this.last};
  const distance=clamp(progress-this.lap*this.length,0,this.length),f=distance/this.length*this.bins,i=Math.min(this.bins-1,Math.floor(f));
  const reference=this.best?this.best.trace[i]+(this.best.trace[i+1]-this.best.trace[i])*(f-i):null;
  return {elapsed:Math.max(0,time-this.start),delta:reference===null||this.invalid||progress<0?null:time-this.start-reference,invalid:this.invalid,best:this.best?.duration??null,splits:[...this.splits],sector:Math.min(3,this.splits.length+1),last:this.last};
 }
}

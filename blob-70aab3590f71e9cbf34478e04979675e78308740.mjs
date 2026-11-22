import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {registerHooks} from 'node:module';
registerHooks({resolve(specifier,context,nextResolve){
 if(specifier==='three')return{url:new URL('./dist/vendor/three/three.module.js',import.meta.url).href,shortCircuit:true};
 if(specifier.startsWith('three/addons/'))return{url:new URL('./dist/vendor/three/jsm/'+specifier.slice(13),import.meta.url).href,shortCircuit:true};
 return nextResolve(specifier,context);
}});
const {RIVALS,buildRival}=await import('./dist/vehicles.js');
const {Box3,Vector3}=await import('./dist/vendor/three/three.module.js');
const results=[];
for(const spec of RIVALS){
 const car=buildRival(spec);car.root.updateMatrixWorld(true);const bounds=new Box3().setFromObject(car.visual),size=bounds.getSize(new Vector3());
 assert(size.x>2&&size.x<3.2&&size.y>.8&&size.y<1.8&&size.z>4.5&&size.z<6,JSON.stringify({id:spec.id,size}));
 let triangles=0,meshCount=0,nonFinite=0,zeroArea=0;
 car.visual.traverse(o=>{if(!o.isMesh)return;meshCount++;const p=o.geometry.attributes.position,n=o.geometry.attributes.normal;triangles+=p.count/3;for(const v of p.array)if(!Number.isFinite(v))nonFinite++;assert(n&&n.count===p.count);for(let i=0;i<p.count;i+=3){const a=new Vector3().fromBufferAttribute(p,i),b=new Vector3().fromBufferAttribute(p,i+1),c=new Vector3().fromBufferAttribute(p,i+2);if(b.sub(a).cross(c.sub(a)).lengthSq()<1e-18)zeroArea++;}});
 assert.equal(nonFinite,0);assert.equal(zeroArea,0);assert(meshCount<=10);results.push({id:spec.id,type:spec.type,sizeMetres:size.toArray(),triangles,meshCount});
}
assert.equal(new Set(results.map(r=>r.triangles)).size,4,'Each rival must have distinct geometry, not a recoloured clone');
const {makeTrack,createCar,stepCar,botInput,resolveCarContacts}=await import('./dist/physics.mjs');
const track=makeTrack(),cars=results.map((r,i)=>Object.assign(createCar(track,9+i*8,i%2?-2.7:2.7),{length:r.sizeMetres[2],width:r.sizeMetres[0],speedModifier:RIVALS[i].speed,accelerationModifier:RIVALS[i].acceleration})),finishTimes=[];
for(let frame=0;frame<180*120;frame++){
 cars.forEach((c,i)=>{if(c.retired)return;stepCar(c,botInput(c,track,i,cars),track,1/120);if(c.progress>=track.length*3&&!finishTimes[i])finishTimes[i]=frame/120;});
 resolveCarContacts(cars);if(finishTimes.filter(Boolean).length===4)break;
}
assert(finishTimes.filter(Boolean).length>=2,'Normal AI racing must remain viable after enabling damage');
const fleet=cars.map((c,i)=>({id:RIVALS[i].id,damage:c.damage,retired:c.retired,finishSeconds:finishTimes[i]??null}));
const {COURSES}=await import('./dist/championship.mjs'),courseFleets=[];
for(const course of COURSES.filter(c=>!c.open).slice(1)){
 const route=makeTrack(900,course.id),grid=RIVALS.map((s,i)=>Object.assign(createCar(route,9+i*8,i%2?-2.7:2.7),{length:results[i].sizeMetres[2],width:results[i].sizeMetres[0],speedModifier:s.speed,accelerationModifier:s.acceleration})),finish=[];
 for(let frame=0;frame<240*120;frame++){grid.forEach((c,i)=>{if(c.retired)return;stepCar(c,botInput(c,route,i,grid),route,1/120);if(c.progress>=route.length*3&&!finish[i])finish[i]=frame/120;});resolveCarContacts(grid);if(finish.filter(Boolean).length===4)break;}
 assert(finish.filter(Boolean).length>=2,course.id+' must support a normal AI fleet race');courseFleets.push({course:course.id,finishers:finish.filter(Boolean).length,cars:grid.map((c,i)=>({id:RIVALS[i].id,damage:c.damage,retired:c.retired,finishSeconds:finish[i]??null}))});
}
writeFileSync('qa/vehicle-results.json',JSON.stringify({status:'PASS',results,fleet,courseFleets},null,2));console.log(JSON.stringify({status:'PASS',results,fleet,courseFleets},null,2));

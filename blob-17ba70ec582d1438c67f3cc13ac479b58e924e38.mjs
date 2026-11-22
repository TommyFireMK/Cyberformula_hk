import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,next){if(s==='three')return{url:new URL('./dist/vendor/three/three.module.js',import.meta.url).href,shortCircuit:true};if(s.startsWith('three/addons/'))return{url:new URL('./dist/vendor/three/jsm/'+s.slice(13),import.meta.url).href,shortCircuit:true};return next(s,c);}});
const {GLTFLoader}=await import('three/addons/loaders/GLTFLoader.js');
const THREE=await import('three');
const {prepareFireSuperion,prepareRandoll,prepareSuperAsurada,cloneVehicle}=await import('./dist/garage-visuals.js');
const {VEHICLES,validVehicle}=await import('./dist/garage.mjs');
assert.equal(VEHICLES.length,8);assert.equal(new Set(VEHICLES.map(v=>v.id)).size,8);assert(validVehicle('fire-superion-gtr'));assert(validVehicle('randoll-01'));assert(validVehicle('super-asurada-01'));assert(!validVehicle('__proto__'));
const models=[];
for(const [id,prepare]of [['fire-superion-gtr',prepareFireSuperion],['randoll-01',prepareRandoll],['super-asurada-01',prepareSuperAsurada]]){
 const bytes=readFileSync(new URL('./dist/assets/'+id+'.glb',import.meta.url));
 const gltf=await new Promise((r,j)=>new GLTFLoader().parse(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'',r,j));
 const template=prepare(gltf.scene),bounds=new THREE.Box3().setFromObject(template.visual),size=bounds.getSize(new THREE.Vector3());
 assert(id==='super-asurada-01'?size.x>2.15&&size.x<2.25&&size.z>4.45&&size.z<4.6:size.x>2.2&&size.x<2.7&&size.z>5.4&&size.z<5.7,JSON.stringify({id,size}));
 assert(id==='super-asurada-01'?size.y>1.05&&size.y<1.3:id==='randoll-01'?size.y>1.95&&size.y<2.25:size.y>1.4&&size.y<1.7);assert(Math.abs(bounds.min.y)<.002);
 let triangles=0,nonFinite=0,zeroArea=0;
 template.visual.traverse(o=>{if(!o.isMesh)return;const g=o.geometry,a=g.attributes.position;for(const attr of Object.values(g.attributes))for(const v of attr.array)if(!Number.isFinite(v))nonFinite++;for(let i=0;i<a.count;i+=3){const p=new THREE.Vector3().fromBufferAttribute(a,i),q=new THREE.Vector3().fromBufferAttribute(a,i+1),r=new THREE.Vector3().fromBufferAttribute(a,i+2);if(q.sub(p).cross(r.sub(p)).lengthSq()<1e-16)zeroArea++;triangles++;}});
 assert.equal(nonFinite,0);assert.equal(zeroArea,0);assert(triangles<80000);
 const a=cloneVehicle(template),b=cloneVehicle(template);a.root.position.x=20;assert.equal(b.root.position.x,0);a.visual.children[0].material.color.setHex(0xffffff);assert.notEqual(a.visual.children[0].material,b.visual.children[0].material);assert.notEqual(a.visual.children[0].material,template.visual.children[0].material);assert.notEqual(a.flames[0],b.flames[0]);
 models.push({id,meshBytes:bytes.length,boundsMetres:size.toArray(),triangles,nonFinite,zeroArea,mergedMeshes:template.meshCount,removedExporterSeamTriangles:template.removedSeamTriangles,independentInstances:true});
}
const report={status:'PASS',catalogue:8,models,geometryScope:'Runtime mesh compilation; native CAD exports retain their original tessellation'};writeFileSync('qa/garage-results.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));

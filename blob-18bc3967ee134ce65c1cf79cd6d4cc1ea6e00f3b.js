import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

function removeSeamTriangles(geometry){
 const p=geometry.attributes.position,keep=[],a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3();
 for(let i=0;i<p.count;i+=3){a.fromBufferAttribute(p,i);b.fromBufferAttribute(p,i+1);c.fromBufferAttribute(p,i+2);if(b.sub(a).cross(c.sub(a)).lengthSq()>=1e-16)keep.push(i,i+1,i+2);}
 const clean=new THREE.BufferGeometry();for(const [name,source]of Object.entries(geometry.attributes)){const array=new source.array.constructor(keep.length*source.itemSize);for(let i=0;i<keep.length;i++)for(let k=0;k<source.itemSize;k++)array[i*source.itemSize+k]=source.array[keep[i]*source.itemSize+k];clean.setAttribute(name,new THREE.BufferAttribute(array,source.itemSize,source.normalized));}
 clean.computeBoundingSphere();return{geometry:clean,removed:(p.count-keep.length)/3};
}
export function prepareFireSuperion(source,{variant='fire'}={}){
 source.updateMatrixWorld(true);const root=new THREE.Group(),visual=new THREE.Group(),buckets=new Map();let removedSeamTriangles=0;root.add(visual);
 const role=variant==='super'?{'eff2f3':'Pearl ceramic white painted body','174fba':'Cobalt painted body','d82e38':'Red painted body accent','17212c':'Carbon chassis','13171c':'Slick rubber','a8b1bc':'Suspension metal','174d69':'Canopy glazing','d59b37':'Gold damper metal','ffd35a':'Headlamp','a32531':'Cockpit upholstery','080e15':'Intake black'}:variant==='randoll'?{'eef1f0':'Ceramic accent white painted body','d72f34':'Red painted body stripe','007266':'Green painted body stripe','a59cce':'Purple metallic fairing','c5c5e2':'Silver metallic wheel cover','18212b':'Carbon chassis','171b20':'Slick rubber','084756':'Canopy glazing','c88b3b':'Gold turbine metal','ffcc52':'Headlamp','090e15':'Intake black'}:{'d82f25':'Fire painted body','f39820':'Orange painted body','f2f4ef':'Ceramic accent','10151e':'Carbon chassis','182638':'Canopy glazing','171b20':'Slick rubber','bd3028':'Red wheel discs','8e959c':'Exhaust metal','f4c351':'Headlamp','ef372c':'Tail lamp','16508b':'Aoi blue badge'};
 source.traverse(o=>{if(!o.isMesh)return;const geometry=o.geometry.clone().applyMatrix4(o.matrixWorld);for(const k of Object.keys(geometry.attributes))if(!['position','normal','uv'].includes(k))geometry.deleteAttribute(k);if(!geometry.attributes.uv)geometry.setAttribute('uv',new THREE.BufferAttribute(new Float32Array(geometry.attributes.position.count*2),2));const key=o.material.uuid;if(!buckets.has(key))buckets.set(key,{material:o.material,geometries:[]});buckets.get(key).geometries.push(geometry.index?geometry.toNonIndexed():geometry);});
 for(const {material,geometries}of buckets.values()){
   const m=material.clone(),hex=m.color.getHexString();m.name=role[hex]||'CAD finish '+hex;m.roughness=/rubber/.test(m.name)?.95:/glazing/.test(m.name)?.18:.32;m.metalness=/metal|discs/.test(m.name)?.65:.2;m.side=THREE.FrontSide;m.envMapIntensity=.7;if(m.opacity<1)m.depthWrite=false;
   if(/lamp/i.test(m.name)){m.emissive.copy(m.color);m.emissiveIntensity=.45;}
   const g=mergeGeometries(geometries,false);if(!g)throw Error('Fire Superion mesh merge failed');const clean=removeSeamTriangles(g);removedSeamTriangles+=clean.removed;g.dispose();visual.add(new THREE.Mesh(clean.geometry,m));geometries.forEach(g=>g.dispose());
 }
 // The CAD source owns the six wheels and number 5; the logo is a small livery decal.
 if(variant==='fire'&&typeof document!=='undefined'){
   const canvas=document.createElement('canvas');canvas.width=512;canvas.height=160;const ctx=canvas.getContext('2d');ctx.clearRect(0,0,512,160);ctx.textAlign='center';ctx.font='italic bold 135px Arial';ctx.lineWidth=9;ctx.strokeStyle='#ffffff';ctx.strokeText('Aoi',256,130);ctx.fillStyle='#2471bc';ctx.fillText('Aoi',256,130);const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
   for(const s of [-1,1]){const decal=new THREE.Mesh(new THREE.PlaneGeometry(.61,.19),new THREE.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1}));decal.position.set(s*1.117,.512,-.07);decal.rotation.y=s*Math.PI/2;visual.add(decal);}
 }
 const shadow=new THREE.Mesh(new THREE.PlaneGeometry(variant==='super'?2.6:3.05,variant==='super'?4.8:6.0),new THREE.MeshBasicMaterial({color:0x030a12,transparent:true,opacity:.25,depthWrite:false}));shadow.rotation.x=-Math.PI/2;shadow.position.y=.035;root.add(shadow);
 const jets=variant==='super'?[[-.76,.825,-2.95],[.76,.825,-2.95]]:variant==='randoll'?[[0,.58,-3.45],[0,1.07,-3.45]]:[[0,.43,-3.45]];
 const flames=[];for(const [x,y,z]of jets){const f=new THREE.Mesh(new THREE.ConeGeometry(.21,1.65,12),new THREE.MeshBasicMaterial({color:0x68dfff,transparent:true,opacity:.82,depthWrite:false}));f.rotation.x=-Math.PI/2;f.position.set(x,y,z);f.visible=false;root.add(f);flames.push(f);}
 const size=new THREE.Box3().setFromObject(visual).getSize(new THREE.Vector3());
 return{root,visual,flames,forwardAxis:'z',meshCount:visual.children.length,removedSeamTriangles,dimensions:{width:size.x,length:size.z}};
}
export const prepareRandoll=source=>prepareFireSuperion(source,{variant:'randoll'});
export const prepareSuperAsurada=source=>prepareFireSuperion(source,{variant:'super'});

// Every human owns an instance, so two players may choose the same model without
// sharing transforms, material visibility or damage deformation.
export function cloneVehicle(template){
 const root=template.root.clone(true),visual=root.children[template.root.children.indexOf(template.visual)],flames=template.flames.map(f=>root.children[template.root.children.indexOf(f)]);
 root.traverse(o=>{if(o.material)o.material=Array.isArray(o.material)?o.material.map(m=>m.clone()):o.material.clone();});
 return{...template,root,visual,flames,damageFx:undefined};
}
export function disposeVehicle(vehicle,sharedGeometry){
 const geometries=new Set(),materials=new Set();vehicle.root.traverse(o=>{if(o.geometry&&!sharedGeometry.has(o.geometry))geometries.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material])if(m)materials.add(m);});
 geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());vehicle.damageFx?.smoke.material.map?.dispose();vehicle.root.removeFromParent();
}

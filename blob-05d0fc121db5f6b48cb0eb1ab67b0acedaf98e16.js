import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

// All rivals use metres, +Y up, +Z forward, with tyres resting at Y=0.
export const RIVALS=[
 {id:'volt-r1',name:'VOLT R1',type:'開輪方程式',color:0xe43c3e,length:4.9,width:2.46,number:'11',speed:1.01,acceleration:1.03},
 {id:'titan-gt',name:'TITAN GT',type:'GT 房跑',color:0x25a69c,length:4.8,width:2.42,number:'24',speed:.98,acceleration:.96},
 {id:'phantom-x',name:'PHANTOM X',type:'單噴口原型車',color:0x9662d6,length:5.15,width:2.5,number:'36',speed:1.025,acceleration:.99},
 {id:'comet-lmp',name:'COMET LMP',type:'雙翼耐力車',color:0xeab345,length:5.05,width:2.5,number:'48',speed:1,acceleration:1.01}
];

function shell(sections){
 const pos=[],uv=[],ix=[],ring=8;
 for(let s=0;s<sections.length;s++){
   const {z,w,b,t}=sections[s];
   const xy=[[w,b],[w,t-.055],[w*.72,t],[0,t+.025],[-w*.72,t],[-w,t-.055],[-w,b],[0,b]];
   xy.forEach(([x,y],i)=>{pos.push(x,y,z);uv.push(i/ring,z/5);});
   if(s<sections.length-1)for(let i=0;i<ring;i++){const a=s*ring+i,b=s*ring+(i+1)%ring,c=(s+1)*ring+(i+1)%ring,d=(s+1)*ring+i;ix.push(a,b,c,a,c,d);}
 }
 // Separate cap vertices keep end-cap normals independent of the body skin.
 for(const [s,reverse] of [[0,true],[sections.length-1,false]]){
   const start=pos.length/3,sec=sections[s];pos.push(0,(sec.b+sec.t)/2,sec.z);uv.push(.5,.5);
   for(let i=0;i<ring;i++){const j=(s*ring+i)*3;pos.push(pos[j],pos[j+1],pos[j+2]);uv.push(i/ring,.5);}
   for(let i=0;i<ring;i++){const a=start,b=start+1+i,c=start+1+(i+1)%ring;ix.push(...(reverse?[a,c,b]:[a,b,c]));}
 }
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(ix);g.computeVertexNormals();return g;
}
export function buildRival(spec){
 const root=new THREE.Group(),visual=new THREE.Group();root.name=spec.name;root.add(visual);
 const materials={
   body:new THREE.MeshStandardMaterial({name:spec.id+' painted body',color:spec.color,roughness:.28,metalness:.38}),
   white:new THREE.MeshStandardMaterial({name:'Ceramic accent',color:0xe1edf2,roughness:.32,metalness:.15}),
   dark:new THREE.MeshStandardMaterial({name:'Carbon chassis',color:0x101b27,roughness:.55,metalness:.22}),
   glass:new THREE.MeshStandardMaterial({name:'Canopy glazing',color:0x153d55,roughness:.19,metalness:.35}),
   rubber:new THREE.MeshStandardMaterial({name:'Rival slick rubber',color:0x11151a,roughness:.95}),
   metal:new THREE.MeshStandardMaterial({name:'Forged wheels',color:spec.id==='comet-lmp'?0xeac47b:0xa9b8c8,metalness:.8,roughness:.27}),
   red:new THREE.MeshStandardMaterial({name:'Rear lamps',color:0xff303b,emissive:0xec1531,emissiveIntensity:2}),
   light:new THREE.MeshStandardMaterial({name:'Headlamp LED',color:0xbff8ff,emissive:0x71d9ff,emissiveIntensity:1.7})
 };
 const parts=[];
 const add=(g,material,pos=[0,0,0],rot=[0,0,0],role='body')=>{const o=new THREE.Mesh(g,materials[material]);o.position.set(...pos);o.rotation.set(...rot);o.name=role;parts.push(o);return o;};
 const box=(p,d,m='body',r=[0,0,0],role)=>add(new THREE.BoxGeometry(...d),m,p,r,role);
 const loft=(data,m='body',x=0)=>add(shell(data.map(([z,w,b,t])=>({z,w,b,t}))),m,[x,0,0]);
 const cylinder=(p,r,d,m,rotation=[0,0,Math.PI/2],n=32)=>add(new THREE.CylinderGeometry(r,r,d,n),m,p,rotation);
 const wing=(z,width,height,depth=.45,m='body')=>{box([0,height,z],[width,.075,depth],m);for(const s of [-1,1]){box([s*.52,height-.22,z],[.06,.44,.14],'dark');box([s*(width/2-.03),height+.025,z],[.06,.24,depth+.1],m);}};
 box([0,.20,0],[spec.width-.3,.10,spec.length-.25],'dark');
 const axle=spec.id==='volt-r1'?1.43:1.40;
 for(const z of [-axle,axle])for(const s of [-1,1]){
   const x=s*(spec.width/2-.13),outer=x+s*.16;
   cylinder([x,.39,z],.39,.32,'rubber');
   cylinder([outer,.39,z],.265,.023,'dark');
   const ring=new THREE.TorusGeometry(.255,.018,8,32);add(ring,'metal',[outer+s*.013,.39,z],[0,Math.PI/2,0],'wheel rim');
   const spokes=spec.id==='phantom-x'?3:spec.id==='titan-gt'?6:5;
   for(let i=0;i<spokes;i++){const a=i/spokes*Math.PI*2;box([outer+s*.023,.39+Math.sin(a)*.12,z+Math.cos(a)*.12],[.035,.045,.25],'metal',[-a,0,0],'wheel spoke');}
   cylinder([outer+s*.027,.39,z],.062,.035,'metal');
   if(spec.id==='volt-r1')for(const dz of [-.25,.25]){const a=new THREE.Vector3(s*.3,.34,z+dz),b=new THREE.Vector3(x,.39,z),delta=b.clone().sub(a);const arm=add(new THREE.CylinderGeometry(.018,.018,delta.length(),8),'dark',a.clone().add(b).multiplyScalar(.5).toArray());arm.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize());}
 }
 if(spec.id==='volt-r1'){
   loft([[-2.15,.47,.25,.60],[-.7,.43,.26,.72],[.25,.31,.25,.62],[1.75,.16,.24,.39],[2.40,.12,.22,.30]]);
   for(const s of [-1,1]){loft([[-1.55,.25,.25,.53],[-.35,.31,.25,.57],[.52,.24,.25,.45]],'body',s*.68);box([s*.73,.59,-.5],[.41,.02,.55],'white');}
   box([0,.70,-.35],[.48,.14,.66],'dark');add(new THREE.SphereGeometry(.19,20,12),'white',[0,.90,-.30]);
   add(new THREE.TorusGeometry(.31,.027,8,24,Math.PI*1.5),'dark',[0,.93,-.30],[Math.PI/2,0,Math.PI*.25],'cockpit halo');
   wing(-1.95,2.38,1.12,.55);wing(2.13,2.30,.28,.47,'white');
   cylinder([0,.54,-2.29],.12,.22,'dark',[Math.PI/2,0,0]);box([0,.64,-2.26],[.22,.045,.03],'red');
 }else if(spec.id==='titan-gt'){
   loft([[-2.31,1.02,.25,.65],[-1.55,1.06,.25,.76],[-.5,.98,.26,.73],[.8,1.00,.24,.68],[1.6,1.04,.24,.68],[2.32,.95,.26,.53]]);
   loft([[-1.15,.68,.69,.84],[-.7,.67,.69,1.25],[.22,.64,.69,1.27],[.95,.72,.66,.88]],'glass');
   box([0,1.29,-.24],[1.33,.045,.82],'body');
   for(const s of [-1,1]){box([s*1.07,.46,0],[.03,.18,1.35],'white');box([s*.72,.58,2.327],[.53,.07,.035],'light');box([s*.75,.65,-2.34],[.55,.09,.04],'red');}
   wing(-1.96,2.43,1.22,.44,'dark');box([0,.36,2.36],[1.65,.18,.04],'dark');box([0,.40,-2.35],[1.65,.22,.07],'dark');
   for(const s of [-1,1])cylinder([s*.73,.32,-2.42],.075,.14,'metal',[Math.PI/2,0,0]);
 }else if(spec.id==='phantom-x'){
   loft([[-2.45,.83,.23,.55],[-1.35,1.02,.23,.70],[-.3,.72,.25,.67],[.8,.70,.24,.59],[1.65,.62,.21,.42],[2.55,.09,.20,.27]]);
   loft([[-.8,.30,.65,.79],[-.33,.46,.64,1.02],[.45,.39,.60,.98],[1.13,.14,.52,.59]],'glass');
   for(const s of [-1,1]){
     const fin=box([s*.88,.63,-1.7],[.9,.09,.9],'body',[0,s*.37,s*.12]);
     box([s*1.01,.45,.28],[.29,.04,2.7],'white');box([s*.70,.49,1.8],[.34,.035,.3],'light',[0,s*.4,0]);box([s*.65,.57,-2.44],[.47,.045,.04],'red');
   }
   box([0,.95,-1.3],[.065,.75,1.30],'dark');
   cylinder([0,.56,-2.46],.26,.20,'metal',[Math.PI/2,0,0]);cylinder([0,.56,-2.58],.21,.03,'dark',[Math.PI/2,0,0]);
   wing(-2.12,2.30,1.18,.34);box([0,.30,2.07],[2.0,.055,.35],'dark');
 }else{
   loft([[-2.38,.75,.24,.54],[-1.15,.77,.24,.63],[.6,.63,.24,.60],[1.65,.60,.22,.42],[2.42,.38,.20,.31]],'white');
   for(const s of [-1,1]){
     loft([[-2.40,.34,.27,.54],[-1.4,.39,.27,.85],[-.45,.25,.26,.61],[.55,.26,.25,.56],[1.4,.39,.25,.85],[2.40,.29,.22,.39]],'body',s*.85);
     box([s*.86,.53,2.32],[.18,.20,.025],'light');box([s*.86,.60,-2.40],[.24,.14,.035],'red');
     box([s*.53,.98,-1.38],[.06,.72,1.30],'body');
   }
   loft([[-.84,.40,.61,.75],[-.38,.44,.61,1.14],[.40,.35,.58,1.09],[1.07,.17,.51,.57]],'glass');
   box([0,1.15,-.03],[.07,.06,.75],'white');wing(-2.1,2.46,1.35,.50,'body');
   box([0,.31,-2.43],[1.50,.11,.28],'dark');for(const x of [-.48,0,.48])box([x,.38,-2.43],[.045,.25,.34],'dark');
 }
 // Compile only identical material roles; each body plan keeps unique topology.
 const buckets=new Map();for(const part of parts){part.updateMatrix();const g=part.geometry.clone().applyMatrix4(part.matrix);if(g.attributes.position.array.some(v=>!Number.isFinite(v)))throw Error(`Invalid rival geometry: ${spec.id} / ${part.name} / ${part.geometry.type}`);if(!buckets.has(part.material))buckets.set(part.material,[]);buckets.get(part.material).push(g.toNonIndexed());part.geometry.dispose();}
 for(const [mat,geos] of buckets){const merged=mergeGeometries(geos,false);if(!merged)throw Error('Rival geometry compilation failed');const mesh=new THREE.Mesh(merged,mat);mesh.name=mat.name;visual.add(mesh);for(const g of geos)g.dispose();}
 if(typeof document!=='undefined'){
   const c=document.createElement('canvas');c.width=256;c.height=128;const ctx=c.getContext('2d');ctx.fillStyle='#eff7f9';ctx.fillRect(0,0,256,128);ctx.fillStyle='#101b27';ctx.font='italic 900 85px Arial';ctx.textAlign='center';ctx.fillText(spec.number,128,100);const tx=new THREE.CanvasTexture(c);tx.colorSpace=THREE.SRGBColorSpace;
   const number=new THREE.Mesh(new THREE.PlaneGeometry(.46,.23),new THREE.MeshBasicMaterial({map:tx}));number.rotation.x=-Math.PI/2;number.position.set(0,spec.id==='volt-r1'?.51:.71,1.03);visual.add(number);
 }
 const shadow=new THREE.Mesh(new THREE.PlaneGeometry(spec.width*1.25,spec.length*1.10),new THREE.MeshBasicMaterial({color:0x030a12,transparent:true,opacity:.22,depthWrite:false}));shadow.rotation.x=-Math.PI/2;shadow.position.y=.041;root.add(shadow);
 const flames=[];const jets=spec.id==='phantom-x'?[0]:[-.48,.48];for(const x of jets){const flame=new THREE.Mesh(new THREE.ConeGeometry(.14,1.25,10),new THREE.MeshBasicMaterial({color:0x68e9ff,transparent:true,opacity:.8,depthWrite:false}));flame.rotation.x=-Math.PI/2;flame.position.set(x,.48,-spec.length/2-.44);flame.visible=false;root.add(flame);flames.push(flame);}
 visual.updateMatrixWorld(true);const size=new THREE.Box3().setFromObject(visual).getSize(new THREE.Vector3());
 return{root,visual,flames,meshCount:visual.children.length,spec,dimensions:{width:size.x,length:size.z},forwardAxis:'z'};
}

export function attachDamageEffects(vehicle){
 const g=new THREE.BufferGeometry(),positions=new Float32Array(36*3);g.setAttribute('position',new THREE.BufferAttribute(positions,3));
 const c=document.createElement('canvas');c.width=32;c.height=32;const ctx=c.getContext('2d'),gradient=ctx.createRadialGradient(16,16,1,16,16,16);gradient.addColorStop(0,'rgba(120,130,142,.68)');gradient.addColorStop(.5,'rgba(80,90,105,.35)');gradient.addColorStop(1,'rgba(40,45,55,0)');ctx.fillStyle=gradient;ctx.fillRect(0,0,32,32);
 const smoke=new THREE.Points(g,new THREE.PointsMaterial({map:new THREE.CanvasTexture(c),color:0xa5abb4,size:.75,transparent:true,opacity:.75,depthWrite:false,sizeAttenuation:true}));smoke.visible=false;smoke.frustumCulled=false;vehicle.root.add(smoke);
 const sparkGeo=new THREE.BufferGeometry();sparkGeo.setAttribute('position',new THREE.BufferAttribute(new Float32Array(12*3),3));
 const sparks=new THREE.Points(sparkGeo,new THREE.PointsMaterial({color:0xffc354,size:.08,transparent:true,depthWrite:false}));sparks.visible=false;vehicle.root.add(sparks);
 const flame=new THREE.Mesh(new THREE.ConeGeometry(.17,.8,10),new THREE.MeshBasicMaterial({color:0xff7329,transparent:true,opacity:.85,depthWrite:false}));flame.position.set(0,.75,-1.5);flame.visible=false;vehicle.root.add(flame);
 vehicle.damageFx={smoke,sparks,flame,bucket:-1,bases:new Map()};
}
export function updateDamageEffects(vehicle,car,time){
 const fx=vehicle.damageFx;if(!fx)return;
 const bucket=Math.floor(car.damage/3),axis=vehicle.forwardAxis||'negative-x';
 if(bucket!==fx.bucket){
   fx.bucket=bucket;
   vehicle.visual.traverse(mesh=>{
     if(!mesh.isMesh||!/painted body|Ceramic accent|Carbon chassis|Pearl ceramic|SUGO cobalt|Signal crimson|Carbon composite/i.test(mesh.material.name))return;
     if(!fx.bases.has(mesh)){
       mesh.geometry=mesh.geometry.clone();const a=mesh.geometry.getAttribute('position');fx.bases.set(mesh,new Float32Array(a.array));
     }
     const base=fx.bases.get(mesh),attribute=mesh.geometry.getAttribute('position');
     for(let i=0;i<base.length;i+=3){
       let x=axis==='negative-x'?base[i+2]:base[i],y=base[i+1],z=axis==='negative-x'?-base[i]:base[i+2];
       const front=car.damageZones.front/100*Math.max(0,Math.min(1,(z-.6)/1.8)),rear=car.damageZones.rear/100*Math.max(0,Math.min(1,(-z-.6)/1.8));
       z-=(z>.6?front*.56:0);z+=z<-.6?rear*.48:0;y-=Math.max(front,rear)*Math.max(0,y-.23)*.35;
       const side=(x>0?car.damageZones.left:car.damageZones.right)/100;x*=1-side*Math.max(0,(Math.abs(x)-.35))*.30;
       if(axis==='negative-x'){attribute.array[i]=-z;attribute.array[i+1]=y;attribute.array[i+2]=x;}else{attribute.array[i]=x;attribute.array[i+1]=y;attribute.array[i+2]=z;}
     }
     attribute.needsUpdate=true;mesh.geometry.computeVertexNormals();mesh.geometry.computeBoundingSphere();
   });
 }
 fx.smoke.visible=car.damage>=35;fx.flame.visible=car.retired;
 if(fx.smoke.visible){const p=fx.smoke.geometry.attributes.position.array;for(let i=0;i<36;i++){const life=(time*.45+i*.137)%1,spread=.13+life*.55;p[i*3]=Math.sin(i*14.3+time*.7)*spread;p[i*3+1]=.85+life*(car.retired?3.7:2.0);p[i*3+2]=-1.55-life*.45;}fx.smoke.geometry.attributes.position.needsUpdate=true;fx.smoke.material.opacity=.22+car.damage*.005;fx.smoke.material.size=car.retired?1.15:.7;}
 fx.flame.scale.setScalar(.8+.15*Math.sin(time*31));fx.flame.rotation.z=Math.sin(time*13)*.10;
 fx.sparks.visible=car.collision>.18&&car.lastImpact>5;
 if(fx.sparks.visible){const p=fx.sparks.geometry.attributes.position.array;for(let i=0;i<12;i++){const life=(.32-car.collision)/.32,angle=i*2.4;p[i*3]=Math.cos(angle)*life*1.1;p[i*3+1]=.35+Math.sin(i)*life*.5;p[i*3+2]=(car.lastImpactZone==='rear'?-2.2:2.2)+Math.sin(angle)*life;}fx.sparks.geometry.attributes.position.needsUpdate=true;}
}


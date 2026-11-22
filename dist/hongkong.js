import * as THREE from 'three';
import {planHongKong} from './hk-scenery-plan.mjs';
import {PIT} from './physics.mjs';
export function buildHongKong(root,track,kit,seed=7){
 const {mat,instances,addBox,label}=kit,plan=planHongKong(track,seed),shells=[[],[],[],[]],windows=[],frames=[],roofs=[],pads=[];
 for(const b of plan.buildings){
   const local=(x,y,z)=>({x:b.x+Math.cos(b.yaw)*x+Math.sin(b.yaw)*z,y,z:b.z-Math.sin(b.yaw)*x+Math.cos(b.yaw)*z,yaw:b.yaw});
   shells[b.color].push({...local(0,b.height/2,0),sx:b.width,sy:b.height,sz:b.depth});
   roofs.push({...local(0,b.height+.4,0),sx:b.width+1,sy:.8,sz:b.depth+1});
   pads.push({...local(0,-.015,0),sx:b.width+10,sy:.08,sz:b.depth+10});
   // Exposed façades: floors and bays share one dimensional grammar.
   for(let floor=1;floor<b.floors;floor++){
     const y=floor*3.35+1.4;
     for(const face of [-1,1]){
       for(let bay=0;bay<b.depthBays;bay++)windows.push({...local(face*(b.width/2+.04),y,-b.depth/2+(bay+.5)*3.2),yaw:b.yaw+face*Math.PI/2,sx:1.5,sy:1.25,sz:1});
       for(let bay=0;bay<b.bays;bay++)windows.push({...local(-b.width/2+(bay+.5)*3.2,y,face*(b.depth/2+.04)),yaw:b.yaw+(face<0?Math.PI:0),sx:1.5,sy:1.25,sz:1});
     }
     frames.push({...local(0,floor*3.35,0),sx:b.width+.2,sy:.13,sz:b.depth+.2});
   }
 }
 const cube=new THREE.BoxGeometry(1,1,1);
 [0xb2b7ad,0xd4c6ad,0x96aca6,0xa3b1c3].forEach((c,i)=>instances(cube,mat(c,.85),shells[i]));
 instances(cube,mat(0x586c65),pads);
 instances(new THREE.PlaneGeometry(1,1),mat(0x304650,.35,.2),windows);instances(cube,mat(0x788e87),frames);instances(cube,mat(0x566c69),roofs);
 instances(new THREE.ConeGeometry(1,1,7),mat(0x365b3e),plan.trees);instances(new THREE.ConeGeometry(1,1,8),mat(0x436753),plan.hills);
 const dark=mat(0x29424a),white=mat(0xdde6df),finish=track.at(track.length);
 if(plan.waterSide){const vertices=[],indices=[];track.points.forEach((p,i)=>{const shore=plan.waterSide<0&&p.s<PIT.exit+20?50:18,offsets=[plan.waterSide*shore,plan.waterSide*2200].sort((a,b)=>a-b);for(const d of offsets)vertices.push(p.x+p.nx*d,-.035,p.z+p.nz*d);if(i<track.points.length-1){const n=i*2;indices.push(n,n+2,n+1,n+1,n+2,n+3);}});const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.setIndex(indices);g.computeVertexNormals();const water=mat(0x1d657c,.24,.2);water.polygonOffset=true;water.polygonOffsetFactor=-2;water.polygonOffsetUnits=-4;root.add(new THREE.Mesh(g,water));}
 // A finish exists only at the actual end; no artificial return chord joins it to the start.
 const finishRoot=new THREE.Group();finishRoot.position.set(finish.x,0,finish.z);finishRoot.rotation.y=finish.yaw;root.add(finishRoot);
 for(let i=0;i<18;i++)for(let j=0;j<4;j++){const square=new THREE.Mesh(new THREE.BoxGeometry(1,.012,.75),(i+j)%2?dark:white);square.position.set(-8.5+i,.055,-j*.75);finishRoot.add(square);}
 for(const x of [-12,12]){const pole=new THREE.Mesh(new THREE.BoxGeometry(.7,10,.7),dark);pole.position.set(x,5,0);finishRoot.add(pole);}
 const board=new THREE.Mesh(new THREE.BoxGeometry(25,1.5,.6),dark);board.position.y=9.6;finishRoot.add(board);
 const finishLabel=new THREE.Mesh(new THREE.PlaneGeometry(23,1.15),label('FINISH / '+track.meta.endName,1536,160));finishLabel.position.set(0,9.6,-.32);finishLabel.rotation.y=Math.PI;finishRoot.add(finishLabel);
 for(const sign of plan.signs){const p=track.at(sign.s,-13);addBox([p.x,3,p.z],[.18,6,.18],dark,p.yaw);const text=new THREE.Mesh(new THREE.PlaneGeometry(9,1.5),label(sign.text,1024,192,'#124a3b','#eff8ef'));text.position.set(p.x,5,p.z);text.rotation.y=p.yaw+Math.PI;root.add(text);}
 let tunnel=null;
 if(track.id==='hk-aberdeen-tunnel'){
   const start=track.nearest(track.anchors[3].x,track.anchors[3].z).s,end=track.nearest(track.anchors[5].x,track.anchors[5].z).s,vertices=[],indices=[],steps=Math.ceil((end-start)/8),arcs=16;
   for(let i=0;i<=steps;i++){const p=track.at(start+(end-start)*i/steps);for(let a=0;a<=arcs;a++){const angle=Math.PI*a/arcs,d=Math.cos(angle)*11.7;vertices.push(p.x+p.nx*d,.15+Math.sin(angle)*7.5,p.z+p.nz*d);if(i<steps&&a<arcs){const n=i*(arcs+1)+a;indices.push(n,n+arcs+1,n+1,n+1,n+arcs+1,n+arcs+2);}}}
   const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.setIndex(indices);geometry.computeVertexNormals();const material=new THREE.MeshBasicMaterial({color:0x4f5859,side:THREE.DoubleSide,fog:true});const shell=new THREE.Mesh(geometry,material);root.add(shell);
   const lamps=[];for(let s=start;s<end;s+=30)for(const side of [-1,1]){const p=track.at(s,side*8);lamps.push({x:p.x,y:5.5,z:p.z,yaw:p.yaw});}instances(new THREE.BoxGeometry(.22,.1,5),new THREE.MeshBasicMaterial({color:0xd7f6ef}),lamps);
   const ribs=[];for(let s=start;s<=end;s+=32){const p=track.at(s);ribs.push({x:p.x,y:.15,z:p.z,yaw:p.yaw,sy:7.2/11.5});}instances(new THREE.TorusGeometry(11.5,.13,4,32,Math.PI),mat(0x8b9ea2),ribs);
   tunnel={start,end,geometry:'KML-indexed gameplay approximation; elevation unavailable'};
 }
 const anchorMarkers=instances(new THREE.SphereGeometry(.9,8,6),new THREE.MeshBasicMaterial({color:0xd4ff54}),track.anchors.map(p=>({x:p.x,y:2,z:p.z})));anchorMarkers.visible=false;
 return{plan,tunnel,finishRoot,anchorMarkers};
}

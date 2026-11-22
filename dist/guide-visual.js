import * as THREE from 'three';
import {performanceForDamage} from './physics.mjs';
// A single instanced draw call; arrows sit above the actual flat racing surface.
export function buildGuideVisual(root,track,guide){
 const geometry=new THREE.BufferGeometry();
 geometry.setAttribute('position',new THREE.Float32BufferAttribute([
  -0.55,0,-1.45, 0,0,-.6, 0,0,1.45,
  0,0,1.45, 0,0,-.6, .55,0,-1.45
 ],3));
 geometry.computeVertexNormals();
 const material=new THREE.MeshBasicMaterial({color:0xffffff,side:THREE.DoubleSide,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2});
 const mesh=new THREE.InstancedMesh(geometry,material,48),scratch=new THREE.Object3D(),color=new THREE.Color();
 mesh.name='Advisory braking guide';mesh.visible=false;mesh.frustumCulled=false;mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);root.add(mesh);
 return {mesh,update(car,visible){
  mesh.visible=visible&&!car.inPit&&!car.retired;if(!mesh.visible)return;
  let count=0;const factor=performanceForDamage(car.damage).speed;
  for(let i=0;i<48;i++){
   const s=Math.floor(car.lastS/5)*5+8+i*5;if(track.open&&s>track.length)break;
   const p=track.at(s),target=guide.at(s).speed*factor;
   scratch.position.set(p.x,.085,p.z);scratch.rotation.set(0,p.yaw,0);scratch.updateMatrix();mesh.setMatrixAt(count,scratch.matrix);
   color.setHex(car.speed>target+2.5?0xff6559:car.speed>target-3?0xffcc62:0x9bff77);mesh.setColorAt(count,color);count++;
  }
  mesh.count=count;mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
 }};
}

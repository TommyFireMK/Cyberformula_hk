import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {random,PIT,pitLaneOffset,pitOuterOffset} from './physics.mjs';
import {buildHongKong} from './hongkong.js';
const Y=new THREE.Vector3(0,1,0),scratch=new THREE.Object3D();
export function buildWorld(scene,track,seed=7){
 const rng=random(seed),root=new THREE.Group();root.name=track.meta.name;scene.add(root);
 const theme=track.theme,palette={
   coast:{ground:0x182e35,fog:0x59687a,top:0x091a39,horizon:0x8f7890,mountain:0x183044,tree:0x1f4845,sun:0xffc38b},
   harbor:{ground:0x29393d,fog:0x6b777c,top:0x1b3549,horizon:0x9e9b88,mountain:0x374852,tree:0x42574a,sun:0xffdda2},
   alpine:{ground:0x344d3b,fog:0x879c9d,top:0x245a83,horizon:0xb4d0cb,mountain:0x506c73,tree:0x284f38,sun:0xfff1c4},
   neon:{ground:0x151c30,fog:0x192139,top:0x030919,horizon:0x303258,mountain:0x11192c,tree:0x1e3445,sun:0xbfd4ff}
 }[theme];
 scene.background.setHex(palette.fog);scene.fog.color.setHex(palette.fog);scene.fog.near=theme==='neon'?140:210;
 const hemi=scene.children.find(o=>o.isHemisphereLight),sunLight=scene.children.find(o=>o.isDirectionalLight);
 if(hemi){hemi.intensity=theme==='neon'?1.7:2.7;hemi.color.setHex(theme==='neon'?0x799be6:0x9ecdf5);}
 if(sunLight){sunLight.intensity=theme==='neon'?1.5:3.3;sunLight.color.setHex(theme==='neon'?0x8fbbff:0xffd9b6);}
 const mat=(c,r=.7,m=.0)=>new THREE.MeshStandardMaterial({color:c,roughness:r,metalness:m});
 const asphalt=mat(theme==='neon'?0x111b30:0x182735,.92),shoulder=mat(0x263747),groundMat=mat(palette.ground,.97),white=mat(0x9fb9c8),red=mat(0xe35d51),railMat=mat(0x9ab8c5,.48,.5),dark=mat(0x122634);
 const cyan=new THREE.MeshBasicMaterial({color:0x68e3f7}),lime=new THREE.MeshBasicMaterial({color:0xd4ff54}),warm=new THREE.MeshBasicMaterial({color:0xffbd65});
 const roadGroup=new THREE.Group();roadGroup.name='Track boundaries';root.add(roadGroup);
 function ribbon(offset,width,height,material){
   const verts=[],uvs=[],indices=[];const pts=track.points;
   pts.forEach((p,i)=>{for(const edge of [-.5,.5]){const d=offset+edge*width;verts.push(p.x+p.nx*d,height,p.z+p.nz*d);uvs.push((edge+.5),p.s*.1);}if(i<pts.length-1){let n=i*2;indices.push(n,n+2,n+1,n+1,n+2,n+3);}});
   const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));g.setIndex(indices);g.computeVertexNormals();
   const m=new THREE.Mesh(g,material);m.receiveShadow=true;root.add(m);return m;
 }
 const xs=track.points.map(p=>p.x),zs=track.points.map(p=>p.z),minX=Math.min(...xs),maxX=Math.max(...xs),minZ=Math.min(...zs),maxZ=Math.max(...zs);
 const terrain=new THREE.Mesh(new THREE.PlaneGeometry(Math.max(5200,maxX-minX+2200),Math.max(5200,maxZ-minZ+2200)),groundMat);terrain.rotation.x=-Math.PI/2;terrain.position.set((minX+maxX)/2,-.08,(minZ+maxZ)/2);root.add(terrain);
 ribbon(0,23.2,.008,shoulder);ribbon(0,18,.035,asphalt);
 for(const s of [-1,1]){roadGroup.add(ribbon(s*8.62,.12,.044,white));roadGroup.add(ribbon(s*10.35,.11,.32,cyan));}
 const boxes=[];
 function addBox(pos,scale,material,yaw=0,shadow=false){const g=new THREE.BoxGeometry(...scale),o=new THREE.Mesh(g,material);o.position.set(...pos);o.rotation.y=yaw;o.castShadow=shadow;o.receiveShadow=true;root.add(o);return o;}
 function instances(geo,material,data){const m=new THREE.InstancedMesh(geo,material,data.length);data.forEach((p,i)=>{scratch.position.set(p.x,p.y,p.z);scratch.rotation.set(0,p.yaw||0,0);scratch.scale.set(p.sx||1,p.sy||1,p.sz||1);scratch.updateMatrix();m.setMatrixAt(i,scratch.matrix);});m.receiveShadow=true;root.add(m);return m;}
 const dashes=[],kerbA=[],kerbB=[],rails=[],posts=[],lights=[];
 for(let s=0;s<track.length;s+=3){for(const side of [-1,1]){const p=track.at(s,side*9.22);(Math.floor(s/3)%2?kerbA:kerbB).push({x:p.x,y:.055,z:p.z,yaw:p.yaw});}}
 for(let s=0;s<track.length;s+=12){const p=track.at(s);dashes.push({x:p.x,y:.045,z:p.z,yaw:p.yaw});}
 for(let s=0;s<track.length;s+=6){for(const side of [-1,1]){if(side<0&&((s>=PIT.entry&&s<PIT.split)||(s>PIT.merge&&s<=PIT.exit)))continue;const p=track.at(s,side*10.8);rails.push({x:p.x,y:.6,z:p.z,yaw:p.yaw});posts.push({x:p.x,y:.7,z:p.z,yaw:p.yaw});}}
 for(let s=0;s<track.length;s+=38){for(const side of [-1,1]){const p=track.at(s,side*12.7);lights.push({x:p.x,y:3.3,z:p.z,yaw:p.yaw});}}
 instances(new THREE.BoxGeometry(.13,.008,4.8),white,dashes);
 instances(new THREE.BoxGeometry(.8,.07,3.05),red,kerbA);instances(new THREE.BoxGeometry(.8,.07,3.05),white,kerbB);
 instances(new THREE.BoxGeometry(.2,.70,6.2),railMat,rails);instances(new THREE.BoxGeometry(.32,1.30,.32),dark,posts);
 instances(new THREE.BoxGeometry(.15,6.6,.15),dark,lights);
 instances(new THREE.BoxGeometry(.2,.08,2.5),cyan,lights.map(p=>({...p,y:6.6,sx:1,sy:1,sz:1})));
 // Checkerboard and launch gantry.
 const start=track.at(0),gate=new THREE.Group();gate.position.set(start.x,0,start.z);gate.rotation.y=start.yaw;root.add(gate);
 function gateBox(x,y,z,sx,sy,sz,material){const o=new THREE.Mesh(new THREE.BoxGeometry(sx,sy,sz),material);o.position.set(x,y,z);gate.add(o);return o;}
 for(let i=0;i<18;i++)for(let j=0;j<4;j++)gateBox(-8.5+i,.052,-j*.75,1,.012,.75,(i+j)%2?dark:white);
 gateBox(-12,5,0,.8,10,.8,dark);gateBox(12,5,0,.8,10,.8,dark);gateBox(0,9.5,0,25,1.8,.8,dark);
 gateBox(0,8.6,-.44,24,.08,.08,cyan);
 function label(text,w=1024,h=200,bg='#102b3c',color='#d4ff54'){
   const c=document.createElement('canvas');c.width=w;c.height=h;const ctx=c.getContext('2d');ctx.fillStyle=bg;ctx.fillRect(0,0,w,h);ctx.strokeStyle='#6ce9ff';ctx.lineWidth=5;ctx.strokeRect(8,8,w-16,h-16);ctx.fillStyle=color;ctx.font=`italic 800 ${Math.round(h*.48)}px Arial`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,w/2,h/2);const tx=new THREE.CanvasTexture(c);tx.colorSpace=THREE.SRGBColorSpace;return new THREE.MeshBasicMaterial({map:tx});
 }
 const sign=new THREE.Mesh(new THREE.PlaneGeometry(22,1.25),label(track.meta.label+'  /  CYBER CIRCUIT'));sign.position.set(0,9.6,-.43);sign.rotation.y=Math.PI;gate.add(sign);
 const signal=[];for(let i=0;i<5;i++){const o=new THREE.Mesh(new THREE.CircleGeometry(.23,16),new THREE.MeshBasicMaterial({color:0xf15050}));o.position.set(-2+i,7.7,-.48);o.rotation.y=Math.PI;gate.add(o);signal.push(o);}
 // Grid slots, directional chevrons and trackside sponsor boards.
 for(let i=0;i<5;i++){const p=track.at(10+i*7,(i%2?1:-1)*3);const line=addBox([p.x,.05,p.z],[2.7,.015,.15],white,p.yaw);}
 const sponsors=['SUGO  /  GSX','CYBER FORMULA','BOOST YOUR LIMIT','ASURADA  07'];
 for(let i=0;i<24;i++){
   const p=track.at(i*track.length/24,15*(i%2?1:-1)),board=new THREE.Mesh(new THREE.BoxGeometry(9,1.5,.20),[dark,dark,dark,dark,label(sponsors[i%4],768,128),label(sponsors[i%4],768,128)]);board.position.set(p.x,1.5,p.z);board.rotation.y=p.yaw+Math.PI/2;root.add(board);
 }
 // Pit pavilion by the starting straight.
 const pit=track.at(85,-32),pitG=new THREE.Group();pitG.position.set(pit.x,0,pit.z);pitG.rotation.y=pit.yaw;root.add(pitG);
 for(let i=0;i<5;i++){
   const garage=new THREE.Mesh(new THREE.BoxGeometry(15,5,10),mat(0x243b49));garage.position.set(-8,2.5,i*12-24);pitG.add(garage);
   const pane=new THREE.Mesh(new THREE.BoxGeometry(.13,2.5,8),new THREE.MeshBasicMaterial({color:i%2?0x246078:0x63a5ae}));pane.position.set(.1,2.7,i*12-24);pitG.add(pane);
 }
 const pitRoof=new THREE.Mesh(new THREE.BoxGeometry(20,.45,67),railMat);pitRoof.position.set(-8,5.3,0);pitG.add(pitRoof);
 // A real branch route: open entry/exit, separated service lane and a stop box.
 const pitGroup=new THREE.Group();pitGroup.name='Driveable pit and service bay';root.add(pitGroup);
 function pitStrip(offsets,y,material){
   const vertices=[],indices=[];let index=0;
   for(let s=PIT.entry;s<=PIT.exit;s++){
     const ends=offsets(s);for(const offset of ends){const p=track.at(s,offset);vertices.push(p.x,y,p.z);}
     if(s<PIT.exit){const a=index*2;indices.push(a,a+2,a+1,a+1,a+2,a+3);}index++;
   }
   const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.setIndex(indices);g.computeVertexNormals();
   const mesh=new THREE.Mesh(g,material);pitGroup.add(mesh);return mesh;
 }
 pitStrip(s=>[pitOuterOffset(s),-9.05],.021,mat(0x34434e,.92));
 pitStrip(s=>[pitLaneOffset(s)-3.4,pitLaneOffset(s)+3.4],.037,mat(0x203440,.85));
 for(const side of [-1,1])pitStrip(s=>[pitLaneOffset(s)+side*3.1-.065,pitLaneOffset(s)+side*3.1+.065],.047,lime);
 const pitOuterRails=[];
 for(let s=PIT.entry;s<=PIT.exit;s+=2){const p=track.at(s,pitOuterOffset(s));pitOuterRails.push({x:p.x,y:.6,z:p.z,yaw:p.yaw});}
 instances(new THREE.BoxGeometry(.2,1.1,2.15),railMat,pitOuterRails);
 const servicePoint=track.at(PIT.bay,PIT.bayOffset),serviceRoot=new THREE.Group();serviceRoot.position.set(servicePoint.x,0,servicePoint.z);serviceRoot.rotation.y=servicePoint.yaw;pitGroup.add(serviceRoot);
 const serviceMat=new THREE.MeshBasicMaterial({color:0x7cb94b});
 const serviceFloor=new THREE.Mesh(new THREE.BoxGeometry(4.7,.025,10),mat(0x245a4d,.9));serviceFloor.position.y=.045;serviceRoot.add(serviceFloor);
 function serviceBox(x,y,z,w,h,d,material){const o=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material);o.position.set(x,y,z);serviceRoot.add(o);return o;}
 for(const x of [-2.3,2.3])serviceBox(x,.065,0,.10,.015,10,serviceMat);
 for(const z of [-4.95,4.95])serviceBox(0,.065,z,4.7,.015,.12,serviceMat);
 for(const x of [-2.8,2.8])serviceBox(x,1.55,3.9,.17,3.1,.17,dark);
 serviceBox(0,3.15,3.9,5.8,.65,.22,dark);
 const serviceSign=new THREE.Mesh(new THREE.PlaneGeometry(5.4,.47),label('SUGO PIT / REPAIR',1024,128));serviceSign.position.set(0,3.15,3.77);serviceSign.rotation.y=Math.PI;serviceRoot.add(serviceSign);
 const stopMark=new THREE.Mesh(new THREE.PlaneGeometry(3.6,1.15),label('STOP HERE',512,128,'#245a4d','#d4ff54'));stopMark.rotation.set(-Math.PI/2,0,Math.PI);stopMark.position.set(0,.067,-3.3);serviceRoot.add(stopMark);
 const mechanics=[];
 for(const side of [-1,1])for(const z of [-2.1,2.1]){
   const crew=new THREE.Group();crew.position.set(side*2.95,0,z);serviceRoot.add(crew);
   const torso=new THREE.Mesh(new THREE.BoxGeometry(.32,.58,.28),mat(0xc9e3ec,.65));torso.position.y=.84;crew.add(torso);
   const helmet=new THREE.Mesh(new THREE.SphereGeometry(.17,12,8),lime);helmet.position.y=1.31;crew.add(helmet);
   for(const x of [-.10,.10]){const leg=new THREE.Mesh(new THREE.BoxGeometry(.10,.54,.13),dark);leg.position.set(x,.3,0);crew.add(leg);}
   const arm=new THREE.Mesh(new THREE.BoxGeometry(.43,.11,.11),mat(0xc9e3ec));arm.position.set(-side*.25,.94,0);crew.add(arm);mechanics.push({arm,side,crew});
 }
 for(const [s,text] of [[PIT.entry+3,'PIT ENTRY  /  60'],[PIT.exit-4,'PIT EXIT']]){
   const p=track.at(s,-12),signRoot=new THREE.Group();signRoot.position.set(p.x,0,p.z);signRoot.rotation.y=p.yaw;pitGroup.add(signRoot);
   const pole=new THREE.Mesh(new THREE.BoxGeometry(.12,3.3,.12),dark);pole.position.y=1.65;signRoot.add(pole);
   const sign=new THREE.Mesh(new THREE.PlaneGeometry(4.5,.85),label(text,768,128));sign.rotation.y=Math.PI;sign.position.set(0,3.1,0);signRoot.add(sign);
 }
 let hongKong=null;
 if(track.open)hongKong=buildHongKong(root,track,{mat,instances,addBox,label},seed);
 // Original fictional circuits keep their original scenery.
 if(!track.open){
 // Distant coastal city. All seeded; instances keep draw calls low.
 const buildings=[],windows=[],mountains=[],trees=[];
 for(let i=0;i<170;i++){
   const x=(rng()-.5)*1500,z=(rng()-.5)*1500;if((Math.abs(x)<340&&Math.abs(z)<350)||track.nearest(x,z).distance<50)continue;
   const w=9+rng()*23,h=15+rng()**2*110,d=8+rng()*22;
   buildings.push({x,y:h/2,z,sx:w,sy:h,sz:d});
   for(let k=3;k<h;k+=5)windows.push({x:x+w*.505,y:k,z,sx:.08,sy:.38,sz:d*.82});
 }
 instances(new THREE.BoxGeometry(1,1,1),mat(0x193a50,.65,.25),buildings);
 instances(new THREE.BoxGeometry(1,1,1),new THREE.MeshBasicMaterial({color:theme==='neon'?0xcf72ed:0x63c1d2}),windows);
 for(let i=0;i<26;i++){const a=i/26*Math.PI*2,r=900+rng()*450,h=120+rng()*200;mountains.push({x:Math.cos(a)*r,y:h*.25-30,z:Math.sin(a)*r,sx:150+rng()*200,sy:h,sz:150+rng()*150,yaw:rng()*6});}
 instances(new THREE.ConeGeometry(1,1,5),mat(palette.mountain,.99),mountains);
 for(let i=0;i<(theme==='alpine'?1400:180);i++){const x=(rng()-.5)*1000,z=(rng()-.5)*1000,p=track.nearest(x,z);if(p.distance<23||p.distance>100||(p.s<200&&p.lateral<0))continue;trees.push({x,y:3,z,sx:1.7,sy:6+rng()*7,sz:1.7,yaw:rng()*6});}
 instances(new THREE.ConeGeometry(1,1,6),mat(palette.tree),trees);
 if(theme==='harbor'){
   const paints=[mat(0xba5743),mat(0x397c8b),mat(0xcc9d48)];
   for(let i=0;i<32;i++){const p=track.at(260+i*(track.length-280)/32,(i%2?1:-1)*(30+rng()*9));if(track.nearest(p.x,p.z).distance<26)continue;
     for(let layer=0;layer<1+i%3;layer++){addBox([p.x,1.5+layer*3.1,p.z],[6,3,12],paints[i%3],p.yaw);for(let k=-2;k<=2;k++)addBox([p.x+p.nx*k,3.03+layer*3.1,p.z+p.nz*k],[.08,.06,11.8],railMat,p.yaw);}
   }
   for(const s of [350,track.length*.52,track.length*.78]){const p=track.at(s,55),crane=new THREE.Group();crane.position.set(p.x,0,p.z);crane.rotation.y=p.yaw;root.add(crane);for(const x of [-13,13]){const leg=new THREE.Mesh(new THREE.BoxGeometry(1.4,37,1.4),paints[2]);leg.position.set(x,18.5,0);crane.add(leg);}const beam=new THREE.Mesh(new THREE.BoxGeometry(45,2.2,2),paints[2]);beam.position.y=37;crane.add(beam);const cable=new THREE.Mesh(new THREE.BoxGeometry(.12,21,.12),dark);cable.position.set(-7,25,0);crane.add(cable);}
 }
 if(theme==='alpine'){
   const rocks=[];for(let s=240;s<track.length;s+=35){const side=s%70<35?1:-1,p=track.at(s,side*(40+rng()*25));if(track.nearest(p.x,p.z).distance<29)continue;rocks.push({x:p.x,y:4,z:p.z,sx:8+rng()*12,sy:12+rng()*26,sz:8+rng()*12,yaw:rng()*6});}
   instances(new THREE.IcosahedronGeometry(1,0),mat(0x708080),rocks);
 }
 if(theme==='neon'){
   const towers=[],bandsA=[],bandsB=[];
   for(let s=220;s<track.length;s+=27)for(const side of [-1,1]){const p=track.at(s,side*(35+rng()*12));if(track.nearest(p.x,p.z).distance<28)continue;const h=18+rng()*65;towers.push({x:p.x,y:h/2,z:p.z,sx:12,sy:h,sz:14,yaw:p.yaw});for(let y=5;y<h;y+=6)(side>0?bandsA:bandsB).push({x:p.x,y,z:p.z,sx:12.2,sy:.23,sz:14.2,yaw:p.yaw});}
   instances(new THREE.BoxGeometry(1,1,1),mat(0x21324c,.4,.25),towers);
   instances(new THREE.BoxGeometry(1,1,1),new THREE.MeshBasicMaterial({color:0xe673e6}),bandsA);instances(new THREE.BoxGeometry(1,1,1),cyan,bandsB);
 }
 // The sea lies outside the far guardrail, with horizontal glints.
 const sea=new THREE.Mesh(new THREE.PlaneGeometry(3000,1200),new THREE.MeshStandardMaterial({color:0x145771,roughness:.26,metalness:.35}));sea.rotation.x=-Math.PI/2;sea.position.set(0,-.13,-980);sea.visible=theme==='coast'||theme==='harbor';root.add(sea);
 const glints=[];for(let i=0;i<170;i++)glints.push({x:(rng()-.5)*2200,y:-.12,z:-450-rng()*1000,sx:10+rng()*55,sy:1,sz:.09+rng()*.2});
 instances(new THREE.BoxGeometry(1,.012,1),new THREE.MeshBasicMaterial({color:0x367e94}),glints).visible=sea.visible;
 }
 const sun=new THREE.Mesh(new THREE.SphereGeometry(theme==='neon'?22:38,24,12),new THREE.MeshBasicMaterial({color:palette.sun,fog:false}));sun.position.set(-600,190,-1100);root.add(sun);
 const sky=new THREE.Mesh(new THREE.SphereGeometry(2300,32,16),new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,uniforms:{top:{value:new THREE.Color(palette.top)},bottom:{value:new THREE.Color(palette.horizon)}},vertexShader:'varying float h; void main(){h=normalize(position).y;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'uniform vec3 top;uniform vec3 bottom;varying float h;void main(){gl_FragColor=vec4(mix(bottom,top,pow(max(h,0.),.5)),1.);}' }));root.add(sky);
 return {root,roadGroup,signal,gate,seed,sky,hongKong,pit:{root:pitGroup,serviceRoot,update(car,time){const working=!!car.pitService;serviceMat.color.setHex(working?0x68eaff:car.pitCompleted?0xd4ff54:0x7cb94b);for(const m of mechanics){m.arm.rotation.z=working?m.side*(.25+.17*Math.sin(time*9)):0;m.crew.rotation.z=working?m.side*.10:0;}}},materials:{asphalt,cyan,lime},setDebug(mode){if(hongKong)hongKong.anchorMarkers.visible=mode==='road';roadGroup.traverse(o=>{if(o.isMesh)o.material.color.set(mode==='road'?0xd4ff54:(o.material===cyan?0x68e3f7:0x9fb9c8));});}};
}
export function optimiseCar(source,tint=null){
 source.updateMatrixWorld(true);const buckets=new Map();
 source.traverse(o=>{
   if(!o.isMesh)return;
   const g=o.geometry.clone();g.applyMatrix4(o.matrixWorld);
   for(const key of Object.keys(g.attributes))if(!['position','normal','uv'].includes(key))g.deleteAttribute(key);
   if(!g.getAttribute('uv'))g.setAttribute('uv',new THREE.BufferAttribute(new Float32Array(g.getAttribute('position').count*2),2));
   const mat=Array.isArray(o.material)?o.material[0]:o.material;const key=mat.uuid;
   if(!buckets.has(key))buckets.set(key,{mat,geometries:[]});buckets.get(key).geometries.push(g.index?g.toNonIndexed():g);
 });
 const root=new THREE.Group(),visual=new THREE.Group();root.add(visual);visual.rotation.y=Math.PI/2;
 for(const {mat,geometries} of buckets.values()){
   const merged=mergeGeometries(geometries,false);if(!merged)throw new Error('車身網格合併失敗');
   const m=mat.clone();
   // Cheap opaque glazing avoids per-car physical transmission render targets.
   if(m.transmission>0){m.transmission=0;m.metalness=.38;m.roughness=.2;m.color.set(0x1b4c6b);}
   if(tint&&(/cobalt|blue/i.test(m.name)))m.color.set(tint);
   m.envMapIntensity=.75;const mesh=new THREE.Mesh(merged,m);mesh.castShadow=true;visual.add(mesh);
   for(const g of geometries)g.dispose();
 }
 const shadowCanvas=document.createElement('canvas');shadowCanvas.width=64;shadowCanvas.height=64;const shadowContext=shadowCanvas.getContext('2d'),gradient=shadowContext.createRadialGradient(32,32,0,32,32,32);gradient.addColorStop(0,'rgba(0,4,9,.85)');gradient.addColorStop(.55,'rgba(0,4,9,.55)');gradient.addColorStop(1,'rgba(0,4,9,0)');shadowContext.fillStyle=gradient;shadowContext.fillRect(0,0,64,64);
 const shadow=new THREE.Mesh(new THREE.PlaneGeometry(3.7,6.6),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(shadowCanvas),transparent:true,opacity:.65,depthWrite:false}));shadow.rotation.x=-Math.PI/2;shadow.position.y=.042;root.add(shadow);
 const flames=[];for(const x of [-.755,.755]){
   const glow=new THREE.Mesh(new THREE.ConeGeometry(.19,1.65,12),new THREE.MeshBasicMaterial({color:0x65eaff,transparent:true,opacity:.82,depthWrite:false}));glow.rotation.x=-Math.PI/2;glow.position.set(x,.83,-3.0);glow.visible=false;root.add(glow);flames.push(glow);
 }
 return {root,visual,flames,meshCount:visual.children.length};
}

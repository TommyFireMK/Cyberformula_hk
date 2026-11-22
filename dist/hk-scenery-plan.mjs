// Game scenery, deliberately separate from the original KML and UrbanGround's real 3D Tiles.
export function planHongKong(track,seed=7){
 let state=seed>>>0;const random=()=>((state=(Math.imul(1664525,state)+1013904223)>>>0)/4294967296),buildings=[],trees=[],hills=[],signs=[];
 const mountain=track.id==='hk-island-mountain'||track.id==='hk-lung-cheung',waterSide=track.id==='hk-island-east'?1:['hk-west-kowloon','hk-kwun-tong'].includes(track.id)?-1:0;
 // A staging district surrounds the start, including the backdrop behind the open route.
 const start=track.at(0);
 for(const along of [-210,-115,-20,90,175])for(const side of [-1,1])for(const row of [0,1]){
   if(side===waterSide)continue;
   const bays=5+Math.floor(random()*3),depthBays=4+Math.floor(random()*3),floors=10+Math.floor(random()*15),width=bays*3.2,depth=depthBays*3.2,height=floors*3.35,offset=side*(60+row*44),x=start.x+start.tx*along+start.nx*offset,z=start.z+start.tz*along+start.nz*offset;
   if(track.nearest(x,z).distance<Math.hypot(width,depth)*.5+22)continue;
   buildings.push({x,z,yaw:start.yaw,side,bays,depthBays,floors,width,depth,height,color:Math.floor(random()*4)});
 }
 for(let s=240;s<track.length-100;s+=82)for(const side of [-1,1]){
   const ratio=s/track.length,rural=mountain&&ratio>.23&&ratio<.8;
   if(side===waterSide||(rural&&random()<.88))continue;
   const bays=4+Math.floor(random()*4),depthBays=4+Math.floor(random()*3),floors=7+Math.floor(random()*20),width=bays*3.2,depth=depthBays*3.2,height=floors*3.35,p=track.at(s,side*(50+random()*28));
   if(track.nearest(p.x,p.z).distance<Math.hypot(width,depth)*.5+22)continue;
   buildings.push({x:p.x,z:p.z,yaw:p.yaw,side,bays,depthBays,floors,width,depth,height,color:Math.floor(random()*4)});
 }
 for(let s=220;s<track.length;s+=22)for(const side of [-1,1]){
   if(side===waterSide)continue;const p=track.at(s,side*(27+random()*22));if(track.nearest(p.x,p.z).distance<23)continue;trees.push({x:p.x,z:p.z,y:3.5,yaw:random()*6,sx:2.1,sy:7+random()*5,sz:2.1});
 }
 if(mountain)for(let s=400;s<track.length;s+=230){const side=s%460<230?1:-1,p=track.at(s,side*(260+random()*180));if(track.nearest(p.x,p.z).distance<170)continue;hills.push({x:p.x,z:p.z,y:35,sx:100+random()*100,sy:140+random()*140,sz:120+random()*80,yaw:random()*6});}
 for(let s=500;s<track.length-150;s+=1000)signs.push({s,text:`${track.meta.endName} / ${Math.ceil((track.length-s)/1000)} km`});
 return{seed,buildings,trees,hills,signs,waterSide,assumptions:'Procedural Hong Kong style scenery, not a survey or imported UrbanGround geometry',floorHeight:3.35,bayWidth:3.2};
}

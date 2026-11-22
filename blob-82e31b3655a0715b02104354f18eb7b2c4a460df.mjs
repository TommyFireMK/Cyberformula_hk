// Local east / south metres. WGS84 ECEF -> ENU keeps the source scale and orientation.
export function geoToLocal(lon,lat,origin){
 const rad=Math.PI/180,a=6378137,e2=6.69437999014e-3;
 const ecef=(lo,la)=>{lo*=rad;la*=rad;const n=a/Math.sqrt(1-e2*Math.sin(la)**2);return[n*Math.cos(la)*Math.cos(lo),n*Math.cos(la)*Math.sin(lo),n*(1-e2)*Math.sin(la)];};
 const p=ecef(lon,lat),o=ecef(...origin),d=p.map((v,i)=>v-o[i]),lo=origin[0]*rad,la=origin[1]*rad;
 return{x:-Math.sin(lo)*d[0]+Math.cos(lo)*d[1],z:Math.sin(la)*Math.cos(lo)*d[0]+Math.sin(la)*Math.sin(lo)*d[1]-Math.cos(la)*d[2]};
}
export function localToGeo(x,z,origin){
 // Newton inversion of the same tangent-plane projection (not an unrelated map approximation).
 let lon=origin[0]+x/(111320*Math.cos(origin[1]*Math.PI/180)),lat=origin[1]-z/110800;
 for(let i=0;i<3;i++){const p=geoToLocal(lon,lat,origin),dx=geoToLocal(lon+.00001,lat,origin),dz=geoToLocal(lon,lat+.00001,origin),a=(dx.x-p.x)/.00001,b=(dz.x-p.x)/.00001,c=(dx.z-p.z)/.00001,d=(dz.z-p.z)/.00001,det=a*d-b*c,ex=x-p.x,ez=z-p.z;lon+=(ex*d-b*ez)/det;lat+=(a*ez-ex*c)/det;}
 return{lon,lat};
}
function centripetal(p0,p1,p2,p3,f){
 const t0=0,t1=Math.sqrt(Math.hypot(p1.x-p0.x,p1.z-p0.z)),t2=t1+Math.sqrt(Math.hypot(p2.x-p1.x,p2.z-p1.z)),t3=t2+Math.sqrt(Math.hypot(p3.x-p2.x,p3.z-p2.z)),t=t1+f*(t2-t1);
 const mix=(a,b,ta,tb)=>{const w=(t-ta)/(tb-ta);return{x:a.x+(b.x-a.x)*w,z:a.z+(b.z-a.z)*w};};
 const a1=mix(p0,p1,t0,t1),a2=mix(p1,p2,t1,t2),a3=mix(p2,p3,t2,t3),b1=mix(a1,a2,t0,t2),b2=mix(a2,a3,t1,t3);
 return mix(b1,b2,t1,t2);
}
export function sampleGeoRoute(meta){
 const anchors=meta.coordinates.map(p=>geoToLocal(p[0],p[1],meta.origin)),points=[];
 const reflect=(a,b)=>({x:2*a.x-b.x,z:2*a.z-b.z});
 for(let i=0;i<anchors.length-1;i++){
   const p1=anchors[i],p2=anchors[i+1],p0=anchors[i-1]||reflect(p1,p2),p3=anchors[i+2]||reflect(p2,p1),steps=Math.max(8,Math.ceil(Math.hypot(p2.x-p1.x,p2.z-p1.z)/5));
   for(let j=0;j<steps;j++)points.push(centripetal(p0,p1,p2,p3,j/steps));
 }
 points.push({...anchors.at(-1)});let length=0;
 for(let i=0;i<points.length;i++){if(i)length+=Math.hypot(points[i].x-points[i-1].x,points[i].z-points[i-1].z);points[i].s=length;}
 for(let i=0;i<points.length;i++){const a=points[Math.max(0,i-1)],b=points[Math.min(points.length-1,i+1)],l=Math.hypot(b.x-a.x,b.z-a.z);Object.assign(points[i],{tx:(b.x-a.x)/l,tz:(b.z-a.z)/l,nx:(b.z-a.z)/l,nz:-(b.x-a.x)/l});}
 return{points,length,anchors};
}
export function buildSpatialLookup(points){
 const cells=new Map(),size=64;
 for(let i=0;i<points.length-1;i++){const a=points[i],b=points[i+1];for(let x=Math.floor(Math.min(a.x,b.x)/size);x<=Math.floor(Math.max(a.x,b.x)/size);x++)for(let z=Math.floor(Math.min(a.z,b.z)/size);z<=Math.floor(Math.max(a.z,b.z)/size);z++){const key=x+','+z;if(!cells.has(key))cells.set(key,[]);cells.get(key).push(i);}}
 return(x,z)=>{const out=new Set(),cx=Math.floor(x/size),cz=Math.floor(z/size);for(let a=cx-1;a<=cx+1;a++)for(let b=cz-1;b<=cz+1;b++)for(const i of cells.get(a+','+b)||[])out.add(i);return out;};
}

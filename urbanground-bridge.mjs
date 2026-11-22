import {courseById} from './dist/championship.mjs';
const BASE=process.env.URBANGROUND_URL||'http://localhost:8081';
let pending=Promise.resolve();
async function native(path,body){
 const response=await fetch(BASE+path,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(12000)});
 if(!response.ok)throw Error(`UrbanGround HTTP ${response.status}`);
 return response;
}
async function json(path,body){const value=await(await native(path,body)).json();if(value.ok===false)throw Error(value.error||'UrbanGround action failed');return value;}
async function observe(){const health=await json('/health');if(health.service!=='UrbanGround')throw Error('Unexpected local service');const state=await json('/state'),task=await json('/task');return{health,state,evaluationActive:!!task.active,ready:!!state.tiles_settled&&!!state.idle&&state.tiles_progress>=99};}
export async function handleUrbanGround(req,res){
 const path=new URL(req.url,'http://localhost').pathname;if(!path.startsWith('/api/urbanground/'))return false;
 const reply=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}).end(JSON.stringify(data));};
 try{
   if(path==='/api/urbanground/state'&&req.method==='GET'){reply(200,{ok:true,...await observe()});return true;}
   if(path==='/api/urbanground/frame'&&req.method==='GET'){
     const response=await native('/screenshot?width=1280&height=720&format=png&include_ui=1'),bytes=Buffer.from(await response.arrayBuffer());if(bytes.length>12*1024*1024)throw Error('Screenshot too large');
     res.writeHead(200,{'Content-Type':'image/png','Cache-Control':'no-store'}).end(bytes);return true;
   }
   if((path==='/api/urbanground/preview'||path==='/api/urbanground/zoom')&&req.method==='POST'){
     if(req.headers.origin&&new URL(req.headers.origin).host!==req.headers.host){reply(403,{ok:false,error:'Same-origin requests only'});return true;}
     let body='',tooLarge=false;for await(const chunk of req){body+=chunk;if(body.length>2048){tooLarge=true;break;}}if(tooLarge){reply(413,{ok:false,error:'Request too large'});return true;}
     let input;try{input=JSON.parse(body);}catch{reply(400,{ok:false,error:'Invalid JSON'});return true;}
     const zoom=path.endsWith('/zoom'),meta=courseById(input.course);if(zoom?![.5,2].includes(input.factor):(!meta.open||meta.id!==input.course||!Number.isInteger(input.index)||input.index<0||input.index>=meta.coordinates.length)){reply(400,{ok:false,error:'Select a supplied KML route and waypoint, or a supported zoom factor'});return true;}
     const run=async()=>{
       const observation=await observe();if(observation.evaluationActive)throw Error('UrbanGround 正在執行評估任務，已停止預覽操作。');
       // Capture the current scene before changing it. The viewer displays it before enabling controls.
       await(await native('/screenshot?width=640&height=360&format=png')).arrayBuffer();
       if(zoom){if(observation.state.mode!=='map')await json('/action',{action:'open_map'});await json('/action',{action:'map_zoom',factor:input.factor});return{ok:true,...await observe()};}
       if(observation.state.mode==='map')await json('/action',{action:'close_map'});
       const [lon,lat]=meta.coordinates[input.index];await json('/action',{action:'teleport',lat,lon,height:600});
       await json('/action',{action:'open_map'});
       return{ok:true,course:meta.id,index:input.index,sourceCoordinate:{lat,lon},...await observe()};
     };
     const job=pending.then(run,run);pending=job.catch(()=>{});reply(200,await job);return true;
   }
   reply(405,{ok:false,error:'Unsupported UrbanGround bridge request'});
 }catch(error){reply(503,{ok:false,error:'UrbanGround 未就緒：'+error.message,hint:'執行 Start_UrbanGround.cmd。原生程式使用 localhost:8081；賽車可獨立運行。'});}
 return true;
}

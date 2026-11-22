import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {makeTrack,createCar,stepCar,resetCar,botInput,CONFIG,clamp,formatTime,angleDelta,steeringFromKeys,resolveCarContacts,performanceForDamage,PIT,getPitState,pitLaneOffset,wrap,applyImpact,raceFinished} from './physics.mjs';
import {buildWorld,optimiseCar} from './world.js';
import {RIVALS,buildRival,attachDamageEffects,updateDamageEffects} from './vehicles.js';
import {COURSES,STAGES,courseById,cleanSave,unlockedCount,evaluateStage,completeStage} from './championship.mjs';
import {OnlineRoom,connectionScope,parseRoomInvite} from './online.js';
import {VEHICLES,vehicleById,validVehicle,vehicleForSlot} from './garage.mjs';
import {prepareFireSuperion,prepareRandoll,prepareSuperAsurada,cloneVehicle,disposeVehicle} from './garage-visuals.js';
import {DriveInput,decodeGamepad,makeBrakeGuide,guideAdvice,LapTelemetry} from './driver-aids.mjs';
import {buildGuideVisual} from './guide-visual.js';
const $=id=>document.getElementById(id),canvas=$('game');
let track=makeTrack(),raceLaps=2,mode='campaign',stageIndex=0,freeCourse='seaside',save=cleanSave(null),records={},saveAvailable=true;
let onlineState=null,netPaused=false,netRevision=-1,netResultShown=false,netSendTime=0,lobbySignature='';
let nativeBridgeAvailable=true;
fetch('./api/config',{cache:'no-store'}).then(r=>r.json()).then(c=>{nativeBridgeAvailable=c.urbangroundBridge!==false;if(loaded)menuInfo();}).catch(()=>{});
const room=new OnlineRoom({joined:onRoomJoined,state:onRoomState,error:message=>{$('onlineStatus').textContent=message;},disconnected:onRoomDisconnected});
const readStored=key=>{try{return JSON.parse(localStorage.getItem(key)||'null');}catch{return null;}};
const driverInput=new DriveInput(),driveSettings=readStored('gsx-driving-v1')||{};
let drivingProfile=driveSettings.profile==='direct'?'direct':'smooth',guideEnabled=driveSettings.guide!==false;
let padState=null,padEdges={camera:false,pause:false},inputSource='鍵盤 / 觸控',brakeGuide=null,guideVisual=null,lapTelemetry=null,lastControls={throttle:0,brake:0,steer:0};
const storedLapTraces=readStored('gsx-lap-traces-v1');
const lapTraces=storedLapTraces&&typeof storedLapTraces==='object'&&!Array.isArray(storedLapTraces)?storedLapTraces:{};
let selectedVehicle=validVehicle(readStored('gsx-vehicle-v1'))?readStored('gsx-vehicle-v1'):'asurada-gsx';
const vehicleTemplates=new Map(),onlineVisuals=new Map(),sharedVehicleGeometry=new Set();
for(const id of ['garageSelect','onlineVehicle','roomVehicle'])$(id).innerHTML=VEHICLES.map(v=>`<option value="${v.id}">${v.name} · ${v.team}</option>`).join('');
$('garageSelect').value=selectedVehicle;
function spawnVehicle(id){const v=cloneVehicle(vehicleTemplates.get(id)||vehicleTemplates.get('asurada-gsx'));v.vehicleId=id;attachDamageEffects(v);scene.add(v.root);return v;}
function useSoloVehicle(){if(!playerVisual||playerVisual.vehicleId!==selectedVehicle){if(playerVisual)disposeVehicle(playerVisual,sharedVehicleGeometry);playerVisual=spawnVehicle(selectedVehicle);}playerVisual.root.visible=true;}
function playerVehicleVisual(){return mode==='online'?onlineVisuals.get(room.playerId):playerVisual;}
function playerVehicleId(){return mode==='online'?(player.vehicleId||'asurada-gsx'):selectedVehicle;}
function clearOnlineVisuals(){for(const v of onlineVisuals.values())disposeVehicle(v,sharedVehicleGeometry);onlineVisuals.clear();}
save=cleanSave(readStored('gsx-campaign-v1'));
stageIndex=Math.min(save.cleared.length,STAGES.length-1);
const storedRecords=readStored('gsx-race-records-v2');
if(storedRecords&&typeof storedRecords==='object'&&!Array.isArray(storedRecords))for(const c of COURSES){const r=storedRecords[c.id];if(r&&Number.isFinite(r.time)&&r.time>0)records[c.id]=r;}
const legacyRecord=readStored('gsx-circuit-record-v1');
if(!records.seaside&&legacyRecord&&Number.isFinite(legacyRecord.time)&&legacyRecord.time>0)records.seaside=legacyRecord;
const requestedCourse=new URLSearchParams(location.search).get('course');
if(COURSES.some(c=>c.open&&c.id===requestedCourse)){mode='free';freeCourse=requestedCourse;}
track=makeTrack(900,mode==='free'?freeCourse:STAGES[stageIndex].course);raceLaps=track.open?1:STAGES[stageIndex].laps;
const currentStage=()=>STAGES[stageIndex];
$('roomCourse').innerHTML=COURSES.map(c=>`<option value="${c.id}">${c.name}${c.open?' / 點到點':''}</option>`).join('');
function writeStored(key,value){try{localStorage.setItem(key,JSON.stringify(value));return true;}catch{saveAvailable=false;return false;}}
function personalRecord(){return mode==='campaign'?save.best[currentStage().id]:records[track.id];}
const debug=new URLSearchParams(location.search).has('debug');
const seed=clamp(Number(new URLSearchParams(location.search).get('seed'))||7,1,9999);
let lastDamageWarning=0;
const keys=new Set(),errors=[];let renderer,scene,camera,world,playerVisual,botVisuals=[],loaded=false,phase='menu',elapsed=0,count=0,accumulator=0,lastFrame=0,camMode='chase',quality=0,sound=false,lapNumber=0,lastLapAt=0,bestLap=Infinity,noticeTimer=0,aiTimer=0,fps=60,frameCounter=0,frameAccum=0;
let player=createCar(track,0,-2.5),bots=[],record=null,finishPosition=0,pausedFrom='racing',throttleAssist=false;
function fitRoute(width,height,padding=16){const xs=track.points.map(p=>p.x),zs=track.points.map(p=>p.z),minX=Math.min(...xs)-32,maxX=Math.max(...xs)+32,minZ=Math.min(...zs)-32,maxZ=Math.max(...zs)+32;const scale=Math.min((width-padding*2)/(maxX-minX),(height-padding*2)/(maxZ-minZ));return{x:(minX+maxX)/2,z:(minZ+maxZ)/2,scale,width,height};}
let miniFit=fitRoute(440,290);
const lapTraceKey=()=>`${track.id}/${selectedVehicle}`;
function buildDrivingGuide(){brakeGuide=makeBrakeGuide(track);guideVisual=buildGuideVisual(world.root,track,brakeGuide);}
function resetLapTelemetry(){lapTelemetry=mode==='online'?null:new LapTelemetry(track.length,track.open,lapTraces[lapTraceKey()]);}
function advanceLapTelemetry(wrongWay=false){
 if(!lapTelemetry||mode==='online')return;
 const reason=player.inPit?'進入 PIT':player.offroad?'超出賽道':player.collision>.18?'碰撞':wrongWay?'逆行':'';
 for(const lap of lapTelemetry.advance(player.progress,elapsed,reason))if(lap.newBest){lapTraces[lapTraceKey()]=lapTelemetry.best;writeStored('gsx-lap-traces-v1',lapTraces);}
}
function drivingSettingsUI(){
 $('drivingProfile').value=drivingProfile;$('guideToggle').textContent='導線 '+(guideEnabled?'ON':'OFF');$('guideToggle').setAttribute('aria-pressed',String(guideEnabled));
}
function saveDrivingSettings(){driverInput.reset();writeStored('gsx-driving-v1',{profile:drivingProfile,guide:guideEnabled});drivingSettingsUI();}
function pollGamepad(){
 let pad=null;try{if(!document.hidden)pad=Array.from(navigator.getGamepads?.()||[]).find(p=>p?.connected&&p.mapping==='standard');}catch{}
 padState=decodeGamepad(pad);inputSource=padState?'標準手掣 + 鍵盤':'鍵盤 / 觸控';
 if(padState){if(padState.camera&&!padEdges.camera&&loaded)changeCamera();if(padState.pause&&!padEdges.pause&&loaded)togglePause();}
 padEdges={camera:!!padState?.camera,pause:!!padState?.pause};
 $('inputDevice').textContent=padState?'標準手掣已連接 · 左搖桿 / RT 油門 / LT 煞車 / A 推進器 / Y 視角':'鍵盤 W/A/S/D · L 導線 · 支援標準手掣';
}
function menuInfo(){
 const campaign=mode==='campaign',stage=currentStage(),meta=track.meta;
 document.body.classList.toggle('hk-route',track.open);
 $('garageSelect').value=selectedVehicle;$('vehicleDescription').textContent=vehicleById(selectedVehicle).detail+' · 所有真人車款共用街機性能';
 $('mapDriver').textContent=vehicleById(playerVehicleId()).name;
 raceLaps=track.open?1:campaign?stage.laps:mode==='online'?(onlineState?.laps||2):3;record=personalRecord();
 $('campaignMode').setAttribute('aria-pressed',String(campaign));$('freeMode').setAttribute('aria-pressed',String(mode==='free'&&!track.open));$('hkMode').setAttribute('aria-pressed',String(mode==='free'&&track.open));
 $('stageSelect').classList.toggle('hidden',!campaign);$('stageProgress').classList.toggle('hidden',!campaign);$('courseSelect').classList.toggle('hidden',mode!=='free');
 $('stageProgress').textContent=`CHAMPIONSHIP / 已通過 ${save.cleared.length} / ${STAGES.length} 關`;
 $('stageSelect').innerHTML=STAGES.map((s,i)=>`<button data-stage="${i}" ${i>=unlockedCount(save)?'disabled':''} aria-pressed="${campaign&&i===stageIndex}" aria-label="第 ${i+1} 關 ${s.name}${i>=unlockedCount(save)?'，尚未解鎖':''}"><span>${String(i+1).padStart(2,'0')}</span><small>${save.cleared.includes(s.id)?'✓ 通過':i>=unlockedCount(save)?'鎖定':'挑戰'}</small></button>`).join('');
 $('courseSelect').innerHTML=COURSES.filter(c=>!!c.open===track.open).map(c=>`<button data-course="${c.id}" aria-pressed="${!campaign&&track.id===c.id}"><small>${c.label}</small>${c.name}</button>`).join('');
 $('missionNumber').textContent=campaign?`STAGE ${String(stageIndex+1).padStart(2,'0')} / ${STAGES.length}`:mode==='online'?'ONLINE FRIENDS / 真人同場':track.open?'HONG KONG / KML 賽段':'FREE RACE / 自由競速';
 $('missionTitle').textContent=campaign?stage.name:meta.name;$('missionGoal').textContent=campaign?stage.goal:track.open?`${meta.startName} 出發，抵達${meta.endName}完成賽事。`:mode==='online'?`${raceLaps} 圈真人競速，由房主選擇賽道。`:'三圈競速，全部賽道即時開放。';$('courseTag').textContent=track.open?`${meta.sourcePoints} 個原始航點 · 保留地理比例`:`${meta.name} · ${meta.tag}`;
 $('routeAccuracy').classList.toggle('hidden',!track.open);$('urbanReference').classList.toggle('hidden',!track.open||!nativeBridgeAvailable);
 $('debugRouteControls').classList.toggle('hidden',!track.open);$('debugRoutePoint').innerHTML=track.open?meta.coordinates.map((p,i)=>`<option value="${i}">${String(i+1).padStart(2,'0')} · ${p[1].toFixed(4)}, ${p[0].toFixed(4)}</option>`).join(''):'';
 const fit=fitRoute(140,100,8),path=track.points.filter((_,i)=>i%8===0).map(p=>`${(70+(p.x-fit.x)*fit.scale).toFixed(1)},${(50+(p.z-fit.z)*fit.scale).toFixed(1)}`).join(' ');
 const first=track.points[0],last=track.points.at(-1),map=p=>({x:70+(p.x-fit.x)*fit.scale,y:50+(p.z-fit.z)*fit.scale});
 $('coursePreview').innerHTML=`<${track.open?'polyline':'polygon'} points="${path}${track.open?' '+map(last).x+','+map(last).y:''}" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/>${track.open?`<circle cx="${map(first).x}" cy="${map(first).y}" r="4" fill="#d4ff54"/><circle cx="${map(last).x}" cy="${map(last).y}" r="4" fill="#ff7967"/>`:''}`;
 $('menuLaps').textContent=String(raceLaps).padStart(2,'0');$('trackLength').textContent=(track.length/1000).toFixed(2);$('best').textContent=record?formatTime(record.time):'尚未完成本場';
 $('menuRaceType').textContent=track.open?'段競速':'圈競速';$('menuLengthType').textContent=track.open?'公里 / KML':'公里 / 圈';$('lapLabel').textContent=track.open?'ROUTE / 進度':'LAP';
 $('eventLabel').textContent=campaign?`CHAMPIONSHIP / ${stageIndex+1} OF 6`:mode==='online'?'ONLINE FRIENDS / 即時同場':track.open?'HONG KONG / POINT TO POINT':'FREE GRAND PRIX';$('eventCourse').textContent=meta.name;$('mapCourse').textContent=meta.label;
 $('weatherLabel').textContent={coast:'28°C · DRY',harbor:'25°C · DRY',alpine:'16°C · DRY',neon:'22°C · NIGHT'}[track.theme];
 $('raceMission').textContent=campaign?`第 ${stageIndex+1} 關 · ${stage.name}`:mode==='online'?`朋友競速 · ${meta.name}`:track.open?`香港賽段 · ${meta.name}`:`自由競速 · ${meta.name}`;
 $('lapTimerLabel').textContent=track.open?'CURRENT RUN / 本段':'CURRENT LAP / 本圈';$('bestLapLabel').textContent=track.open?'PERSONAL BEST':'BEST LAP';$('resultLapTitle').textContent=track.open?'賽段時間':'最快一圈';
 miniFit=fitRoute(440,290);
}
function disposeWorld(){
 const geometries=new Set(),materials=new Set(),textures=new Set();
 world.root.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.isInstancedMesh)o.dispose();for(const m of (Array.isArray(o.material)?o.material:[o.material]))if(m){materials.add(m);for(const v of Object.values(m))if(v?.isTexture)textures.add(v);}});
 scene.remove(world.root);geometries.forEach(g=>g.dispose());textures.forEach(t=>t.dispose());materials.forEach(m=>m.dispose());
}
function prepareRace(){
 const id=mode==='campaign'?currentStage().course:freeCourse;
 if(track.id!==id){disposeWorld();track=makeTrack(900,id);world=buildWorld(scene,track,seed);buildDrivingGuide();}
 const url=new URL(location.href);if(mode==='free'&&track.open)url.searchParams.set('course',track.id);else url.searchParams.delete('course');history.replaceState(null,'',url);
 menuInfo();resetRace(false);
}
function returnToMenu(){if(!loaded)return;if(mode==='online'&&room.id){$('results').classList.add('hidden');$('pausePanel').classList.add('hidden');$('onlinePanel').classList.remove('hidden');netPaused=true;keys.clear();driverInput.reset();lastControls={throttle:0,brake:0,steer:0};return;}prepareRace();}
menuInfo();
const clockTarget=new THREE.Vector3(),camDesired=new THREE.Vector3(),lookDesired=new THREE.Vector3(),quatTarget=new THREE.Quaternion(),matrix=new THREE.Matrix4(),up=new THREE.Vector3(0,1,0);
function ai(message){$('aiMessage').textContent=message;aiTimer=4;}
function notice(message){$('notice').textContent=message;$('notice').classList.remove('hidden');noticeTimer=2.4;}
function fail(error){const message=String(error?.message||error);errors.push(message);$('loadLabel').textContent='載入失敗 · 按此重試';$('start').disabled=false;$('start').onclick=()=>location.reload();ai(message);console.error(error);}
window.addEventListener('error',e=>{errors.push(e.message);if(!loaded)fail(e.error||e.message);});
window.addEventListener('unhandledrejection',e=>fail(e.reason));
function setQuality(){quality=(quality+3)%3;const scale=[1.3,1,.75][quality];renderer.setPixelRatio(Math.min(devicePixelRatio,1.5)*scale);renderer.setSize(innerWidth,innerHeight,false);$('quality').textContent='畫質 '+['HIGH','MED','LOW'][quality];}
function resize(){if(!renderer)return;camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();setQuality();}
function setup(){
 renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
 renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.16;
 scene=new THREE.Scene();scene.background=new THREE.Color(0x46556f);scene.fog=new THREE.Fog(0x59687a,210,1200);
 camera=new THREE.PerspectiveCamera(56,innerWidth/innerHeight,.08,3000);
 scene.add(new THREE.HemisphereLight(0x9ecdf5,0x39504a,2.7));
 const sun=new THREE.DirectionalLight(0xffd9b6,3.3);sun.position.set(-180,250,-220);scene.add(sun);
 const fill=new THREE.DirectionalLight(0x8dbaff,1.3);fill.position.set(160,80,170);scene.add(fill);
 const envScene=new THREE.Scene();envScene.background=new THREE.Color(0x8395af);
 for(const [x,y,z,sx,sy,sz,c] of [[0,9,0,18,.2,15,0xffffff],[-8,3,0,.2,5,16,0xb3c9e7],[8,2,4,.2,4,12,0x63798c]]){const m=new THREE.Mesh(new THREE.BoxGeometry(sx,sy,sz),new THREE.MeshBasicMaterial({color:c}));m.position.set(x,y,z);envScene.add(m);}
 const pmrem=new THREE.PMREMGenerator(renderer);const env=pmrem.fromScene(envScene,.04);scene.environment=env.texture;pmrem.dispose();
 world=buildWorld(scene,track,seed);buildDrivingGuide();resize();
 const loader=new GLTFLoader();loader.load('./assets/asurada-gsx.glb',async gltf=>{
   try{
     $('loadLabel').textContent='正在載入車庫賽車模型…';
     const [fire,randoll,superAsurada]=await Promise.all([loader.loadAsync('./assets/fire-superion-gtr.glb'),loader.loadAsync('./assets/randoll-01.glb'),loader.loadAsync('./assets/super-asurada-01.glb')]);
     vehicleTemplates.set('asurada-gsx',optimiseCar(gltf.scene));vehicleTemplates.set('fire-superion-gtr',prepareFireSuperion(fire.scene));vehicleTemplates.set('randoll-01',prepareRandoll(randoll.scene));vehicleTemplates.set('super-asurada-01',prepareSuperAsurada(superAsurada.scene));
     RIVALS.forEach(spec=>vehicleTemplates.set(spec.id,buildRival(spec)));
     for(const template of vehicleTemplates.values())template.root.traverse(o=>{if(o.geometry)sharedVehicleGeometry.add(o.geometry);});
     useSoloVehicle();botVisuals=RIVALS.map(spec=>spawnVehicle(spec.id));
     $('rivalGrid').innerHTML='<div class="grid-title">RIVAL GRID / 同場車款</div>'+RIVALS.map(spec=>`<div class="rival-row"><i style="background:#${spec.color.toString(16).padStart(6,'0')}"></i><b>${spec.name}</b><span>${spec.type}</span></div>`).join('');
     // The source meshes share buffers only after the retained model is baked.
     gltf.scene.traverse(o=>{if(o.isMesh)o.geometry.dispose();});fire.scene.traverse(o=>{if(o.isMesh)o.geometry.dispose();});randoll.scene.traverse(o=>{if(o.isMesh)o.geometry.dispose();});superAsurada.scene.traverse(o=>{if(o.isMesh)o.geometry.dispose();});
     resetRace(false);loaded=true;$('start').disabled=false;$('loadLabel').textContent='單人出賽 / SOLO RACE';ai('同步完成。'+vehicleById(selectedVehicle).name+' 已準備就緒，隨時可以出發。');
     const params=new URLSearchParams(location.search);if(params.has('room')||params.has('multiplayer'))openOnline();
   }catch(e){fail(e);}
 },e=>{if(e.total)$('loadLabel').textContent=`正在載入 GSX 模型 ${Math.round(e.loaded/e.total*100)}%`;},fail);
 requestAnimationFrame(frame);
}
function resetRace(start=true){
 if(mode!=='online'){useSoloVehicle();onlineVisuals.forEach(v=>v.root.visible=false);}
 [playerVisual,...botVisuals].forEach(v=>{if(v)v.root.visible=mode!=='online';});
 const pace=mode==='campaign'?currentStage().pace:1;
 player=createCar(track,0,-2.5);bots=botVisuals.map((v,i)=>Object.assign(createCar(track,9+i*8,i%2?-2.7:2.7),{modelId:v.spec.id,length:v.dimensions.length,width:v.dimensions.width,speedModifier:v.spec.speed*pace,accelerationModifier:v.spec.acceleration*Math.sqrt(pace),finishTime:null}));
 player.vehicleId=selectedVehicle;player.pitRequired=mode==='campaign'&&currentStage().pits>0;
 driverInput.reset();lastControls={throttle:0,brake:0,steer:0};resetLapTelemetry();
 lastDamageWarning=0;
 elapsed=0;lapNumber=0;lastLapAt=0;bestLap=Infinity;accumulator=0;finishPosition=0;keys.clear();driverInput.reset();lastControls={throttle:0,brake:0,steer:0};camMode='chase';
 $('results').classList.add('hidden');$('pausePanel').classList.add('hidden');$('menu').classList.toggle('hidden',start);
 $('nextStage').classList.add('hidden');
 for(const id of ['raceHUD','telemetry','boostHUD','damageHUD','pitHUD','missionHUD','driverHUD'])$(id).classList.toggle('hidden',!start);
 $('rivalGrid').classList.toggle('hidden',start);
 document.body.classList.toggle('racing',start);$('countdown').classList.toggle('hidden',!start);
 phase=start?'countdown':'menu';count=3.5;syncVisuals(0);updateCamera(1,true);updateHUD();if(start){audioStart();ai(`${track.meta.name}，${track.open?'起點至終點賽段':raceLaps+' 圈競速'}。${mode==='campaign'?currentStage().goal:'入彎前減速，直路再開推進器。'}`);}
}
function start(){if(!loaded)return;if(mode==='online'){returnToMenu();return;}if(mode==='campaign'&&stageIndex>=unlockedCount(save))return;resetRace(true);}
$('start').addEventListener('click',start);$('restart').addEventListener('click',start);$('raceAgain').addEventListener('click',start);
$('campaignMode').onclick=()=>{if(!loaded)return;mode='campaign';prepareRace();};
 $('freeMode').onclick=()=>{if(!loaded)return;mode='free';if(courseById(freeCourse).open)freeCourse='seaside';prepareRace();};
 $('hkMode').onclick=()=>{if(!loaded)return;mode='free';if(!courseById(freeCourse).open)freeCourse=COURSES.find(c=>c.open).id;prepareRace();};
 $('urbanReference').onclick=()=>{location.href=`./urban-reference.html?course=${encodeURIComponent(track.id)}`;};
$('stageSelect').onclick=e=>{const b=e.target.closest('[data-stage]');if(!loaded||!b||b.disabled)return;stageIndex=Number(b.dataset.stage);prepareRace();};
$('courseSelect').onclick=e=>{const b=e.target.closest('[data-course]');if(!loaded||!b)return;freeCourse=b.dataset.course;prepareRace();};
$('pauseMenu').onclick=returnToMenu;$('resultMenu').onclick=returnToMenu;
$('nextStage').onclick=()=>{if(mode!=='campaign'||stageIndex>=STAGES.length-1||stageIndex+1>=unlockedCount(save))return;stageIndex++;prepareRace();start();};
function togglePause(){
 if(mode==='online'&&onlineState){if(onlineState.phase==='racing'||onlineState.phase==='countdown'){netPaused=!netPaused;keys.clear();driverInput.reset();lastControls={throttle:0,brake:0,steer:0};$('pausePanel').classList.toggle('hidden',!netPaused);$('pausePanel').querySelector('p').textContent='只暫停你的操控；連線比賽及其他車手仍然繼續。';}return;}
 if(phase==='paused'){phase=pausedFrom;$('pausePanel').classList.add('hidden');}
 else if(phase==='racing'||phase==='countdown'){pausedFrom=phase;phase='paused';keys.clear();driverInput.reset();lastControls={throttle:0,brake:0,steer:0};$('pausePanel').classList.remove('hidden');}
}
$('pause').onclick=togglePause;$('resume').onclick=togglePause;
function changeCamera(){const modes=playerVehicleId()!=='asurada-gsx'?['chase','far']:['chase','cockpit','far'];camMode=modes[(modes.indexOf(camMode)+1)%modes.length];notice({chase:'追車視角',cockpit:'駕駛艙視角',far:'遠距離追車'}[camMode]);updateCamera(1,true);}
function fullScreen(){if(!document.fullscreenElement)document.documentElement.requestFullscreen?.().catch(()=>notice('瀏覽器未能啟用全螢幕'));else document.exitFullscreen?.();}
$('fullscreen').onclick=fullScreen;$('quality').onclick=()=>{quality=(quality+1)%3;setQuality();};
$('assist').onclick=()=>{throttleAssist=!throttleAssist;$('assist').textContent='油門輔助 '+(throttleAssist?'ON':'OFF');notice(throttleAssist?'油門輔助已開啟 · 請自行轉向和煞車':'油門輔助已關閉');};
$('sound').onclick=()=>{sound=!sound;$('sound').textContent='聲音 '+(sound?'ON':'OFF');if(sound)audioStart();};
$('drivingProfile').onchange=()=>{drivingProfile=$('drivingProfile').value==='direct'?'direct':'smooth';saveDrivingSettings();};
$('guideToggle').onclick=()=>{guideEnabled=!guideEnabled;saveDrivingSettings();notice(guideEnabled?'煞車導線開啟 · 綠色加速 / 黃色收油 / 紅色煞車':'煞車導線關閉');};
drivingSettingsUI();
window.addEventListener('keydown',e=>{
 if(['SELECT','INPUT','TEXTAREA'].includes(e.target.tagName))return;
 if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code))e.preventDefault();
 keys.add(e.code);if(e.repeat)return;
 if(e.code==='KeyP'||e.code==='Escape')togglePause();
 if(e.code==='KeyC'&&loaded)changeCamera();
 if(e.code==='KeyL')$('guideToggle').click();
 if(e.code==='KeyR'&&phase==='racing'&&!player.retired){if(mode==='online'){room.send({type:'reset'});notice('申請回正 · 成功後加罰三秒');}else if(resetCar(player,track)){elapsed+=3;lapTelemetry?.invalidate('回正');notice('賽車已回正 · +3 秒 · 損傷保留');}else notice('維修進行中，請等候完成');}
 if(e.code==='KeyM')$('sound').click();if(e.code==='KeyF')fullScreen();
 if(e.code==='Enter'&&phase==='menu')start();
});
window.addEventListener('keyup',e=>keys.delete(e.code));
window.addEventListener('blur',()=>{keys.clear();driverInput.reset();lastControls={throttle:0,brake:0,steer:0};if(phase==='racing'||phase==='countdown'){if(mode==='online'&&netPaused)return;togglePause();}});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&(phase==='racing'||phase==='countdown')){if(mode==='online'&&netPaused)return;togglePause();}});
for(const b of document.querySelectorAll('[data-key]')){
 b.addEventListener('pointerdown',e=>{e.preventDefault();b.setPointerCapture(e.pointerId);keys.add(b.dataset.key);});
 for(const ev of ['pointerup','pointercancel','lostpointercapture'])b.addEventListener(ev,()=>keys.delete(b.dataset.key));
}
function input(dt=1/120){lastControls=driverInput.step(keys,padState,player.speed,dt,{profile:drivingProfile,assist:throttleAssist});return lastControls;}
function simulate(dt){
 if(mode==='online'&&onlineState){
   if(onlineState.phase==='countdown'){$('countdown').textContent=Math.ceil(Math.max(0,onlineState.count))||'GO';world.signal.forEach((o,i)=>o.material.color.setHex(i>=5-Math.ceil(onlineState.count)?0xef4b4b:0x293e4c));}
   const controls=!netPaused&&!netResultShown&&onlineState.phase==='racing'&&!document.hidden?input(dt):{throttle:0,brake:1,steer:0,boost:false};
   lastControls=controls;
   if(onlineState.phase==='racing'&&!netResultShown)stepCar(player,controls,track,dt);
   netSendTime+=dt;if(netSendTime>=1/30){netSendTime=0;room.controls(controls);}
   return;
 }
 if(phase==='countdown'){
   count-=dt;const number=Math.ceil(count-.5);$('countdown').textContent=number>0?number:'GO';
   world.signal.forEach((o,i)=>o.material.color.setHex(number<=0?0xb6ff54:(i>=5-number?0xef4b4b:0x293e4c)));
   if(count<=0){phase='racing';$('countdown').classList.add('hidden');ai('走！直路可以開推進器，但記住留意第一個彎。');}return;
 }
 if(phase!=='racing')return;
 elapsed+=dt;
 const wasServicing=!!player.pitService,previousVisits=player.pitVisits;
 const outcome=stepCar(player,input(dt),track,dt);
 bots.forEach((b,i)=>{if(!track.open||b.finishTime===null)stepCar(b,botInput(b,track,i,[player,...bots]),track,dt);});
 resolveCarContacts([player,...bots.filter(b=>!track.open||b.finishTime===null)]);
 advanceLapTelemetry(outcome.wrongWay);
 bots.forEach(b=>{if(!b.retired&&b.finishTime===null&&raceFinished(b,track,raceLaps)){b.finishTime=elapsed;if(track.open){b.finished=true;b.speed=0;b.boosting=false;}}});
 if(player.retired){retireRace();return;}
 if(!wasServicing&&player.pitService){notice('PIT 維修開始 · 比賽計時繼續');ai('維修隊開始工作。先停喺格內，修好再出發。');}
 if(player.pitService)lastDamageWarning=Math.min(lastDamageWarning,player.damage);
 if(player.pitVisits>previousVisits){lastDamageWarning=0;notice('維修完成 · 車況及推進器 100%');ai('車輛已修復，推進器補滿。沿 PIT 車道駛離後再加速。');}
 if(!player.pitService&&player.damage-lastDamageWarning>=8){lastDamageWarning=player.damage;notice(`碰撞受損 · 車況 ${Math.ceil(100-player.damage)}%`);ai(player.damage>=65?'車架嚴重受損，推進器已停用。再有重撞可能要退賽。':'碰撞令車輛受損，動力同最高速度已下降。回正唔會修復損傷。');}
 const completed=track.open?(raceFinished(player,track,1)?1:0):Math.floor(Math.max(0,player.progress)/track.length);
 if(completed>lapNumber){const lapTime=elapsed-lastLapAt;lastLapAt=elapsed;lapNumber=completed;player.lapTimes.push(lapTime);bestLap=Math.min(bestLap,lapTime);if(completed>=raceLaps){finish();return;}notice(`第 ${completed+1} 圈 / ${raceLaps} · 上圈 ${formatTime(lapTime)}`);ai(completed===raceLaps-1?'最後一圈。留意通關目標，將推進器留喺直路。':'完成一圈，繼續保持。');}
 if(aiTimer<=0){
   if(player.pitService){ai('維修進行中，保持停車。賽事計時同其他車輛仍然繼續。');}
   else if(player.pitCompleted){ai('維修完成。沿 PIT 車道駛離，返主賽道先再開推進器。');}
   else if(player.inPit){ai('PIT 內限速六十。靠右駛入綠色維修格，煞車停穩。');}
   else if(outcome.wrongWay){ai('方向相反。按 R 回正，再跟住賽道前進。');}
   else if(player.collision>0){ai('留意碰撞，收少少油，先穩住車身。');}
   else if(track.curvature(player.lastS+player.speed*.7)>.012&&player.speed>55){ai('前方急彎。提早煞車，出彎再加速。');}
   else if(player.boosting){ai('推進器啟動。保持直線，留意能量。');}
   else if(player.offroad){ai('賽車壓住路肩，返返賽道中心。');}
 }
}
function onlineOrder(){return [...onlineState.players].sort((a,b)=>{if(a.finishTime!==null||b.finishTime!==null)return a.finishTime===null?1:b.finishTime===null?-1:a.finishTime-b.finishTime;if(a.car.retired!==b.car.retired)return a.car.retired?1:-1;return b.car.progress-a.car.progress;});}
function position(){if(mode==='online'&&onlineState)return onlineOrder().findIndex(p=>p.id===room.playerId)+1;return 1+bots.filter(b=>!b.retired&&(b.finishTime!==null||b.progress>player.progress)).length;}
function retireRace(){
 phase='retired';keys.clear();driverInput.reset();lastControls={throttle:0,brake:0,steer:0};player.boosting=false;
 $('resultEyebrow').textContent='RACE CONTROL / RETIREMENT';
 $('resultPosition').textContent='DNF';$('resultTitle').textContent='RETIRED / 損毀退賽';$('resultTime').textContent=formatTime(elapsed);$('resultLap').textContent=formatTime(bestLap);
 $('recordNote').textContent='車輛已無法繼續作賽。本場不計完成紀錄；重新開始會換上完好賽車。';
 $('nextStage').classList.add('hidden');
 $('results').classList.remove('hidden');ai('車輛損毀達到上限，必須退賽。安全第一，今場到此為止。');
}
function finish(){
 phase='finished';finishPosition=position();player.finished=true;
 $('resultEyebrow').textContent='CHEQUERED FLAG';
 $('resultPosition').textContent='P'+finishPosition;$('resultTitle').textContent=finishPosition===1?'VICTORY / 優勝':'FINISH / 完成賽事';$('resultTime').textContent=formatTime(elapsed);$('resultLap').textContent=formatTime(bestLap);
 if(mode==='campaign'){
   const result={finished:true,retired:false,laps:lapNumber,position:finishPosition,health:100-player.damage,pitVisits:player.pitVisits,time:elapsed};
   const evaluation=evaluateStage(currentStage(),result),completed=completeStage(save,stageIndex,result);
   if(completed.passed){save=completed.save;writeStored('gsx-campaign-v1',save);$('resultEyebrow').textContent='MISSION CLEAR';$('resultTitle').textContent=stageIndex===STAGES.length-1?'CHAMPION / 全關制霸':'STAGE CLEAR / 關卡通過';$('recordNote').textContent=stageIndex===STAGES.length-1?'六關全部完成！可返回選單重玩任何關卡。':`通過「${currentStage().name}」，第 ${stageIndex+2} 關已解鎖。`;$('nextStage').classList.toggle('hidden',stageIndex===STAGES.length-1);}
   else{$('resultEyebrow').textContent='MISSION INCOMPLETE';$('resultTitle').textContent='再接再厲 / 未達目標';$('recordNote').textContent=`已完成賽事，仍需：${evaluation.missing.join('、')}。重跑本關再挑戰。`;}
 }else{
   const isRecord=!record||elapsed<record.time;if(isRecord){record={time:elapsed,bestLap,position:finishPosition};records[track.id]=record;writeStored('gsx-race-records-v2',records);}
   $('recordNote').textContent=isRecord?`刷新${track.meta.name}${track.open?'賽段':'三圈'}個人最佳紀錄。`:'賽事完成。下一場挑戰更快嘅時間。';
 }
 if(!saveAvailable)$('recordNote').textContent+=' 瀏覽器未能儲存；本次開啟期間仍可繼續闖關。';
 record=personalRecord();$('best').textContent=record?formatTime(record.time):'尚未完成本場';
 $('results').classList.remove('hidden');keys.clear();driverInput.reset();lastControls={throttle:0,brake:0,steer:0};ai('到達終點。請查看賽事成績同關卡目標。');
}
function syncVisuals(time){
 if(!playerVisual)return;
 [player,...bots].forEach((car,i)=>{
   const v=mode==='online'&&onlineState?onlineVisuals.get(i===0?room.playerId:car.netId):i===0?playerVisual:botVisuals[i-1];if(!v)return;if(mode==='online'&&phase!=='menu'){v.root.position.lerp(new THREE.Vector3(car.x,.065,car.z),.4);v.root.rotation.y+=angleDelta(car.yaw,v.root.rotation.y)*.4;}else{v.root.position.set(car.x,.065,car.z);v.root.rotation.y=car.yaw;}
   v.visual.rotation.z=-car.steer*Math.min(car.speed/80,1)*.023;
   v.visual.position.y=(phase==='racing'?Math.sin(time*35)*.004*car.speed/80:0);
   for(const f of v.flames){f.visible=car.boosting;f.scale.y=.75+.25*Math.sin(time*57);}
   updateDamageEffects(v,car,time);
 });
 for(const mesh of playerVehicleVisual()?.visual.children||[])if(/smoked.*canopy/i.test(mesh.material.name))mesh.visible=camMode!=='cockpit'||playerVehicleId()!=='asurada-gsx';
 world.pit.update(player,time);
}
function updateCamera(dt,snap=false){
 if(!playerVisual)return;
 const f=new THREE.Vector3(Math.sin(player.yaw),0,Math.cos(player.yaw)),r=new THREE.Vector3(f.z,0,-f.x),p=new THREE.Vector3(player.x,0,player.z);
 let fov=56;
 if(phase==='menu'){
   camDesired.copy(p).addScaledVector(f,9.5).addScaledVector(r,11.5);camDesired.y=5.5;
   lookDesired.copy(p).addScaledVector(r,-4.5);lookDesired.y=.8;
 }else if(camMode==='cockpit'){
   camDesired.copy(p).addScaledVector(f,-.19).addScaledVector(r,.255);camDesired.y=1.10;
   lookDesired.copy(p).addScaledVector(f,35);lookDesired.y=1.8;fov=78;
 }else{
   const back=camMode==='far'?14:camMode==='near'?6.7:9.4;
   const height=camMode==='far'?6.5:camMode==='near'?2.8:3.8;
   camDesired.copy(p).addScaledVector(f,-back-(player.boosting?1.6:0)).addScaledVector(r,-player.steer*.30);camDesired.y=height;
   lookDesired.copy(p).addScaledVector(f,9+player.speed*.08);lookDesired.y=1.0;
   fov=56+player.speed*.10+(player.boosting?4:0);
 }
 const response=camMode==='cockpit'?1:snap?1:1-Math.exp(-7*dt);
 camera.position.lerp(camDesired,response);
 matrix.lookAt(camDesired,lookDesired,up);quatTarget.setFromRotationMatrix(matrix);camera.quaternion.slerp(quatTarget,response);
 camera.fov+=(fov-camera.fov)*(snap?1:1-Math.exp(-5*dt));camera.updateProjectionMatrix();
}
function updateDriverHUD(){
 if(!brakeGuide)return;
 const advice=guideAdvice(brakeGuide,player),lap=lapTelemetry?.snapshot(player.progress,elapsed);
 $('coachCue').dataset.state=advice.state;$('coachAction').textContent=guideEnabled?advice.label:'導線已關閉';
 $('coachSpeed').textContent=guideEnabled?Math.round(advice.target*3.6)+' km/h':'L 開啟';
 $('coachDetail').textContent=!guideEnabled?'按 L 顯示路面煞車導線':player.inPit?'依 PIT 車道入站，停穩後維修':advice.corner?`${advice.corner.direction} · 前方 ${advice.corner.distance} m · 彎中參考 ${Math.round(advice.corner.speed*performanceForDamage(player.damage).speed*3.6)} km/h`:'前方路段較直 · 留意其他賽車';
 $('currentLapTime').textContent=lap?formatTime(lap.elapsed):'連線賽事';
 $('lapDelta').textContent=!lap?'—':lap.invalid?(track.open?'本段無效':'本圈無效'):lap.delta===null?'建立個人基準':`${lap.delta>=0?'+':'−'}${Math.abs(lap.delta).toFixed(3)} s`;
 $('lapDelta').dataset.pace=lap?.invalid?'invalid':lap?.delta<0?'faster':lap?.delta>0?'slower':'neutral';
 $('lapReference').textContent=!lap?'分段紀錄限單人':lap.invalid?lap.invalid+' · 不寫入新紀錄':lap.best?'同車最佳 '+formatTime(lap.best):track.open?'完成有效賽段後保存基準':'完成有效一圈後保存基準';
 for(let i=0;i<3;i++){
  const el=$('split'+(i+1)),time=lap?.splits[i],best=lapTelemetry?.best?.sectors[i];
  el.textContent=Number.isFinite(time)?time.toFixed(2):'—';el.dataset.pace=Number.isFinite(time)&&Number.isFinite(best)?(time<=best?'faster':'slower'):'neutral';
 }
 $('throttleMeter').style.transform=`scaleX(${lastControls.throttle||0})`;$('brakeMeter').style.transform=`scaleX(${lastControls.brake||0})`;
 $('steerMeter').style.left=`${50-(lastControls.steer||0)*45}%`;
 $('driverSource').textContent=inputSource+' · '+(drivingProfile==='smooth'?'漸進操控':'直接操控');
}
function updateHUD(){
 updateDriverHUD();
 const speed=Math.round(player.speed*3.6);$('speed').textContent=String(speed).padStart(3,'0');$('gear').textContent=speed<2?'N':String(Math.min(6,Math.floor(speed/57)+1));
 $('position').innerHTML=`${finishPosition||position()}<small>/ ${mode==='online'?(onlineState?.players.length||1):5}</small>`;$('lap').innerHTML=track.open?`${Math.min(100,Math.floor(Math.max(0,player.progress)/track.length*100))}<small>%</small>`:`${String(Math.min(raceLaps,lapNumber+1)).padStart(2,'0')} <small>/ ${String(raceLaps).padStart(2,'0')}</small>`;
 $('raceGoal').textContent=track.open?`${track.meta.startName} → ${track.meta.endName} · 餘下 ${(Math.max(0,track.length-player.progress)/1000).toFixed(2)} km${mode==='online'?' · '+(onlineState?.players.length||1)+' 名真人':''}`:mode==='campaign'?`${currentStage().goal}${currentStage().pits?` PIT ${player.pitVisits} / ${currentStage().pits}`:''}`:mode==='online'?`${onlineState?.players.length||1} 名真人 · ${room.latency} ms · ${raceLaps} 圈 · 比賽不會暫停`:'完成三圈，挑戰個人紀錄。';
 $('time').textContent=formatTime(elapsed);$('bestLap').textContent=formatTime(track.open?(record?.time??Infinity):bestLap);$('boostPct').textContent=Math.round(player.boost)+'%';$('boostFill').style.transform=`scaleX(${player.boost/100})`;
 $('boostLabel').textContent=player.boosting?'BOOST ENGAGED':'BOOST SYSTEM';$('boostFX').style.opacity=player.boosting?1:0;$('rpm').style.transform=`scaleX(${.15+.85*((speed%57)/57)})`;
 const integrity=Math.max(0,Math.ceil(100-player.damage)),perf=performanceForDamage(player.damage),status=player.retired?'損毀退賽':player.damage>=65?'嚴重受損':player.damage>=35?'性能下降':player.damage>=.5?'輕度受損':'車況正常';
 $('integrity').textContent=integrity+'%';$('damageStatus').textContent=status;$('healthFill').style.transform=`scaleX(${integrity/100})`;
 $('damageHUD').dataset.level=player.damage>=65?'critical':player.damage>=35?'warning':'normal';
 $('performance').textContent=player.retired?'動力 0% · 無法繼續作賽':`動力 ${Math.round(perf.acceleration*100)}% · 極速 ${Math.round(CONFIG.maxSpeed*perf.speed*3.6)} km/h`;
 $('boostAvailability').textContent=player.retired?'引擎停機':player.pitService?'維修中 · 引擎停機':player.inPit?'PIT 限速 · 推進器暫停':!perf.boostAvailable?'推進器損壞 · 已停用':'推進器可用';
 const pit=getPitState(player,track),service=player.pitService;
 $('pitHUD').dataset.state=service?'working':player.pitCompleted?'done':pit.inLane?'inside':'outside';
 $('pitState').textContent=player.retired?'DNF · 無法維修':service?'維修中':player.pitCompleted?'維修完成':pit.inLane?'PIT · 限速 60':'PIT 維修站';
 $('pitDetail').textContent=player.retired?'已退賽車輛不能復活':service?`剩餘 ${Math.max(0,service.duration-service.elapsed).toFixed(1)} 秒 · 保持停車`:player.pitCompleted?'車況 100% · 沿車道駛離':pit.inBay&&!pit.aligned?'將車頭轉向 PIT 出口方向':pit.inBay&&pit.stopped&&player.damage<.1&&player.boost>=99?'車況完好，可以出站':pit.inLane?'駛入右側綠格，煞車停穩':track.open&&player.lastS>PIT.exit?'已駛過起點 PIT · 本段無下一圈':`右側入口 · 前方 ${Math.ceil(wrap(PIT.entry-player.lastS,track.length))} m`;
 $('pitProgress').style.transform=`scaleX(${service?service.elapsed/service.duration:player.pitCompleted?1:0})`;
 if(!perf.boostAvailable)$('boostLabel').textContent='BOOST OFFLINE';
 if(player.inPit)$('boostLabel').textContent=service?'PIT SERVICE':'PIT LIMITER';
 $('impactFX').style.opacity=player.collision>.18?Math.min(.55,player.lastImpact/120):0;
 if(player.retired)$('gear').textContent='—';
 $('sector').textContent=phase==='menu'?'READY TO RACE':`SECTOR ${1+Math.floor(player.lastS/track.length*3)}`;
}
function updateDebugMetrics(){if(debug)$('debugMetrics').textContent=JSON.stringify({seed,phase,course:track.id,mode,vehicle:playerVehicleId(),onlineCars:onlineState?.players.map(p=>({id:p.id,vehicleId:p.vehicleId,x:Number(p.car.x.toFixed(2)),z:Number(p.car.z.toFixed(2))})),stage:stageIndex+1,laps:raceLaps,routeType:track.open?'point-to-point':'circuit',sourceWaypoints:track.meta.sourcePoints||0,unlocked:unlockedCount(save),camera:camMode,fps:Math.round(fps),renderFrame:renderer.info.render.frame,drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,meshesPerCar:playerVehicleVisual()?.meshCount,damage:Math.round(player.damage),pitService:!!player.pitService,pitVisits:player.pitVisits,rivalModels:RIVALS.map(s=>s.id),retiredRivals:bots.filter(b=>b.retired).length,drivingProfile,inputSource,controls:lastControls,guide:{enabled:guideEnabled,visible:guideVisual?.mesh.visible,arrows:guideVisual?.mesh.count,advice:brakeGuide?guideAdvice(brakeGuide,player):null},lapTelemetry:lapTelemetry?{...lapTelemetry.snapshot(player.progress,elapsed),last:lapTelemetry.last?{duration:lapTelemetry.last.duration,valid:lapTelemetry.last.valid}:null}:null,postProcessing:false,errors},null,2);}
const mini=$('minimap').getContext('2d');
function mapPoint(x,z){return[220+(x-miniFit.x)*miniFit.scale,145+(z-miniFit.z)*miniFit.scale];}
function drawMap(){
 mini.clearRect(0,0,440,290);mini.lineWidth=6;mini.strokeStyle='#90adbf40';mini.beginPath();track.points.forEach((p,i)=>{const [x,y]=mapPoint(p.x,p.z);if(!i)mini.moveTo(x,y);else mini.lineTo(x,y);});if(!track.open)mini.closePath();mini.stroke();
 mini.lineWidth=1;mini.strokeStyle='#9ac5d15a';mini.stroke();
 mini.strokeStyle='#6ce9ff';mini.lineWidth=3;mini.beginPath();for(let s=PIT.entry;s<=PIT.exit;s+=2){const p=track.at(s,pitLaneOffset(s)),[x,y]=mapPoint(p.x,p.z);if(s===PIT.entry)mini.moveTo(x,y);else mini.lineTo(x,y);}mini.stroke();
 const pitBay=track.at(PIT.bay,PIT.bayOffset),[bayX,bayY]=mapPoint(pitBay.x,pitBay.z);mini.fillStyle='#6ce9ff';mini.fillRect(bayX-3,bayY-3,6,6);
 for(const [car,color,size] of [...bots.map((b,i)=>[b,b.retired?'#5c6570':vehicleById(mode==='online'?b.vehicleId:b.modelId).color,4]),[player,player.retired?'#ff765d':'#d4ff54',6]]){const [x,y]=mapPoint(car.x,car.z);mini.fillStyle=color;mini.beginPath();mini.arc(x,y,size,0,Math.PI*2);mini.fill();}
 const start=track.at(0),[x,y]=mapPoint(start.x,start.z);mini.fillStyle='#ebf6ff';mini.fillRect(x-2,y-5,4,10);
 if(track.open){const end=track.at(track.length),[ex,ey]=mapPoint(end.x,end.z);mini.fillStyle='#ff7967';mini.fillRect(ex-4,ey-4,8,8);mini.fillStyle='#d4ff54';mini.fillRect(x-3,y-3,6,6);}
}
let audioCtx,oscillator,oscillator2,engineGain,filter;
function audioStart(){
 if(!sound)return;
 if(!audioCtx){audioCtx=new AudioContext();engineGain=audioCtx.createGain();engineGain.gain.value=0;filter=audioCtx.createBiquadFilter();filter.type='lowpass';filter.frequency.value=700;filter.connect(engineGain);engineGain.connect(audioCtx.destination);
   oscillator=audioCtx.createOscillator();oscillator.type='sawtooth';oscillator.frequency.value=55;oscillator.connect(filter);oscillator.start();
   oscillator2=audioCtx.createOscillator();oscillator2.type='triangle';oscillator2.frequency.value=110;oscillator2.connect(filter);oscillator2.start();
 }audioCtx.resume().catch(()=>{});
}
function audioUpdate(){if(!audioCtx)return;const active=sound&&(phase==='racing'||phase==='countdown');engineGain.gain.setTargetAtTime(active?.028:0,audioCtx.currentTime,.12);const gear=Math.max(1,Math.min(6,Math.floor(player.speed*3.6/57)+1)),rev=player.speed*3.6-(gear-1)*57;oscillator.frequency.setTargetAtTime(45+rev*1.8+(player.boosting?22:0),audioCtx.currentTime,.08);oscillator2.frequency.setTargetAtTime(90+rev*3.6,audioCtx.currentTime,.08);}
function frame(now){
 requestAnimationFrame(frame);const rawDT=(now-lastFrame)/1000||.016,dt=Math.min(.05,rawDT);lastFrame=now;
 if(loaded){
   pollGamepad();
   accumulator+=dt;while(accumulator>=1/120){simulate(1/120);accumulator-=1/120;}
   aiTimer-=dt;noticeTimer-=dt;if(noticeTimer<=0)$('notice').classList.add('hidden');
   syncVisuals(now/1000);updateCamera(dt);updateHUD();drawMap();audioUpdate();guideVisual?.update(player,guideEnabled&&(phase==='racing'||phase==='countdown'||phase==='paused'));
 }
 if(world?.sky)world.sky.position.copy(camera.position);
 renderer.render(scene,camera);if(loaded)updateDebugMetrics();frameCounter++;frameAccum+=rawDT;
 if(frameAccum>=.7){fps=frameCounter/frameAccum;frameAccum=0;frameCounter=0;$('perf').textContent=phase==='menu'&&!debug?'GSX-07 · WEBGL':`${Math.round(fps)} FPS · ${camMode==='cockpit'?'COCKPIT':'GSX-07'} · WEBGL`;}
}
window.addEventListener('resize',resize);
function openOnline(){
 if(!loaded)return;$('onlinePanel').classList.remove('hidden');$('onlineName').value=readStored('gsx-player-name')||'';$('onlineVehicle').value=selectedVehicle;
 updateConnectionScope(room.id?room.origin:location.origin);
 const code=new URLSearchParams(location.search).get('room');if(code)$('roomCode').value=code;
}
function updateConnectionScope(origin){
 const scope=connectionScope(origin);$('connectionScope').dataset.scope=scope;
 $('connectionScope').textContent=scope==='local'?'同一部電腦測試 / LOCAL ONLY':scope==='lan'?'同一區域網絡 / LAN':'互聯網朋友連線 / ONLINE';
 $('connectionHelp').textContent=scope==='local'?'此網址只供同一部電腦的兩個瀏覽器測試。遠方朋友需要房主提供公開遊戲網址。':scope==='lan'?'此網址供同一 Wi-Fi 或區域網絡使用。遠方朋友需要公開遊戲網址。':'朋友須開啟同一個邀請連結並加入房間；兩邊按「單人出賽」不會連線。';
 $('copyInvite').textContent=scope==='local'?'複製同機連結':'複製邀請';
}
async function joinOnline(create){
 if(!loaded)return;
 $('inviteDestination').classList.add('hidden');
 let code=$('roomCode').value.trim();
 if(!create){try{const invite=parseRoomInvite(code,location.origin);code=invite.code;if(invite.target){$('inviteDestination').href=invite.target;$('inviteDestination').textContent='開啟房主的遊戲網址 →';$('inviteDestination').classList.remove('hidden');$('onlineStatus').textContent='這個房間位於另一個網址。請先開啟房主的遊戲網址，再輸入名稱加入。';return;}}catch(error){$('onlineStatus').textContent=error.message;return;}}
 try{const response=await fetch('./api/config',{signal:AbortSignal.timeout(7000)});if(!response.ok||!(await response.json()).multiplayer)throw Error();}catch{$('onlineStatus').textContent='連線伺服器未就緒。請確認房主仍開著遊戲服務，並使用最新的邀請網址。';return;}
 const name=$('onlineName').value.trim().slice(0,16);writeStored('gsx-player-name',name);$('onlineStatus').textContent='正在連線…';room.connect({room:create?'create':code,name,course:track.id,vehicleId:$('onlineVehicle').value});
}
function onRoomJoined(){
 mode='online';onlineState=null;netRevision=-1;netResultShown=false;lobbySignature='';
 $('connectionForm').classList.add('hidden');$('roomLobby').classList.remove('hidden');$('inviteLink').value=room.invite;
 updateConnectionScope(room.origin);$('inviteHint').textContent=connectionScope(room.origin)==='local'?'這條連結只能在同一部電腦開啟，不能傳給遠方朋友。':'將完整邀請連結傳給朋友；房主電腦、伺服器及分享連線需要保持開啟。';
 const url=new URL(location.href);url.searchParams.set('room',room.id);history.replaceState(null,'',url);$('onlineStatus').textContent='已加入房間。請等候朋友入場，然後各自按準備。';
}
function onRoomState(state){
 const previous=onlineState;onlineState=state;const me=state.players.find(p=>p.id===room.playerId);if(!me)return;
 for(const p of state.players){p.vehicleId=validVehicle(p.vehicleId)?p.vehicleId:vehicleForSlot(p.slot);let v=onlineVisuals.get(p.id);if(v?.vehicleId!==p.vehicleId){if(v)disposeVehicle(v,sharedVehicleGeometry);v=spawnVehicle(p.vehicleId);onlineVisuals.set(p.id,v);}v.root.visible=true;}
 const present=new Set(state.players.map(p=>p.id));for(const [id,v]of onlineVisuals)if(!present.has(id)){disposeVehicle(v,sharedVehicleGeometry);onlineVisuals.delete(id);}
 [playerVisual,...botVisuals].forEach(v=>v.root.visible=false);
 if(selectedVehicle!==me.vehicleId){selectedVehicle=me.vehicleId;writeStored('gsx-vehicle-v1',selectedVehicle);if(camMode==='cockpit'&&selectedVehicle!=='asurada-gsx')camMode='chase';}
 const changed=track.id!==state.course;if(changed){disposeWorld();track=makeTrack(900,state.course);world=buildWorld(scene,track,seed);buildDrivingGuide();}
 const racing=state.phase==='countdown'||state.phase==='racing';
 if(racing&&state.revision!==netRevision){netRevision=state.revision;resetRace(true);netPaused=false;netResultShown=false;lapNumber=0;lastLapAt=0;bestLap=Infinity;$('onlinePanel').classList.add('hidden');$('restart').classList.add('hidden');}
 if(state.phase==='lobby'&&(phase!=='menu'||changed)){resetRace(false);netResultShown=false;netPaused=false;$('onlinePanel').classList.remove('hidden');}
 if(!previous||changed||previous.laps!==state.laps)menuInfo();raceLaps=state.laps;
 if(racing){
   if(!netResultShown)phase=state.phase;
   $('countdown').classList.toggle('hidden',state.phase!=='countdown');
   if(state.phase==='racing')world.signal.forEach(o=>o.material.color.setHex(0xb6ff54));
 }
 const serverCar=me.car,dx=serverCar.x-player.x,dz=serverCar.z-player.z,blend=racing&&!serverCar.pitService&&Math.hypot(dx,dz)<8?.55:1;
 const x=player.x+dx*blend,z=player.z+dz*blend,yaw=player.yaw+angleDelta(serverCar.yaw,player.yaw)*blend;
 player={...serverCar,damageZones:{...serverCar.damageZones},x,z,yaw,modelSlot:me.slot,vehicleId:me.vehicleId};
 const others=state.players.filter(p=>p.id!==room.playerId);bots=others.map(p=>({...p.car,damageZones:{...p.car.damageZones},netName:p.name,netId:p.id,modelSlot:p.slot,vehicleId:p.vehicleId,finishTime:p.finishTime}));
 elapsed=me.finishTime??state.elapsed+me.penalty;
 const completed=track.open?(raceFinished(serverCar,track,1)?1:0):Math.floor(Math.max(0,serverCar.progress)/track.length);
 if(completed>lapNumber){bestLap=Math.min(bestLap,state.elapsed-lastLapAt);lastLapAt=state.elapsed;lapNumber=completed;}
 const signature=JSON.stringify({course:state.course,laps:state.laps,host:state.host,phase:state.phase,players:state.players.map(p=>[p.id,p.name,p.vehicleId,p.ready,p.connected,p.finishTime!==null,p.car.retired])});
 if(signature!==lobbySignature){lobbySignature=signature;
   $('roomCourse').value=state.course;$('roomLaps').value=String(state.laps);$('roomCourse').disabled=!room.host||racing;$('roomLaps').disabled=!room.host||racing||track.open;$('roomLaps').options[0].disabled=!track.open;
   $('roomVehicle').value=me.vehicleId;$('roomVehicle').disabled=racing;$('mapDriver').textContent=vehicleById(me.vehicleId).name;
   $('roomPlayers').replaceChildren(...state.players.map(p=>{const row=document.createElement('div');row.className='room-player';const name=document.createElement('b');name.textContent=p.name+(p.id===state.host?' / 房主':'')+(p.id===room.playerId?' / 你':'');const model=document.createElement('small');model.textContent=vehicleById(p.vehicleId).name;name.append(model);const status=document.createElement('span');status.textContent=!p.connected?'已離線':p.car.retired?'DNF':p.finishTime!==null?'已衝線':racing?'比賽中':p.ready?'✓ 已準備':'等候準備';status.dataset.ready=String(p.ready);row.append(name,status);return row;}));
   $('readyButton').textContent=me.ready?'取消準備':'準備比賽';$('readyButton').disabled=racing;$('hostStart').classList.toggle('hidden',!room.host);$('hostStart').disabled=racing||state.players.length<2||state.players.some(p=>!p.ready);
   $('hostEndRace').classList.toggle('hidden',!room.host||!racing);
   $('roomSummary').textContent=`房間 ${state.id.slice(0,8)} · ${state.players.filter(p=>p.connected).length} / 5 名真人`;
   $('onlineStatus').textContent=racing?'比賽進行中；暫停只會停止自己的操控。':state.players.length<2?'目前只有你一人；朋友加入後，這裡會出現第二位車手。':state.players.every(p=>p.ready)?'所有人準備完成，房主可以開始比賽。':'已連到同一房間。請每位車手按準備，等候房主發車。';
 }
 if(!netResultShown&&(me.car.retired||me.finishTime!==null||state.phase==='finished'))showOnlineResult(me);
 if(netResultShown&&state.phase==='finished')$('recordNote').textContent='本場已結束。返回房間後，可準備下一場賽事。';
}
function showOnlineResult(me){
 netResultShown=true;phase=me.car.retired?'retired':'finished';keys.clear();driverInput.reset();lastControls={throttle:0,brake:0,steer:0};finishPosition=position();
 $('results').classList.remove('hidden');$('pausePanel').classList.add('hidden');$('countdown').classList.add('hidden');$('nextStage').classList.add('hidden');
 $('resultEyebrow').textContent='ONLINE FRIENDS / 真人同場';$('resultPosition').textContent=me.car.retired?'DNF':'P'+finishPosition;
 $('resultTitle').textContent=me.car.retired?'損毀退賽':finishPosition===1?'VICTORY / 優勝':'FINISH / 完賽';$('resultTime').textContent=formatTime(me.finishTime??elapsed);$('resultLap').textContent=formatTime(bestLap);
 $('recordNote').textContent='其他車手仍可繼續比賽。返回房間可查看狀態；連線成績不影響單人闖關。';$('raceAgain').textContent='返回連線房間';
}
function onRoomDisconnected(){
 if(mode!=='online')return;keys.clear();driverInput.reset();lastControls={throttle:0,brake:0,steer:0};netPaused=true;$('results').classList.add('hidden');$('pausePanel').classList.add('hidden');$('onlinePanel').classList.remove('hidden');$('connectionForm').classList.remove('hidden');$('roomLobby').classList.add('hidden');$('onlineStatus').textContent='連線已中斷，本場已停止同步。可重新加入未開賽的房間，或返回單人模式。';
}
function leaveOnline(){
 room.close();clearOnlineVisuals();onlineState=null;netPaused=false;netResultShown=false;mode='campaign';$('onlinePanel').classList.add('hidden');$('connectionForm').classList.remove('hidden');$('roomLobby').classList.add('hidden');$('restart').classList.remove('hidden');$('raceAgain').textContent='重跑本場';$('pausePanel').querySelector('p').textContent='深呼吸，準備下一個彎。';
 const url=new URL(location.href);url.searchParams.delete('room');history.replaceState(null,'',url);prepareRace();
}
$('garageSelect').onchange=()=>{if(!loaded||mode==='online'||phase!=='menu')return;selectedVehicle=$('garageSelect').value;writeStored('gsx-vehicle-v1',selectedVehicle);resetRace(false);menuInfo();ai(vehicleById(selectedVehicle).name+' 已準備就緒。');};
$('roomVehicle').onchange=()=>room.send({type:'vehicle',vehicleId:$('roomVehicle').value});
$('onlineEntry').onclick=openOnline;$('createRoom').onclick=()=>joinOnline(true);$('joinRoom').onclick=()=>joinOnline(false);$('leaveRoom').onclick=leaveOnline;
$('closeOnline').onclick=()=>{if(room.id&&onlineState?.phase==='racing'&&!netResultShown){$('onlinePanel').classList.add('hidden');netPaused=false;}else leaveOnline();};
$('readyButton').onclick=()=>{const me=onlineState?.players.find(p=>p.id===room.playerId);room.send({type:'ready',ready:!me?.ready});};
$('hostStart').onclick=()=>room.send({type:'start'});
const roomSettings=()=>room.send({type:'settings',course:$('roomCourse').value,laps:Number($('roomLaps').value)});$('roomCourse').onchange=roomSettings;$('roomLaps').onchange=roomSettings;
$('hostEndRace').onclick=()=>room.send({type:'lobby'});
$('copyInvite').onclick=async()=>{try{await navigator.clipboard.writeText(room.invite);$('onlineStatus').textContent=connectionScope(room.origin)==='local'?'同機測試連結已複製；只能在這部電腦的另一個瀏覽器開啟。':'邀請連結已複製，請朋友開啟後輸入名稱並按加入房間。';}catch{$('inviteLink').select();$('onlineStatus').textContent='請手動複製上方已選取的連結。';}};
if(debug){$('debugPanel').classList.remove('hidden');$('debugCamera').onchange=e=>{camMode=e.target.value;updateCamera(1,true);};$('debugView').onchange=e=>{const mode=e.target.value;scene.traverse(o=>{if(o.isMesh&&o.material&&!Array.isArray(o.material))o.material.wireframe=mode==='wire';});world.setDebug(mode);};$('debugReset').onclick=()=>resetRace(false);}
if(debug)$('debugRouteInspect').onclick=()=>{if(!loaded||!track.open||mode==='online')return;resetRace(false);const anchor=track.anchors[Number($('debugRoutePoint').value)||0],s=track.nearest(anchor.x,anchor.z).s;player=createCar(track,s,0);phase='inspection';$('menu').classList.add('hidden');$('rivalGrid').classList.add('hidden');$('raceHUD').classList.remove('hidden');document.body.classList.add('racing');botVisuals.forEach(v=>v.root.visible=false);syncVisuals(0);updateCamera(1,true);notice('固定航點檢視 · 不計比賽 · 按重設返回');};
if(debug)$('debugCrash').onclick=()=>{
 if(!loaded)return;resetRace(true);phase='racing';$('countdown').classList.add('hidden');
 const preset=$('debugCrashLevel').value,p=track.at(80,8.82);Object.assign(player,{x:p.x,z:p.z,lastS:80,progress:80,yaw:p.yaw+(preset==='light'?Math.PI/6:Math.PI/2),speed:preset==='light'?14:preset==='medium'?45:105});
 updateCamera(1,true);notice('碰撞診斷：實際護欄撞擊');
};
if(debug)$('debugPit').onclick=()=>{
 if(!loaded)return;resetRace(true);phase='racing';$('countdown').classList.add('hidden');
 const p=track.at(PIT.bay,PIT.bayOffset);Object.assign(player,{x:p.x,z:p.z,lastS:PIT.bay,progress:PIT.bay,yaw:p.yaw,speed:0,boost:20});applyImpact(player,55,'front');
 updateCamera(1,true);notice('PIT 診斷：受損車停在維修格');
};
window.__GSX={get snapshot(){return{loaded,phase,elapsed,speed:player.speed*3.6,position:position(),lap:lapNumber+1,boost:player.boost,boosting:player.boosting,damage:player.damage,retired:player.retired,rivals:bots.map((b,i)=>({model:mode==='online'?b.vehicleId:b.modelId,damage:b.damage,retired:b.retired})),progress:player.progress,trackLength:track.length,camera:camMode,fps,drawCalls:renderer?.info.render.calls,triangles:renderer?.info.render.triangles,model:playerVehicleId()==='super-asurada-01'?'assets/super-asurada-01.glb':playerVehicleId()==='randoll-01'?'assets/randoll-01.glb':playerVehicleId()==='fire-superion-gtr'?'assets/fire-superion-gtr.glb':playerVehicleId()==='asurada-gsx'?'assets/asurada-gsx.glb':playerVehicleId(),sourceObjects:playerVehicleId()==='asurada-gsx'?514:undefined,mergedMeshes:playerVehicleVisual()?.meshCount,errors:[...errors]};}};
try{setup();}catch(e){fail(e);}


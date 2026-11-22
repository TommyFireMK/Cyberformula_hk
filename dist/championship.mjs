import {HK_COURSES} from './hk-routes.mjs';
const START=[[-70,-240],[100,-240],[235,-185],[290,-60]];
export const COURSES=[
 {id:'seaside',name:'海岸速道',label:'SEASIDE',tag:'高速直路 / 流暢長彎',theme:'coast',cornerSpeed:36,control:[...START,[245,55],[270,180],[180,260],[40,235],[-45,150],[-160,180],[-245,90],[-250,-65],[-180,-180]]},
 {id:'harbor',name:'海港工業環線',label:'HARBOR',tag:'貨櫃碼頭 / 連續複合彎',theme:'harbor',cornerSpeed:29,control:[...START,[330,90],[450,120],[470,260],[350,320],[260,240],[160,290],[20,270],[-40,180],[-170,180],[-270,70],[-260,-120],[-180,-180]]},
 {id:'alpine',name:'山嶺迴環',label:'ALPINE',tag:'山林環繞 / 技術急彎',theme:'alpine',cornerSpeed:27,control:[...START,[270,80],[355,170],[270,260],[150,210],[75,320],[-45,260],[-125,335],[-250,240],[-190,120],[-315,55],[-280,-85],[-180,-180]]},
 {id:'neon',name:'霓虹都市',label:'NEON CITY',tag:'夜間街道 / 煞車挑戰',theme:'neon',cornerSpeed:30,control:[...START,[385,30],[375,185],[290,235],[220,135],[120,135],[70,270],[-70,285],[-140,190],[-270,190],[-320,60],[-280,-90],[-180,-180]]},
 ...HK_COURSES
];
export const STAGES=[
 {id:'rookie',name:'初次出擊',course:'seaside',laps:2,rank:5,health:0,pits:0,pace:.80,goal:'完成 2 圈，熟習賽車操控。'},
 {id:'port',name:'海港突圍',course:'harbor',laps:2,rank:3,health:0,pits:0,pace:.88,goal:'完成 2 圈，取得前三名。'},
 {id:'survival',name:'山嶺生存戰',course:'alpine',laps:2,rank:5,health:35,pits:0,pace:.92,goal:'完成 2 圈，衝線時車況至少 35%。'},
 {id:'night',name:'霓虹追逐',course:'neon',laps:3,rank:3,health:0,pits:0,pace:.98,goal:'完成 3 圈，取得前三名。'},
 {id:'endurance',name:'維修耐力戰',course:'alpine',laps:3,rank:3,health:0,pits:1,pace:1,goal:'完成 3 圈、取得前三名，並完成至少 1 次 PIT 維修。'},
 {id:'champion',name:'極速總決賽',course:'neon',laps:3,rank:1,health:0,pits:0,pace:1.04,goal:'完成 3 圈，奪得第一名。'}
];
export const courseById=id=>COURSES.find(c=>c.id===id)||COURSES[0];
export function cleanSave(value){
 const save={version:1,cleared:[],best:{}};
 if(!value||value.version!==1||!Array.isArray(value.cleared))return save;
 // Only a contiguous run of completed stages can unlock the next stage.
 for(const s of STAGES){if(!value.cleared.includes(s.id))break;save.cleared.push(s.id);
   const b=value.best?.[s.id];if(b&&Number.isFinite(b.time)&&b.time>0&&Number.isInteger(b.position)&&b.position>=1&&b.position<=5)save.best[s.id]={time:b.time,position:b.position};
 }
 return save;
}
export const unlockedCount=save=>Math.min(STAGES.length,cleanSave(save).cleared.length+1);
export function evaluateStage(stage,result){
 const missing=[];
 if(!result||![result.laps,result.position,result.health,result.pitVisits].every(Number.isFinite)||!Number.isInteger(result.position)||result.position<1||result.position>5||result.health<0||result.health>100||!Number.isInteger(result.pitVisits)||result.pitVisits<0)return{passed:false,missing:['有效的完賽資料']};
 if(result.retired||!result.finished||result.laps<stage.laps)missing.push('完成所有圈數');
 if(result.position>stage.rank)missing.push(stage.rank===1?'取得第一名':`取得前 ${stage.rank} 名`);
 if(result.health+1e-6<stage.health)missing.push(`車況至少 ${stage.health}%`);
 if(result.pitVisits<stage.pits)missing.push(`完成 ${stage.pits} 次 PIT 維修`);
 return{passed:missing.length===0,missing};
}
export function completeStage(value,index,result){
 const save=cleanSave(value),stage=STAGES[index];
 if(!stage||index>=unlockedCount(save)||!evaluateStage(stage,result).passed)return{save,passed:false};
 if(!save.cleared.includes(stage.id))save.cleared.push(stage.id);
 if(Number.isFinite(result.time)&&result.time>0&&(!save.best[stage.id]||result.time<save.best[stage.id].time))save.best[stage.id]={time:result.time,position:result.position};
 return{save,passed:true};
}

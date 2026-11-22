// Pure shared catalogue: the server validates identities, clients own rendering.
export const VEHICLES=[
 {id:'asurada-gsx',name:'ASURADA GSX',team:'SUGO / 07',color:'#4d84d7',detail:'藍白 GSX · 追車及駕駛艙視角'},
 {id:'super-asurada-01',name:'SUPER ASURADA 01',team:'SUGO / 30',color:'#174fba',detail:'圖紙版六輪賽車 · 外露前懸吊 · 雙推進器 · 追車視角'},
 {id:'fire-superion-gtr',name:'FIRE SUPERION G.T.R',team:'AOI / 5',color:'#d82f25',detail:'紅橙六輪賽車 · 白色尾翼 · 追車視角'},
 {id:'randoll-01',name:'蘭度戰車 / RANDOLL 01',team:'WHITE SWAN / 1',color:'#eef1f0',detail:'白色四輪賽車 · 紫銀輪罩 · 雙天鵝尾翼 · 追車視角'},
 {id:'volt-r1',name:'VOLT R1',team:'11',color:'#e43c3e',detail:'開輪方程式 · 追車視角'},
 {id:'titan-gt',name:'TITAN GT',team:'24',color:'#25a69c',detail:'GT 房跑 · 追車視角'},
 {id:'phantom-x',name:'PHANTOM X',team:'36',color:'#9662d6',detail:'單噴口原型車 · 追車視角'},
 {id:'comet-lmp',name:'COMET LMP',team:'48',color:'#eab345',detail:'雙翼耐力車 · 追車視角'}
];
export const validVehicle=id=>VEHICLES.some(v=>v.id===id);
export const vehicleById=id=>VEHICLES.find(v=>v.id===id)||VEHICLES[0];
export const vehicleForSlot=slot=>['asurada-gsx','volt-r1','titan-gt','phantom-x','comet-lmp'][slot]||'asurada-gsx';

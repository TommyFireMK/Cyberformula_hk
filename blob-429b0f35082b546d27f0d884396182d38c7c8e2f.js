// The server simulates all human cars. Clients send controls, never positions or damage.
export function connectionScope(origin){
 const host=new URL(origin).hostname.toLowerCase();
 if(host==='localhost'||host.endsWith('.localhost')||host==='[::1]'||/^127\./.test(host))return 'local';
 if(/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host)||host.endsWith('.local'))return 'lan';
 return 'internet';
}
export function parseRoomInvite(value,currentOrigin){
 const text=value.trim();let code=text,target=null;
 if(text.includes('://')){
   let url;try{url=new URL(text);}catch{throw Error('邀請連結格式不正確。');}
   if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw Error('請使用 http 或 https 的遊戲邀請連結。');
   code=url.searchParams.get('room')||'';
   if(url.origin!==currentOrigin){target=new URL('/',url.origin);target.searchParams.set('room',code);}
 }
 if(!/^[a-f0-9]{24}$/.test(code))throw Error('請貼上完整房間邀請連結或 24 位代碼。');
 return{code,target:target?.href||null};
}
export class OnlineRoom{
 constructor(handlers){this.handlers=handlers;this.socket=null;this.id=null;this.playerId=null;this.state=null;this.intentional=false;this.latency=0;this.epoch=0;}
 async connect({room,name,course,vehicleId}){
   this.close();const epoch=this.epoch;this.intentional=false;this.id=null;this.state=null;
   if(this.epoch!==epoch)return;
   const socket=new WebSocket(`${location.protocol==='https:'?'wss:':'ws:'}//${location.host}/race`);this.socket=socket;
   this.joinTimer=setTimeout(()=>{if(socket!==this.socket||this.id)return;this.close();this.handlers.error?.('加入房間逾時。請確認房主仍在線，並索取最新邀請連結。');},12000);
   socket.onopen=()=>socket.send(JSON.stringify({type:'join',room,name,course,vehicleId}));
   socket.onmessage=e=>{
     if(socket!==this.socket)return;let msg;try{msg=JSON.parse(e.data);}catch{return;}
     if(msg.type==='joined'){clearTimeout(this.joinTimer);this.id=msg.room;this.playerId=msg.playerId;this.origin=msg.publicOrigin||location.origin;this.handlers.joined?.(msg);}
     else if(msg.type==='state'){this.state=msg;this.handlers.state?.(msg);}
     else if(msg.type==='error'){clearTimeout(this.joinTimer);this.handlers.error?.(msg.message);}
     else if(msg.type==='pong')this.latency=Math.round(performance.now()-msg.sent);
   };
   socket.onerror=()=>{if(socket===this.socket)this.handlers.error?.('連線未能建立，請確認房主的伺服器仍在開啟。');};
   socket.onclose=()=>{if(socket!==this.socket)return;this.socket=null;clearTimeout(this.joinTimer);clearInterval(this.pinger);if(!this.intentional)this.handlers.disconnected?.();};
   this.pinger=setInterval(()=>this.send({type:'ping',sent:performance.now()}),2000);
 }
 send(msg){if(this.socket?.readyState===WebSocket.OPEN)this.socket.send(JSON.stringify(msg));}
 controls(input){this.send({type:'input',input});}
 close(){this.epoch++;this.intentional=true;clearTimeout(this.joinTimer);clearInterval(this.pinger);if(this.socket){this.socket.close();this.socket=null;}this.id=null;this.playerId=null;this.state=null;}
 get host(){return this.state?.host===this.playerId;}
 get invite(){return this.id?`${this.origin}/?room=${this.id}`:'';}
}
